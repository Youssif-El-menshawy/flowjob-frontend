import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { GmailHeaderAction, GmailHeaderStatus } from '@/features/applications/gmail/GmailHeaderAction';
import { fmtDateTime } from '@/features/applications/gmail/gmailLabels';
import { groupRequirements, overviewText, snippet } from '@/features/match/matchReport';
import { useApplications, useCvs, useGmail, useMatches, useProfile, useProfileImportStatus } from '@/shared/api/queries';
import { isProfileComplete, profileStrength } from '@/shared/lib/profile';
import type { Application, ApplicationStatus, MatchResult, Profile } from '@/shared/api/types';
import { STATUSES } from '@/shared/api/types';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { cn, firstName, fmtDate, greeting } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardTitle, Note, PageHeader, ProgressBar, STATUS_STYLE, StatusPill } from '@/shared/ui/Display';
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

interface Suggestion {
  text: string;
  to: string;
  cta: string;
}

function NextActions({ actions, gmailAvailable, suggestion }: {
  actions: NextAction[];
  gmailAvailable: boolean;
  suggestion?: Suggestion;
}) {
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
          {suggestion && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <p className="min-w-0 text-sm break-words">{suggestion.text}</p>
              <ButtonLink to={suggestion.to} size="sm" variant="secondary" className="shrink-0">
                {suggestion.cta} <Icon.arrowRight />
              </ButtonLink>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// --- Compact overview -----------------------------------------------------------------------------

/** The stages an application moves through, in order. Rejected and Withdrawn are outcomes, shown apart. */
const PIPELINE: ApplicationStatus[] = ['Saved', 'Applied', 'Interview', 'Offer'];

/** One bar of the overview chart. Its height is the stage's share of the fullest stage, so the chart never
 *  suggests more than the numbers say; an empty stage is a thin baseline. */
function StageBar({ status, count, max, step }: { status: ApplicationStatus; count: number; max: number; step: number }) {
  const height = count ? Math.max(10, Math.round((82 * count) / Math.max(max, 1))) : 0;
  return (
    <Link
      to={`/app/applications?status=${encodeURIComponent(status)}`}
      aria-label={`${status}: ${plural(count, 'application')}`}
      className="group flex h-full min-w-0 flex-1 flex-col gap-2"
    >
      <span className="relative min-h-0 flex-1">
        <span
          className={cn(
            'absolute inset-x-0 text-center font-display text-2xl leading-none font-semibold tabular-nums',
            count === 0 && 'text-soft/50',
          )}
          style={{ bottom: count ? `calc(${height}% + 6px)` : '10px' }}
        >
          {count}
        </span>
        <span
          aria-hidden
          className={cn(
            STATUS_STYLE[status].slab,
            'absolute inset-x-0 bottom-0 rounded-t-xl rounded-b-sm animate-grow transition-[filter] group-hover:brightness-95',
            count === 0 && 'opacity-50',
          )}
          style={{ height: count ? `${height}%` : '4px', animationDelay: `${0.1 + step * 0.08}s` }}
        />
      </span>
      <span className="truncate text-center text-[12px] leading-tight font-medium text-soft sm:text-[13px]">{status}</span>
    </Link>
  );
}

function ClosedPill({ status, count }: { status: ApplicationStatus; count: number }) {
  return (
    <Link
      to={`/app/applications?status=${encodeURIComponent(status)}`}
      aria-label={`${status}: ${plural(count, 'application')}`}
      className={cn(
        STATUS_STYLE[status].pill,
        'flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-[13px] transition-[filter] hover:brightness-95 sm:flex-none',
      )}
    >
      <span className="truncate">{status}</span>
      <span className="font-bold tabular-nums">{count}</span>
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
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
        {/* A fixed height in both layouts: stacked on a phone (so it must not flex away), beside the pills from sm up. */}
        <div className="flex h-44 min-w-0 flex-none items-stretch gap-2.5 border-b border-line sm:h-48 sm:flex-1 sm:gap-4">
          {PIPELINE.map((s, i) => (
            <StageBar key={s} status={s} count={count(s)} max={Math.max(...PIPELINE.map(count))} step={i} />
          ))}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:w-32 sm:flex-col sm:items-stretch">
          <span className="w-full text-xs font-medium text-soft">Closed</span>
          {STATUSES.filter((s) => !PIPELINE.includes(s)).map((s) => (
            <ClosedPill key={s} status={s} count={count(s)} />
          ))}
        </div>
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

type SetupKey = 'profile' | 'cv' | 'match' | 'application';

interface SetupStep {
  key: SetupKey;
  title: string;
  done: boolean;
}

/** A green check for completed setup steps (decorative; the step's text says it is completed). */
function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5 10 17.5 19 7.5" />
    </svg>
  );
}

/** Add-application link, prefilled from the latest match when there is one (as the activity Dashboard does). */
function newApplicationLink(last: MatchResult | undefined) {
  return last
    ? `/app/applications/new?${new URLSearchParams({ company: last.company ?? '', jobTitle: last.jobTitle }).toString()}`
    : '/app/applications/new';
}

/** One way to do the next step, as a tile inside the next-step card. */
function ChoiceTile({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-surface p-4">
      <p className="font-medium">{title}</p>
      <p className="text-sm leading-relaxed text-soft">{text}</p>
      <div className="mt-auto pt-2.5">{action}</div>
    </div>
  );
}

/** What the next step involves, then its action. */
function StepPoints({ points, action }: { points: string[]; action: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <ul className="grid gap-2.5 sm:grid-cols-3">
        {points.map((point) => (
          <li key={point} className="rounded-xl bg-surface px-4 py-3 text-sm leading-snug">
            {point}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2.5">{action}</div>
    </div>
  );
}

/**
 * The Dashboard before the first application: setup progress, the next step and the one after it. Every step is
 * judged from saved data only: a complete saved Profile, a saved CV, a job match, an application.
 */
function SetupDashboard({
  profile,
  canImport,
  hasCv,
  hasMatch,
  hasApp,
  lastMatch,
}: {
  profile: Profile | undefined;
  canImport: boolean;
  hasCv: boolean;
  hasMatch: boolean;
  hasApp: boolean;
  lastMatch: MatchResult | undefined;
}) {
  const steps: SetupStep[] = [
    { key: 'profile', title: 'Set up your profile', done: isProfileComplete(profile) },
    { key: 'cv', title: 'Create your CV', done: hasCv },
    { key: 'match', title: 'Check a job match', done: hasMatch },
    { key: 'application', title: 'Add an application', done: hasApp },
  ];
  const open = steps.filter((step) => !step.done);
  const next = open[0];
  const later = open[1];
  const completed = steps.length - open.length;
  // The Profile sections the completion check still needs (Projects are optional).
  const missing = profile
    ? profileStrength(profile).checks.filter((check) => !check.done && check.label !== 'Projects').map((check) => check.label)
    : [];

  const details: Record<SetupKey, {
    text: string;
    body: ReactNode;
    upcoming: string;
    link: { to: string; cta: string };
  }> = {
    profile: {
      text: 'Your CVs and job matches are made from your Profile.'
        + (missing.length && missing.length < 6 ? ` Still missing: ${missing.join(', ')}.` : ''),
      body: (
        <div className={cn('grid gap-3', canImport && 'sm:grid-cols-2')}>
          {canImport && (
            <ChoiceTile
              title="Import your CV"
              text="Upload a PDF. FlowJob fills in your Profile, and you review everything before it is saved."
              action={<ButtonLink to="/app/profile/import" size="sm">Import CV</ButtonLink>}
            />
          )}
          <ChoiceTile
            title="Fill it in yourself"
            text="Add your experience, education and skills, section by section."
            action={
              <ButtonLink to="/app/profile" size="sm" variant={canImport ? 'secondary' : 'primary'}>
                {canImport ? 'Complete manually' : 'Complete my profile'}
              </ButtonLink>
            }
          />
        </div>
      ),
      upcoming: 'Fill in your Profile once. Your CVs start from it.',
      link: { to: '/app/profile', cta: 'Open my Profile' },
    },
    cv: {
      text: 'Your Profile is ready. Create your original CV from it in the CV Builder.',
      body: (
        <StepPoints
          points={['Starts from your Profile, so most of it is already filled in', 'Edit each section with a preview of the PDF', 'Download it as a PDF when it’s ready']}
          action={<ButtonLink to="/app/cv-builder">Create my CV</ButtonLink>}
        />
      ),
      upcoming: 'Your original CV is made from your Profile, so most of it is already filled in.',
      link: { to: '/app/cv-builder', cta: 'Open CV builder' },
    },
    match: {
      text: pendingJob.get()
        ? `Your saved job is waiting: ${pendingJob.label()}. See how well your CV fits it before you apply.`
        : 'Found a job you like? See how well your CV fits before you apply.',
      body: (
        <StepPoints
          points={['Paste the job post', 'See which of its requirements your CV shows', 'Tailor a copy of your CV for the job']}
          action={<ButtonLink to="/app/match">Check a job</ButtonLink>}
        />
      ),
      upcoming: 'Paste a job post and see how well your CV fits before you apply.',
      link: { to: '/app/match', cta: 'Check a job' },
    },
    application: {
      text: lastMatch
        ? `Applied for ${lastMatch.jobTitle}${lastMatch.company ? ` at ${lastMatch.company}` : ''}? Add it to keep track of it.`
        : 'Keep every job you apply for in one place.',
      body: (
        <StepPoints
          points={['Track its status from Saved to Offer', 'Set a follow-up date so nothing slips', 'Attach the CV you sent']}
          action={<ButtonLink to={newApplicationLink(lastMatch)}>Add application</ButtonLink>}
        />
      ),
      upcoming: 'Keep every job you apply for in one place.',
      link: { to: newApplicationLink(lastMatch), cta: 'Add application' },
    },
  };

  return (
    // Desktop: the next step fills the left column beside progress and the step after it. Phone: stacked in order.
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      {next && (
        <article
          aria-labelledby="setup-next-step"
          className="flex flex-col gap-4 rounded-2xl bg-accent-soft p-6 animate-in sm:p-8 lg:row-span-2"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="setup-next-step" className="text-sm font-semibold tracking-wide text-accent-ink uppercase">
              Your next step
            </h2>
            <span className="text-sm text-soft">
              Step {steps.indexOf(next) + 1} of {steps.length}
            </span>
          </div>
          <h3 className="font-display text-[26px] leading-tight font-semibold sm:text-[30px]">{next.title}</h3>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink/80">{details[next.key].text}</p>
          <div className="mt-auto pt-1">{details[next.key].body}</div>
        </article>
      )}

      <Card className="animate-in">
        <CardTitle
          action={
            <span className="text-sm text-soft">
              {completed} of {steps.length} completed
            </span>
          }
        >
          Your setup progress
        </CardTitle>
        <ProgressBar value={Math.round((completed / steps.length) * 100)} tone="primary" label="Setup progress" />
        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((step, index) => (
            <li key={step.key} className="flex items-center gap-3 text-[15px]">
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  step.done ? 'bg-primary text-on-primary' : step === next ? 'bg-accent text-[#1c2b22]' : 'bg-tint text-soft',
                )}
              >
                {step.done ? <CheckMark /> : index + 1}
              </span>
              <span className={cn('min-w-0 flex-1', step.done || step === next ? 'text-ink' : 'text-soft', step === next && 'font-medium')}>
                {step.title}
                {step.done && <span className="sr-only"> (completed)</span>}
              </span>
              {step === next && <span className="shrink-0 text-xs font-medium text-primary">Next</span>}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="animate-in">
        <CardTitle>Coming up next</CardTitle>
        {later ? (
          <>
            <p className="font-medium">{later.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-soft">{details[later.key].upcoming}</p>
            <ButtonLink to={details[later.key].link.to} variant="secondary" size="sm" className="mt-4">
              {details[later.key].link.cta}
            </ButtonLink>
          </>
        ) : (
          <>
            <p className="font-medium">Your activity dashboard</p>
            <p className="mt-1 text-sm leading-relaxed text-soft">
              Once you add an application, this page shows your application overview, next actions and latest match.
            </p>
            <ButtonLink to="/app/applications" variant="secondary" size="sm" className="mt-4">
              Open Applications
            </ButtonLink>
          </>
        )}
      </Card>
    </div>
  );
}

/** After a Profile import: the next step is an original CV made from the Profile (existing CVs are untouched). */
function ProfileSaved({ hasCv, onDismiss }: { hasCv: boolean; onDismiss: () => void }) {
  return (
    <div role="status" className="mb-5">
      <Note tone="success" className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="font-medium">Your Profile is saved.</p>
          <p className="mt-1 text-soft">
            {hasCv
              ? 'Your existing CVs and tailored CVs were not changed. Edit your Profile any time.'
              : 'Next, create your original CV from it. Later changes to your Profile won’t change CVs you have already made.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasCv ? (
            <ButtonLink to="/app/profile" variant="secondary" size="sm">Open my Profile</ButtonLink>
          ) : (
            <ButtonLink to="/app/cv-builder" size="sm">Create my CV from my Profile</ButtonLink>
          )}
          <Button variant="ghost" size="sm" onClick={onDismiss}>Dismiss</Button>
        </div>
      </Note>
    </div>
  );
}

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const apps = useApplications();
  const cvs = useCvs();
  const matches = useMatches();
  const profile = useProfile();
  const importStatus = useProfileImportStatus();
  const gmail = useGmail();
  const location = useLocation();
  const nav = useNavigate();
  // Set by the Profile import after a successful save.
  const justImported = !!(location.state as { profileImported?: boolean } | null)?.profileImported;
  const gmailState = gmail.data?.connection.state;
  const gmailConnected = gmailState === 'active' || gmailState === 'reauth_required';
  const last = matches.data?.[0];

  // The setup steps come from the saved Profile, so wait for it rather than briefly showing it as incomplete.
  const loading = apps.isLoading || cvs.isLoading || matches.isLoading || profile.isLoading;
  // Without applications or CVs we cannot tell a new user from a failed request, so say so instead of guessing.
  const failed = !loading && (apps.isError || cvs.isError);
  const list = apps.data ?? [];
  // Until the first application exists, the Dashboard guides the setup; after that it shows the activity.
  const isNew = !loading && !failed && list.length === 0;

  const active = list.filter((a) => !isClosed(a.status)).length;
  const interviews = list.filter((a) => a.status === 'Interview').length;
  const offers = list.filter((a) => a.status === 'Offer').length;

  const sub = loading
    ? 'Loading your applications…'
    : failed
      ? 'Here is where things stand.'
      : isNew
        ? 'A few small steps and FlowJob starts working for you.'
        : [
            `${plural(active, 'active application')}`,
            interviews && `${interviews} at interview`,
            offers && plural(offers, 'offer'),
          ]
            .filter(Boolean)
            .join(' · ') + '.';

  const actions = buildNextActions(list, { gmailConnected, pendingReviewCount: gmail.data?.pendingReviewCount });
  // With nothing due, point at the most useful thing to do next instead of an empty box.
  // Tailored already: a version was saved from this match, or the match itself was run on a tailored version.
  const tailoredForLast = !!last && !!cvs.data?.some((cv) => cv.kind === 'tailored' && (cv.matchId === last.id || cv.id === last.cvId));
  const tracksLast = !!last && list.some((a) => a.company === last.company && a.jobTitle === last.jobTitle);
  const suggestion: Suggestion =
    last && !tailoredForLast
      ? { text: `Tailor your CV for ${last.jobTitle}${last.company ? ` at ${last.company}` : ''}.`, to: `/app/match/${last.id}`, cta: 'Open match' }
      : last && !tracksLast
        ? {
            text: `Applied for ${last.jobTitle}? Keep track of it.`,
            to: `/app/applications/new?${new URLSearchParams({ company: last.company ?? '', jobTitle: last.jobTitle }).toString()}`,
            cta: 'Add application',
          }
        : { text: 'Found a job you like? See how your CV fits before you apply.', to: '/app/match', cta: 'Check a job' };

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

      {justImported && !loading && (
        <ProfileSaved hasCv={!!cvs.data?.length} onDismiss={() => nav('.', { replace: true, state: null })} />
      )}

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
        <SetupDashboard
          profile={profile.data}
          canImport={!!importStatus.data?.available}
          hasCv={!!cvs.data?.length}
          hasMatch={!!matches.data?.length}
          hasApp={list.length > 0}
          lastMatch={last}
        />
      ) : (
        // Phone: one column in this order. Tablet and up: the overview beside next actions, then recent beside match.
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <Overview apps={list} />
          </div>
          <div className="min-w-0">
            <NextActions actions={actions} gmailAvailable={!!gmail.data?.available || gmailConnected} suggestion={suggestion} />
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
