import type { ActivityType, Application, ApplicationStatus } from '@/shared/api/types';
import { activityLabel, isDeadline } from '@/features/applications/gmail/gmailLabels';
import { suggestionPhrase } from '@/shared/lib/utils';

export const CLOSED: ApplicationStatus[] = ['Rejected', 'Withdrawn'];
export const isClosed = (s: ApplicationStatus) => CLOSED.includes(s);

/** Follow-up dates the user set are shown when they are due within this many days (or already due). */
export const FOLLOW_UP_WINDOW_DAYS = 14;

export type NextActionKind = 'review' | 'scheduled' | 'followUp';

export interface NextAction {
  key: string;
  kind: NextActionKind;
  /** Short label, e.g. "Interview" or "Review Gmail update". */
  label: string;
  /** Absent only for Gmail reviews that are not linked to an application yet (e.g. a possible new one). */
  app?: Application;
  /** Extra sentence (reviews only). */
  detail?: string;
  /** The date the action is about: an ISO date-time (scheduled) or a YYYY-MM-DD date (follow-up). */
  at?: string;
  /** Whole calendar days from today to `at` (negative = overdue). */
  days?: number;
  to: string;
}

const DAY = 86_400_000;
const localDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** YYYY-MM-DD as a local calendar day, anything else via Date. */
const parse = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00` : s);
const daysFrom = (now: Date, at: Date) => Math.round((localDay(at) - localDay(now)) / DAY);

function scheduledLabel(t: ActivityType) {
  if (t === 'assessment') return 'Assessment due';
  if (t === 'deadline_extension') return 'Deadline';
  if (t === 'interview_invitation' || t === 'interview_rescheduled') return 'Interview';
  return activityLabel(t);
}

/**
 * Upcoming dates FlowJob actually knows for one application: Gmail activity with a verified `scheduledAt`
 * in the future. A time that a later email moved (`previousScheduledAt`) is superseded and dropped, and
 * repeated emails about the same time count once.
 */
function upcoming(app: Application, now: Date): NextAction[] {
  const events = app.activity ?? [];
  const moved = new Set(
    events.map((e) => (e.previousScheduledAt ? parse(e.previousScheduledAt).getTime() : NaN)).filter(Number.isFinite),
  );
  const seen = new Set<string>();
  const out: NextAction[] = [];
  for (const e of events) {
    if (!e.scheduledAt) continue;
    const at = parse(e.scheduledAt);
    const t = at.getTime();
    if (!Number.isFinite(t) || t < now.getTime() || moved.has(t)) continue;
    const kind = isDeadline(e.eventType) ? 'deadline' : 'event';
    if (seen.has(`${kind}:${t}`)) continue;
    seen.add(`${kind}:${t}`);
    out.push({
      key: `scheduled:${app.id}:${e.id}`,
      kind: 'scheduled',
      label: scheduledLabel(e.eventType),
      app,
      at: e.scheduledAt,
      days: daysFrom(now, at),
      to: `/app/applications/${app.id}`,
    });
  }
  return out;
}

/**
 * The Dashboard's next actions, most important first: pending Gmail suggestions (only while Gmail is
 * connected), then verified upcoming interview/assessment dates from Gmail, then follow-up dates the user
 * set themselves. Closed applications are skipped for dates. Nothing here is inferred from a status alone.
 */
export function buildNextActions(
  apps: Application[],
  opts: { gmailConnected: boolean; pendingReviewCount?: number; now?: Date },
): NextAction[] {
  const now = opts.now ?? new Date();

  const reviews: NextAction[] = opts.gmailConnected
    ? apps
        .filter((a) => a.suggestion)
        .sort((a, b) => (b.suggestion!.receivedAt ?? '').localeCompare(a.suggestion!.receivedAt ?? ''))
        .map((a) => ({
          key: `review:${a.suggestion!.id}`,
          kind: 'review',
          label: 'Review Gmail update',
          app: a,
          detail: `An email looks like ${suggestionPhrase(a.suggestion!.proposedStatus)}.`,
          to: `/app/applications/${a.id}`,
        }))
    : [];
  // Pending reviews the applications do not show (new applications, unclear matches) are reviewed on Applications.
  const unlinked = opts.gmailConnected ? Math.max(0, (opts.pendingReviewCount ?? 0) - reviews.length) : 0;
  if (unlinked > 0)
    reviews.push({
      key: 'review:unlinked',
      kind: 'review',
      label: 'Review Gmail emails',
      detail: `${unlinked} ${unlinked === 1 ? 'email needs' : 'emails need'} a quick decision.`,
      to: '/app/applications',
    });

  const scheduled = apps
    .filter((a) => !isClosed(a.status))
    .flatMap((a) => upcoming(a, now))
    .sort((a, b) => parse(a.at!).getTime() - parse(b.at!).getTime());

  const followUps = apps
    .filter((a) => !isClosed(a.status) && a.followUpDate)
    .map((a) => ({ a, at: parse(a.followUpDate!) }))
    .filter(({ at }) => Number.isFinite(at.getTime()) && daysFrom(now, at) <= FOLLOW_UP_WINDOW_DAYS)
    .sort((x, y) => x.at.getTime() - y.at.getTime())
    .map(
      ({ a, at }): NextAction => ({
        key: `followUp:${a.id}`,
        kind: 'followUp',
        label: 'Follow up',
        app: a,
        at: a.followUpDate!,
        days: daysFrom(now, at),
        to: `/app/applications/${a.id}`,
      }),
    );

  return [...reviews, ...scheduled, ...followUps];
}

/** "Today", "Tomorrow", "In 3 days", "Overdue" (follow-ups only), or null beyond a week. */
export function whenChip(days: number | undefined, kind: NextActionKind): string | null {
  if (days === undefined) return null;
  if (days < 0) return kind === 'followUp' ? 'Overdue' : null;
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 7) return `In ${days} days`;
  return null;
}
