import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { fmtDateTime } from '@/features/applications/gmail/gmailLabels';
import { groupRequirements, overviewText } from '@/features/match/matchReport';
import { useApplications, useCvs, useGmail, useMatches, useProfile } from '@/shared/api/queries';
import { isProfileComplete } from '@/shared/lib/profile';
import type { Application, ApplicationStatus, MatchResult } from '@/shared/api/types';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { cn, firstName, fmtDate, greeting } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, CardTitle, Note, PageHeader, ProgressBar, STATUS_STYLE, StatusPill } from '@/shared/ui/Display';
import { Icon } from '@/shared/ui/Icons';
import { Skeleton } from '@/shared/ui/Spinner';
import { GmailHeaderAction, GmailHeaderStatus } from './DashboardGmail';
import { buildNextActions, CLOSED, isClosed, whenChip, type NextAction } from './nextActions';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ACTIVE: ApplicationStatus[] = ['Saved', 'Applied', 'Interview', 'Offer'];
const MAX_ACTIONS = 5;

const linkClass = 'inline-flex shrink-0 items-center gap-1 text-sm font-medium whitespace-nowrap text-primary hover:underline';

function StatusTile({ status, count }: { status: ApplicationStatus; count: number }) {
  return (
    <Link
      to={`/app/applications?status=${encodeURIComponent(status)}`}
      aria-label={`${status}: ${plural(count, 'application')}`}
      className={cn(
        STATUS_STYLE[status].pill,
        'flex min-h-[74px] min-w-0 flex-col justify-between gap-1.5 rounded-xl px-3.5 py-3 transition-transform hover:-translate-y-0.5',
      )}
    >
      <span className="font-display text-[26px] leading-none font-semibold tabular-nums">{count}</span>
      <span className="flex items-center gap-1.5 text-[13px] leading-tight font-semibold">
        <span aria-hidden className={cn('size-2 shrink-0 rounded-full', STATUS_STYLE[status].slab)} />
        <span className="truncate">{status}</span>
      </span>
    </Link>
  );
}

