import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useApplications, useCvs, useGmail, useMatches, useReviewSuggestion } from '@/shared/api/queries';
import type { Application } from '@/shared/api/types';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { cn, firstName, fmtDate, greeting, suggestionPhrase } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
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
import { useToast } from '@/shared/ui/Overlay';
import { Skeleton } from '@/shared/ui/Spinner';

const STAIRS = ['Applied', 'Under review', 'Interview', 'Offer'] as const;

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

function ReviewCard({ apps }: { apps: Application[] }) {
  const toast = useToast();
  const review = useReviewSuggestion();
  const pending = apps.filter((a) => a.suggestion);
  const a = pending[0];
  return (
    <Card className="flex flex-col animate-in" style={{ animationDelay: '.12s' }}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className={cn('size-2.5 rounded-full', a ? 'bg-accent animate-pulse-dot' : 'bg-st-offer')} />
        <h2 className="text-[17px] font-semibold">{a ? 'Needs your review' : 'All caught up'}</h2>
        {pending.length > 1 && <span className="ml-auto text-sm text-soft">{pending.length} waiting</span>}
      </div>
      {a?.suggestion ? (
        <div key={a.id} className="flex flex-1 flex-col gap-3 animate-in">
          <p className="leading-relaxed">
            <strong className="font-semibold">{a.company}</strong> sent an email that looks like{' '}
            <strong className="font-semibold">{suggestionPhrase(a.suggestion.proposedStatus)}</strong> for{' '}
            {a.jobTitle}.
          </p>
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm leading-relaxed">
            {a.suggestion.snippet}
          </p>
          <p className="text-[13px] text-soft">We never change a status on our own when we are unsure.</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-2">
            <Button
              loading={review.isPending && review.variables?.action === 'confirm'}
              onClick={() =>
                review.mutate(
                  { id: a.id, action: 'confirm' },
                  {
                    onSuccess: () =>
                      toast({ text: `${a.company} moved to ${a.suggestion!.proposedStatus}.` }),
                  },
                )
              }
            >
              Move to {a.suggestion.proposedStatus}
            </Button>
            <Button
              variant="secondary"
              disabled={review.isPending}
              onClick={() => review.mutate({ id: a.id, action: 'reject' })}
            >
              Not right
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <p className="leading-relaxed text-soft">
            Nothing from Gmail needs a decision right now. We will let you know when a reply is unclear.
          </p>
          <Link to="/app/settings" className="mt-auto text-sm font-medium text-primary hover:underline">
            Gmail settings
          </Link>
        </div>
      )}
    </Card>
  );
}

function Onboarding({ hasCv, hasMatch, hasApp }: { hasCv: boolean; hasMatch: boolean; hasApp: boolean }) {
  const steps = [
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
        action={<span className="text-sm text-soft">{steps.filter((s) => s.done).length} of 3 done</span>}
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
  const gmail = useGmail();
  const last = matches.data?.[0];
  const score = useCountUp(last?.score ?? 0);

  const loading = apps.isLoading || cvs.isLoading || matches.isLoading;
  const list = apps.data ?? [];
  const isNew = !loading && (list.length === 0 || !cvs.data?.length);
  const moved = list.filter(
    (a) => a.history.length > 1 && Date.now() - new Date(a.updatedAt).getTime() < 7 * 864e5,
  ).length;
  const waiting = list.filter((a) => a.suggestion).length;

  const sub = isNew
    ? 'Three small steps and FlowJob starts working for you.'
    : [
        moved
          ? `${moved} application${moved > 1 ? 's' : ''} moved forward this week.`
          : 'Here is where things stand.',
        waiting ? `${waiting} need${waiting > 1 ? '' : 's'} a quick look from you.` : '',
      ].join(' ');

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
          <Card className="animate-in">
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
          <ReviewCard apps={list} />

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
          {gmail.data && !gmail.data.connected && (
            <Note className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
              <span>Connect Gmail and replies from companies can update your applications for you.</span>
              <ButtonLink to="/app/settings" size="sm" variant="secondary">
                Connect Gmail
              </ButtonLink>
            </Note>
          )}
        </div>
      )}
    </>
  );
}
