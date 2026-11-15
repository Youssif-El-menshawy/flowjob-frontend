import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { GmailHeaderAction, GmailHeaderStatus } from '@/features/applications/gmail/GmailHeaderAction';
import { fmtDateTime } from '@/features/applications/gmail/gmailLabels';
import { groupRequirements, overviewText, snippet } from '@/features/match/matchReport';
import { useApplications, useCvs, useGmail, useMatches, useProfile } from '@/shared/api/queries';
import { isProfileComplete } from '@/shared/lib/profile';
import type { Application, ApplicationStatus, MatchResult } from '@/shared/api/types';
import { STATUSES } from '@/shared/api/types';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { cn, firstName, fmtDate, greeting } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardTitle, Note, PageHeader, STATUS_STYLE, StatusPill } from '@/shared/ui/Display';
import { Icon } from '@/shared/ui/Icons';
import { Skeleton } from '@/shared/ui/Spinner';

import { buildNextActions, isClosed, whenChip, type NextAction } from './nextActions';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const MAX_ACTIONS = 4;
/** Phones show four recent applications; wider layouts three, so the card lines up with the match card. */
const RECENT = 4;

const linkClass = 'inline-flex shrink-0 items-center gap-1 text-sm font-medium whitespace-nowrap text-primary hover:underline';

// --- Next actions: the focal point -------------------------------------------------------------

const KIND_STYLE: Record<NextAction['kind'], string> = {
  review: 'bg-accent-soft text-accent-ink',
  scheduled: STATUS_STYLE.Interview.pill,
  followUp: STATUS_STYLE.Applied.pill,
};
const CTA: Record<NextAction['kind'], string> = { review: 'Review', scheduled: 'View details', followUp: 'Open' };

