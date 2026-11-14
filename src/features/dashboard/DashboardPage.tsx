import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApplications, useCvs, useGmail, useMatches, useProfile } from '@/shared/api/queries';
import { isProfileComplete } from '@/shared/lib/profile';
import type { Application } from '@/shared/api/types';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { cn, firstName, fmtDate, greeting, suggestionPhrase } from '@/shared/lib/utils';
import { ButtonLink } from '@/shared/ui/Button';
import {
  Card,
  CardTitle,
  Note,
  PageHeader,
  ProgressBar,
  STATUS_STYLE,
  StatusPill,
} from '@/shared/ui/Display';
import { Icon } from '@/shared/ui/Icons';
import { Skeleton } from '@/shared/ui/Spinner';

const STAIRS = ['Saved', 'Applied', 'Interview', 'Offer'] as const;

function Staircase({ apps }: { apps: Application[] }) {
  const count = (s: string) => apps.filter((a) => a.status === s).length;
  const heights = ['38%', '56%', '76%', '100%'];
  return (
    <div className="flex h-52 items-end gap-2.5 sm:gap-3">
      {STAIRS.map((s, i) => (
        <Link
          key={s}
          to={`/app/applications?status=${encodeURIComponent(s)}`}
          className={cn(
            STATUS_STYLE[s].slab,
            'flex min-w-0 flex-1 flex-col justify-between rounded-t-2xl rounded-b-md p-3 text-[#1c2b22] animate-grow transition-transform hover:-translate-y-1 sm:p-3.5',
          )}
          style={{ height: heights[i], animationDelay: `${0.15 + i * 0.1}s` }}
        >
          <span className="font-display text-3xl leading-none font-semibold">{count(s)}</span>
          <span className="text-[12px] leading-tight font-medium sm:text-[13px]">{s}</span>
        </Link>
      ))}
      <div className="hidden w-32 shrink-0 flex-col gap-2 self-end sm:flex">
        <span className="text-xs font-medium text-soft">Closed</span>
        {(['Rejected', 'Withdrawn'] as const).map((s) => (
          <div
            key={s}
            className={cn(STATUS_STYLE[s].pill, 'flex justify-between rounded-xl px-3 py-2.5 text-[13px]')}
          >
            <span>{s}</span>
            <span className="font-bold">{count(s)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ apps, pendingCount }: { apps: Application[]; pendingCount: number }) {
  const a = apps.find((x) => x.suggestion);
  return (
    <Card className="flex flex-col animate-in" style={{ animationDelay: '.12s' }}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className={cn('size-2.5 rounded-full', pendingCount ? 'bg-accent animate-pulse-dot' : 'bg-st-offer')} />
        <h2 className="text-[17px] font-semibold">{pendingCount ? 'Needs your review' : 'All caught up'}</h2>
        {pendingCount > 1 && <span className="ml-auto text-sm text-soft">{pendingCount} waiting</span>}
      </div>
      {pendingCount ? (
        <div className="flex flex-1 flex-col gap-3 animate-in">
          {a?.suggestion ? (
            <p className="leading-relaxed">
              <strong className="font-semibold">{a.company}</strong> sent an email that looks like{' '}
              <strong className="font-semibold">{suggestionPhrase(a.suggestion.proposedStatus)}</strong> for{' '}
              {a.jobTitle}.
            </p>
          ) : (
            <p className="leading-relaxed">Gmail found recruitment emails that need a quick decision.</p>
          )}
          <p className="text-[13px] text-soft">We never change a status without your approval.</p>
          <ButtonLink to="/app/applications" className="mt-auto self-start">
            Review in Applications
          </ButtonLink>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <p className="leading-relaxed text-soft">
            Nothing from Gmail needs a decision right now. Unclear emails will wait here for you.
          </p>
          <Link to="/app/applications" className="mt-auto text-sm font-medium text-primary hover:underline">
            Gmail on Applications
          </Link>
        </div>
      )}
    </Card>
  );
}

function GmailConnectNote() {
  const gmail = useGmail();
  if (!gmail.data?.available || gmail.data.connection.state !== 'not_connected') return null;

  return (
    <Note className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
      <span>Connect Gmail to add applications from confirmation emails and track replies.</span>
      <ButtonLink to="/app/applications" size="sm" variant="secondary">
        Connect Gmail
      </ButtonLink>
    </Note>
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
  const gmailConnected = !!gmail.data && gmail.data.connection.state !== 'not_connected';
  const profileComplete = isProfileComplete(profile.data);
  const last = matches.data?.[0];
  const score = useCountUp(last?.score ?? 0);

  const loading = apps.isLoading || cvs.isLoading || matches.isLoading;
  const list = apps.data ?? [];
  const isNew = !loading && (list.length === 0 || !cvs.data?.length);

  const active = list.filter((a) => a.status !== 'Rejected' && a.status !== 'Withdrawn').length;
  const interviews = list.filter((a) => a.status === 'Interview').length;
  const offers = list.filter((a) => a.status === 'Offer').length;

  const sub = isNew
    ? 'Three small steps and FlowJob starts working for you.'
    : list.length
      ? [
          `${active} application${active === 1 ? '' : 's'} in progress`,
          offers ? `${offers} offer${offers > 1 ? 's' : ''}` : interviews ? `${interviews} at interview` : '',
        ]
          .filter(Boolean)
          .join(' · ') + '.'
      : 'Here is where things stand.';

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user?.name)}.`}
        subtitle={sub}
        actions={
          !isNew && (
            <>
              <ButtonLink to="/app/applications/new" variant="secondary">
                Add application
              </ButtonLink>
              <ButtonLink to="/app/match">Check a job match</ButtonLink>
            </>
          )
        }
      />

      {loading ? (
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
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
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card className={cn('animate-in', !gmailConnected && 'lg:col-span-2')}>
            <CardTitle
              action={
                <Link to="/app/applications" className="text-sm font-medium text-primary hover:underline">
                  Open board
                </Link>
              }
            >
              Where your {list.length} applications stand
            </CardTitle>
            <Staircase apps={list} />
          </Card>
          {gmailConnected && <ReviewCard apps={list} pendingCount={gmail.data?.pendingReviewCount ?? 0} />}

          <Card className="animate-in" style={{ animationDelay: '.2s' }}>
            <CardTitle
              action={
                <Link to="/app/applications" className="text-sm font-medium text-primary hover:underline">
                  See all
                </Link>
              }
            >
              Recent applications
            </CardTitle>
            <ul className="-mx-2">
              {list.slice(0, 5).map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/app/applications/${a.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 rounded-xl px-2 py-3 transition-colors hover:bg-bg sm:grid-cols-[150px_1fr_70px_auto]"
                  >
                    <span className="truncate font-medium">{a.company}</span>
                    <span className="order-3 col-span-1 truncate text-sm text-soft sm:order-none sm:text-[15px]">
                      {a.jobTitle}
                    </span>
                    <span className="hidden text-sm text-soft sm:block">{fmtDate(a.dateApplied)}</span>
                    <StatusPill status={a.status} className="justify-self-end" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="flex flex-col animate-in" style={{ animationDelay: '.28s' }}>
            <CardTitle>Your last match</CardTitle>
            {last ? (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-[52px] leading-none font-semibold tracking-tight">
                    {score}%
                  </span>
                  <span className="text-[15px] text-soft">
                    {last.jobTitle}, {last.company}
                  </span>
                </div>
                <ProgressBar value={last.score} className="mt-4" label="Match score" />
                <p className="mt-4 text-sm leading-relaxed text-soft">{last.summary}</p>
                <Link
                  to={`/app/match/${last.id}/tailor`}
                  className="mt-auto inline-flex items-center gap-1.5 pt-4 font-medium text-accent-ink hover:underline"
                >
                  Tailor my CV for this job <Icon.arrowRight />
                </Link>
              </>
            ) : (
              <>
                <p className="leading-relaxed text-soft">
                  Paste a job post to see how your CV fits before you apply.
                </p>
                <ButtonLink to="/app/match" variant="secondary" className="mt-auto self-start">
                  Check a job
                </ButtonLink>
              </>
            )}
          </Card>
          <GmailConnectNote />
        </div>
      )}
    </>
  );
}