function Overview({ apps }: { apps: Application[] }) {
  const count = (s: ApplicationStatus) => apps.filter((a) => a.status === s).length;
  const closed = apps.filter((a) => isClosed(a.status)).length;
  return (
    <Card className="p-5 animate-in sm:p-6" style={{ animationDelay: '.06s' }}>
      <CardTitle
        action={
          <Link to="/app/applications" className={linkClass}>
            Open board <Icon.arrowRight />
          </Link>
        }
      >
        Application overview
        <span className="ml-2 hidden text-sm font-normal text-soft sm:inline">{plural(apps.length, 'application')}</span>
      </CardTitle>
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr] xl:gap-5">
        <div role="group" aria-labelledby="ov-active">
          <p id="ov-active" className="mb-2 text-xs font-semibold tracking-wide text-soft uppercase">
            In progress · {apps.length - closed}
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {ACTIVE.map((s) => (
              <StatusTile key={s} status={s} count={count(s)} />
            ))}
          </div>
        </div>
        <div role="group" aria-labelledby="ov-closed">
          <p id="ov-closed" className="mb-2 text-xs font-semibold tracking-wide text-soft uppercase">
            Closed · {closed}
          </p>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-2">
            {CLOSED.map((s) => (
              <StatusTile key={s} status={s} count={count(s)} />
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ActionRow({ action }: { action: NextAction }) {
  const { app } = action;
  const chip = whenChip(action.days, action.kind);
  const when =
    action.kind === 'scheduled' ? fmtDateTime(action.at) : action.kind === 'followUp' ? fmtDate(action.at, true) : '';
  return (
    <li>
      <Link
        to={action.to}
        className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-bg focus-visible:bg-bg"
      >
        <span
          aria-hidden
          className={cn(
            'mt-1.5 size-2 shrink-0 rounded-full',
            action.kind === 'review' ? 'bg-accent' : action.kind === 'scheduled' ? 'bg-st-interview' : 'bg-st-applied',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{action.label}</span>
            {chip && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  chip === 'Overdue' ? 'bg-danger-soft text-danger' : 'bg-tint text-ink',
                )}
              >
                {chip}
              </span>
            )}
          </span>
          <span className="block truncate text-sm text-soft">
            {app.company} · {app.jobTitle}
          </span>
          {(action.detail || when) && (
            <span className="block text-sm text-soft">
              {action.detail ?? (action.kind === 'followUp' ? `Your follow-up date: ${when}` : when)}
            </span>
          )}
        </span>
        <span aria-hidden className="mt-1 text-soft">
          <Icon.arrowRight />
        </span>
      </Link>
    </li>
  );
}

function NextActions({ actions }: { actions: NextAction[] }) {
  const shown = actions.slice(0, MAX_ACTIONS);
  const more = actions.length - shown.length;
  return (
    <Card className="h-full p-5 animate-in sm:p-6" style={{ animationDelay: '.12s' }}>
      <h2 id="next-actions-title" className={cn('text-[17px] font-semibold', shown.length > 0 && 'mb-2')}>
        Next actions
      </h2>
      {shown.length ? (
        <>
          <ul className="-mx-2 flex flex-col">
            {shown.map((a) => (
              <ActionRow key={a.key} action={a} />
            ))}
          </ul>
          {more > 0 && <p className="mt-2 text-sm text-soft">and {more} more on your applications.</p>}
        </>
      ) : (
        <p className="mt-1 flex items-center gap-2 text-sm text-soft">
          <span aria-hidden className="size-2 rounded-full bg-st-offer" />
          You’re all caught up. Nothing needs your attention right now.
        </p>
      )}
    </Card>
  );
}

function RecentApplications({ apps }: { apps: Application[] }) {
  return (
    <Card className="p-5 animate-in sm:p-6" style={{ animationDelay: '.18s' }}>
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
      <ul className="-mx-2 divide-y divide-line @container">
        {apps.slice(0, 5).map((a) => (
          <li key={a.id}>
            <Link
              to={`/app/applications/${a.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 rounded-xl px-2 py-3 transition-colors hover:bg-bg focus-visible:bg-bg @lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_88px_auto]"
            >
              <span className="truncate font-medium">{a.company}</span>
              <span className="row-start-2 truncate text-sm text-soft @lg:row-start-auto @lg:text-[15px]">
                {a.jobTitle}
              </span>
              <span className="row-start-2 text-right text-[13px] whitespace-nowrap text-soft @lg:row-start-auto @lg:text-left @lg:text-sm">
                {a.dateApplied ? (
                  <>
                    <span className="sr-only">Applied </span>
                    {fmtDate(a.dateApplied)}
                  </>
                ) : (
                  <span className="sr-only">No application date</span>
                )}
              </span>
              <StatusPill
                status={a.status}
                className="col-start-2 row-start-1 justify-self-end @lg:col-start-auto @lg:row-start-auto"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function LatestMatch({ match, error, onRetry }: { match?: MatchResult; error: boolean; onRetry: () => void }) {
  const scoreAvailable = match ? (match.scoreAvailable ?? true) : false;
  const score = useCountUp(match && scoreAvailable ? match.score : 0);
  const insight = match ? overviewText(match, groupRequirements(match)).text : '';
  return (
    <Card className="flex h-full flex-col p-5 animate-in sm:p-6" style={{ animationDelay: '.24s' }}>
      <CardTitle className="mb-3">Latest AI match</CardTitle>
      {match ? (
        <>
          <div className="flex items-center gap-4">
            <p className="shrink-0 font-display text-[40px] leading-none font-semibold tracking-tight tabular-nums">
              {scoreAvailable ? `${score}%` : '—'}
              {!scoreAvailable && <span className="sr-only">Score unavailable</span>}
            </p>
            <div className="min-w-0">
              <Link
                to={`/app/match/${match.id}`}
                className="line-clamp-2 font-medium break-words hover:underline"
              >
                {match.jobTitle}
              </Link>
              {match.company && <p className="truncate text-sm text-soft">{match.company}</p>}
            </div>
          </div>
          {scoreAvailable && <ProgressBar value={match.score} className="mt-3" label="Match score" />}
          {insight && <p className="mt-3 line-clamp-2 text-sm leading-relaxed break-words text-soft">{insight}</p>}
          <Link
            to={`/app/match/${match.id}/tailor`}
            className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-accent-ink hover:underline"
          >
            Tailor my CV for this job <Icon.arrowRight />
          </Link>
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
          <ButtonLink to="/app/match" variant="secondary" size="sm" className="mt-4 self-start">
            Check a job
          </ButtonLink>
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

  const actions = buildNextActions(list, { gmailConnected });

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
        <div className="flex flex-col gap-5" aria-busy="true">
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Skeleton className="h-72 rounded-2xl" />
            <Skeleton className="h-72 rounded-2xl" />
          </div>
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
        <div className="flex flex-col gap-5">
          <Overview apps={list} />
          {/* Phone: next actions, recent, match. Tablet: actions | match, then recent. Wide: recent | actions + match. */}
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
            <div className="min-w-0 md:col-start-1 md:row-start-1 xl:col-start-2">
              <NextActions actions={actions} />
            </div>
            <div className="min-w-0 md:col-span-2 md:row-start-2 xl:col-span-1 xl:col-start-1 xl:row-span-2 xl:row-start-1">
              <RecentApplications apps={list} />
            </div>
            <div className="min-w-0 md:col-start-2 md:row-start-1 xl:row-start-2">
              <LatestMatch match={last} error={matches.isError} onRetry={() => void matches.refetch()} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