function ActionCard({ action, wide }: { action: NextAction; wide?: boolean }) {
  const { app } = action;
  const chip = whenChip(action.days, action.kind);
  const footer =
    action.kind === 'scheduled'
      ? fmtDateTime(action.at)
      : action.kind === 'followUp'
        ? `Follow-up date: ${fmtDate(action.at, true)}`
        : app
          ? action.detail
          : 'Waiting in Needs Review on Applications.';
  return (
    <li className={cn('min-w-0', wide && '@md:col-span-2')}>
      <Link
        to={action.to}
        className="flex h-full flex-col gap-2 rounded-xl border border-line bg-bg/60 p-3.5 transition-colors hover:border-primary/40 hover:bg-tint/50 focus-visible:bg-tint/50"
      >
        <span className="flex items-center justify-between gap-2">
          <span className={cn('truncate rounded-full px-2.5 py-0.5 text-xs font-semibold', KIND_STYLE[action.kind])}>
            {action.label}
          </span>
          {chip && (
            <span
              className={cn(
                'shrink-0 text-xs font-semibold',
                chip === 'Overdue' ? 'text-danger' : chip === 'Today' || chip === 'Tomorrow' ? 'text-accent-ink' : 'text-soft',
              )}
            >
              {chip}
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{app ? app.company : action.detail}</span>
          {app && <span className="block truncate text-sm text-soft">{app.jobTitle}</span>}
        </span>
        <span className="mt-auto flex items-end justify-between gap-3 text-sm">
          <span className="min-w-0 text-soft">{footer}</span>
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-primary">
            {CTA[action.kind]} <Icon.arrowRight />
          </span>
        </span>
      </Link>
    </li>
  );
}

function NextActions({ actions, gmailAvailable }: { actions: NextAction[]; gmailAvailable: boolean }) {
  const shown = actions.slice(0, MAX_ACTIONS);
  const more = actions.length - shown.length;
  return (
    <Card className="flex h-full flex-col p-5 animate-in sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <h2 className="text-[17px] font-semibold">Next actions</h2>
        {actions.length > 0 && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary tabular-nums">
            {actions.length}
          </span>
        )}
      </div>
      {shown.length ? (
        <div className="@container">
          <ul className="grid gap-3 @md:grid-cols-2">
            {shown.map((a, i) => (
              // An odd last card takes the full row, so two columns never leave a half-empty row.
              <ActionCard key={a.key} action={a} wide={i === shown.length - 1 && shown.length % 2 === 1} />
            ))}
          </ul>
          {more > 0 && (
            <Link to="/app/applications" className={cn(linkClass, 'mt-3')}>
              {plural(more, 'more action')} on Applications <Icon.arrowRight />
            </Link>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-1 rounded-xl border border-dashed border-line px-4 py-5">
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden className="size-2 rounded-full bg-st-offer" />
            You’re all caught up.
          </p>
          <p className="text-sm leading-relaxed text-soft">
            {gmailAvailable
              ? 'Interview and assessment times from Gmail, emails to review and follow-up dates you set will appear here.'
              : 'Follow-up dates you set on your applications will appear here.'}
          </p>
        </div>
      )}
    </Card>
  );
}

// --- Compact overview -----------------------------------------------------------------------------

function StatusTile({ status, count }: { status: ApplicationStatus; count: number }) {
  return (
    <Link
      to={`/app/applications?status=${encodeURIComponent(status)}`}
      aria-label={`${status}: ${plural(count, 'application')}`}
      className={cn(
        STATUS_STYLE[status].pill,
        'flex min-w-0 items-center justify-between gap-2 rounded-xl px-3 py-2 transition-[filter] hover:brightness-95',
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold">
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATUS_STYLE[status].slab)} />
        <span className="truncate">{status}</span>
      </span>
      <span className="font-display text-lg leading-none font-semibold tabular-nums">{count}</span>
    </Link>
  );
}

function Overview({ apps }: { apps: Application[] }) {
  const count = (s: ApplicationStatus) => apps.filter((a) => a.status === s).length;
  const closed = apps.filter((a) => isClosed(a.status)).length;
  return (
    <Card className="flex h-full flex-col p-5 animate-in sm:p-6" style={{ animationDelay: '.06s' }}>
      <CardTitle
        className="mb-1"
        action={
          <Link to="/app/applications" className={linkClass}>
            Open board <Icon.arrowRight />
          </Link>
        }
      >
        Application overview
      </CardTitle>
      <p className="mb-3 text-sm text-soft">
        {plural(apps.length, 'application')} · {apps.length - closed} active · {closed} closed
      </p>
      <div className="grid flex-1 auto-rows-fr grid-cols-2 gap-2">
        {STATUSES.map((s) => (
          <StatusTile key={s} status={s} count={count(s)} />
        ))}
      </div>
    </Card>
  );
}

// --- Recent applications --------------------------------------------------------------------------

function RecentApplications({ apps }: { apps: Application[] }) {
  return (
    <Card className="h-full p-5 animate-in sm:p-6" style={{ animationDelay: '.12s' }}>
      <CardTitle
        className="mb-2"
        action={
          <Link to="/app/applications" className={linkClass}>
            See all <Icon.arrowRight />
          </Link>
        }
      >
        Recent applications
      </CardTitle>
      <ul className="-mx-2 divide-y divide-line">
        {apps.slice(0, RECENT).map((a, i) => (
          <li key={a.id} className={cn(i === 3 && 'md:hidden')}>
            <Link
              to={`/app/applications/${a.id}`}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bg focus-visible:bg-bg"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.company}</span>
                <span className="block truncate text-sm text-soft">{a.jobTitle}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <StatusPill status={a.status} />
                <span className="text-xs text-soft">
                  {a.dateApplied ? (
                    <>
                      <span className="sr-only">Applied </span>
                      {fmtDate(a.dateApplied)}
                    </>
                  ) : (
                    <span className="sr-only">No application date</span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// --- Latest AI match ------------------------------------------------------------------------------

/** The first sentence of the saved overview (cut at a word boundary if very long). Nothing is generated. */
function shortInsight(m: MatchResult): string {
  const text = overviewText(m, groupRequirements(m)).text.replace(/\s+/g, ' ').trim();
  const first = text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
  return snippet(first, 150);
}

function LatestMatch({ match, error, onRetry }: { match?: MatchResult; error: boolean; onRetry: () => void }) {
  const scoreAvailable = match ? (match.scoreAvailable ?? true) : false;
  const score = useCountUp(match && scoreAvailable ? match.score : 0);
  const insight = match ? shortInsight(match) : '';
  return (
    <Card className="flex h-full flex-col p-5 animate-in sm:p-6" style={{ animationDelay: '.18s' }}>
      <CardTitle className="mb-3">Latest AI match</CardTitle>
      {match ? (
        <>
          <div className="flex items-center gap-4">
            <p className="shrink-0 font-display text-[40px] leading-none font-semibold tracking-tight tabular-nums">
              {scoreAvailable ? `${score}%` : '—'}
              {!scoreAvailable && <span className="sr-only">Score unavailable</span>}
            </p>
            <div className="min-w-0">
              <Link to={`/app/match/${match.id}`} className="line-clamp-2 font-semibold break-words hover:underline">
                {match.jobTitle}
              </Link>
              {match.company && <p className="truncate text-sm text-soft">{match.company}</p>}
            </div>
          </div>
          {insight && <p className="mt-3 text-sm leading-relaxed break-words text-soft">{insight}</p>}
          <div className="mt-auto pt-4">
            <ButtonLink
              to={`/app/match/${match.id}/tailor`}
              size="sm"
              aria-label={`Tailor CV for ${match.jobTitle}${match.company ? ` at ${match.company}` : ''}`}
            >
              Tailor CV <Icon.arrowRight />
            </ButtonLink>
          </div>
        </>
      ) : error ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-danger">
            Could not load your latest match.
          </p>
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-soft">Paste a job post to see how your CV fits before you apply.</p>
          <div className="mt-auto pt-4">
            <ButtonLink to="/app/match" variant="secondary" size="sm">
              Check a job
            </ButtonLink>
          </div>
        </>
      )}
    </Card>
  );
}

function Onboarding({
  profileComplete,
  hasCv,
  hasMatch,
  hasApp,
}: {
  profileComplete: boolean;
  hasCv: boolean;
  hasMatch: boolean;
  hasApp: boolean;
}) {
  const steps = [
    // Shown only while the profile is incomplete; disappears once it meets the criteria.
    ...(profileComplete
      ? []
      : [
          {
            done: false,
            t: 'Complete your profile',
            d: 'Add your experience, education, and skills to make creating CVs faster.',
            to: '/app/profile',
            cta: 'Complete profile',
          },
        ]),
    {
      done: hasCv,
      t: 'Create your CV',
      d: 'A guided form, about ten minutes. You can download it as PDF.',
      to: '/app/cv-builder',
      cta: 'Start my CV',
    },
    {
      done: hasMatch,
      t: 'Check a job match',
      d: pendingJob.get()
        ? `Your saved job is waiting: ${pendingJob.label()}.`
        : 'Paste a job post and see your fit before you apply.',
      to: '/app/match',
      cta: 'Check a job',
    },
    {
      done: hasApp,
      t: 'Add an application',
      d: 'Keep every job you applied for in one place.',
      to: '/app/applications/new',
      cta: 'Add one',
    },
  ];
  return (
    <Card className="animate-in">
      <CardTitle
        action={
          <span className="text-sm text-soft">
            {steps.filter((s) => s.done).length} of {steps.length} done
          </span>
        }
      >
        Let’s get you set up
      </CardTitle>
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li
            key={s.t}
            className="flex flex-wrap items-center gap-4 border-t border-line py-4 first:border-t-0"
          >
            <span
              className={cn(
                'grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold',
                s.done ? 'bg-primary text-on-primary' : 'bg-tint',
              )}
            >
              {s.done ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn('font-medium', s.done && 'text-soft line-through')}>{s.t}</p>
              <p className="text-sm text-soft">{s.d}</p>
            </div>
            {!s.done && (
              <ButtonLink
                to={s.to}
                variant={i === steps.findIndex((x) => !x.done) ? 'primary' : 'secondary'}
                size="sm"
              >
                {s.cta}
              </ButtonLink>
            )}
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const apps = useApplications();
  const cvs = useCvs();
  const matches = useMatches();
  const profile = useProfile();
  const gmail = useGmail();
  const gmailState = gmail.data?.connection.state;
  const gmailConnected = gmailState === 'active' || gmailState === 'reauth_required';
  const profileComplete = isProfileComplete(profile.data);
  const last = matches.data?.[0];

  const loading = apps.isLoading || cvs.isLoading || matches.isLoading;
  // Without applications or CVs we cannot tell a new user from a failed request, so say so instead of guessing.
  const failed = !loading && (apps.isError || cvs.isError);
  const list = apps.data ?? [];
  const isNew = !loading && !failed && (list.length === 0 || !cvs.data?.length);

  const active = list.filter((a) => !isClosed(a.status)).length;
  const interviews = list.filter((a) => a.status === 'Interview').length;
  const offers = list.filter((a) => a.status === 'Offer').length;

  const sub = loading
    ? 'Loading your applications…'
    : failed
      ? 'Here is where things stand.'
      : isNew
        ? 'Three small steps and FlowJob starts working for you.'
        : [
            `${plural(active, 'active application')}`,
            interviews && `${interviews} at interview`,
            offers && plural(offers, 'offer'),
          ]
            .filter(Boolean)
            .join(' · ') + '.';

  const actions = buildNextActions(list, { gmailConnected, pendingReviewCount: gmail.data?.pendingReviewCount });

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user?.name)}.`}
        subtitle={
          <>
            {sub}
            <GmailHeaderStatus />
          </>
        }
        actions={
          <>
            {/* Gmail is the secondary action (Add application only when Gmail is not available on this server). */}
            <GmailHeaderAction
              fallback={
                !isNew && (
                  <ButtonLink to="/app/applications/new" variant="secondary">
                    Add application
                  </ButtonLink>
                )
              }
            />
            {!isNew && <ButtonLink to="/app/match">Check a job match</ButtonLink>}
          </>
        }
      />

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]" aria-busy="true">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-60 rounded-2xl" />
          <Skeleton className="h-60 rounded-2xl" />
        </div>
      ) : failed ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="text-danger">
            Could not load your applications and CVs.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void apps.refetch();
              void cvs.refetch();
            }}
          >
            Retry
          </Button>
        </Card>
      ) : isNew ? (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="flex flex-col gap-5">
            <Onboarding
              profileComplete={profileComplete}
              hasCv={!!cvs.data?.length}
              hasMatch={!!matches.data?.length}
              hasApp={list.length > 0}
            />
          </div>
          <Note className="h-fit p-6">
            <p className="font-display text-lg font-semibold">How FlowJob helps</p>
            <p className="mt-2 text-soft">
              Your CV, your matches and your applications all live together, so each step makes the next one
              easier.
            </p>
          </Note>
        </div>
      ) : (
        // Phone: one column in this order. Tablet and up: the overview beside next actions, then recent beside match.
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <Overview apps={list} />
          </div>
          <div className="min-w-0">
            <NextActions actions={actions} gmailAvailable={!!gmail.data?.available || gmailConnected} />
          </div>
          <div className="min-w-0">
            <RecentApplications apps={list} />
          </div>
          <div className="min-w-0">
            <LatestMatch match={last} error={matches.isError} onRetry={() => void matches.refetch()} />
          </div>
        </div>
      )}
    </>
  );
}
