import { useId, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useMatch } from '@/shared/api/queries';
import type { MatchResult, RequirementImportance, RequirementMatch } from '@/shared/api/types';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { cn, fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { EmptyState, ProgressBar } from '@/shared/ui/Display';
import { Skeleton } from '@/shared/ui/Spinner';

/** Legacy/demo results carry no importance, so it is optional for display. */
type Req = Omit<RequirementMatch, 'importance'> & { importance?: RequirementImportance };

const STATUS_LABEL: Record<string, string> = {
  clearly_demonstrated: 'Clearly demonstrated',
  partially_demonstrated: 'Partially demonstrated',
  not_mentioned: 'Not mentioned in the CV',
  uncertain: 'Unverified',
};

const SECTIONS = [
  {
    key: 'matched',
    title: 'Clearly matched',
    glyph: '✓',
    blurb: 'Requirements your CV clearly demonstrates.',
    empty: 'Nothing from this post shows clearly in your CV yet.',
    fallback: 'Clearly demonstrated',
    tone: 'bg-st-offer',
  },
  {
    key: 'partial',
    title: 'Partially matched',
    glyph: '◐',
    blurb: 'Related experience that covers the requirement only in part.',
    empty: 'No partial matches.',
    fallback: 'Partially demonstrated',
    tone: 'bg-st-review',
  },
  {
    key: 'missing',
    title: 'Missing or unverified',
    glyph: '?',
    blurb:
      'Not shown in your CV. That does not mean you lack them — add anything that is genuinely true.',
    empty: 'Nothing obvious is missing.',
    fallback: 'Not shown in the CV',
    tone: 'bg-accent',
  },
] as const;

function Panel({
  title,
  children,
  className,
  headingId,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  headingId: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn('rounded-2xl border border-line bg-surface p-5 sm:p-7 animate-in', className)}
    >
      {title && (
        <h2 id={headingId} className="mb-4 text-xl font-semibold">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function ReportLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5">
      <span className="sr-only">Loading your match report…</span>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

function externalHref(url: string) {
  // Always an http(s) URL — also neutralises any "javascript:"-style value.
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function JobDetails({ m }: { m: MatchResult }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const description = m.jobText?.trim();
  const rows: [string, ReactNode][] = [
    ['Job title', m.jobTitle],
    ['Company', m.company || null],
    [
      'Job URL',
      m.jobUrl ? (
        <a
          href={externalHref(m.jobUrl)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary break-all hover:underline"
        >
          {m.jobUrl.replace(/^https?:\/\//i, '')}
        </a>
      ) : null,
    ],
    ['CV used', m.cvName || 'Not available'],
    ['Analysed', m.createdAt ? fmtDate(m.createdAt, true) : null],
  ];

  return (
    <div className="mt-6 border-t border-line pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-primary hover:bg-tint"
      >
        <svg
          viewBox="0 0 24 24"
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {open ? 'Hide job details' : 'View job details'}
      </button>
      <div id={panelId} hidden={!open}>
        <dl className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[13px] text-soft">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
        </dl>
        <div className="mt-4">
          <p className="text-[13px] text-soft">Job description</p>
          {description ? (
            <p className="mt-1 max-h-72 overflow-auto rounded-xl bg-bg p-4 text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {description}
            </p>
          ) : (
            <p className="mt-1 text-sm text-soft">The full job description is not stored with this report.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RequirementCard({ r, fallback }: { r: Req; fallback: string }) {
  return (
    <li className="min-w-0 rounded-xl border border-line bg-bg/50 p-4">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="min-w-0 font-semibold break-words">{r.requirement}</h3>
        {r.importance && (
          <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] font-medium text-soft">
            {r.importance === 'required' ? 'Required' : 'Preferred'}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs font-medium text-soft">{(r.status && STATUS_LABEL[r.status]) || fallback}</p>
      {r.evidence && (
        <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line break-words text-soft">
          {r.evidence}
        </p>
      )}
    </li>
  );
}

function Report({ m }: { m: MatchResult }) {
  const scoreAvailable = m.scoreAvailable ?? true;
  const score = useCountUp(scoreAvailable ? m.score : 0, 1000, 100);
  const groups: Record<(typeof SECTIONS)[number]['key'], Req[]> = {
    matched:
      m.matched ?? (m.strengths ?? []).map((s) => ({ requirement: s.skill, evidence: s.evidence })),
    partial: m.partiallyMatched ?? [],
    missing: m.missing ?? (m.gaps ?? []).map((g) => ({ requirement: g.skill, evidence: g.tip })),
  };
  const assessment = m.overallAssessment ?? m.summary;
  const appQuery = new URLSearchParams({
    company: m.company ?? '',
    jobTitle: m.jobTitle,
    ...(m.jobUrl ? { jobUrl: m.jobUrl } : {}),
    ...(m.cvId ? { cvId: m.cvId } : {}),
  }).toString();
  const hasRecs = !!m.recommendations?.length || !!m.suggestedWording?.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <p className="text-sm font-medium text-soft">Job match report</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold break-words sm:text-[34px]">
          {m.jobTitle}
        </h1>
        <p className="mt-1.5 text-base break-words text-soft">
          {[m.company, m.cvName ? `CV used: ${m.cvName}` : ''].filter(Boolean).join(' · ')}
        </p>
      </header>

      <Panel headingId="overview-h" className="p-6 sm:p-8">
        <h2 id="overview-h" className="sr-only">
          Match overview
        </h2>
        <div className="grid gap-6 md:grid-cols-[230px_1fr] md:items-center md:gap-10">
          <div>
            {scoreAvailable ? (
              <p
                aria-hidden
                className="font-display text-[72px] leading-none font-semibold tracking-tight sm:text-[84px]"
              >
                {score}%
              </p>
            ) : (
              <p className="font-display text-[34px] leading-tight font-semibold">Score unavailable</p>
            )}
            <p className="mt-2 text-base font-semibold text-accent-ink">{m.verdict}</p>
          </div>
          <div className="min-w-0">
            {scoreAvailable && <ProgressBar value={m.score} label="Match score" />}
            <p className={cn('text-[16px] leading-relaxed break-words', scoreAvailable && 'mt-4')}>
              {assessment}
            </p>
            {m.scoreExplanation && (
              <p className="mt-3 text-sm leading-relaxed break-words text-soft">{m.scoreExplanation}</p>
            )}
            <p className="mt-3 text-[13px] leading-relaxed text-soft">
              A heuristic estimate of how well your CV evidence lines up with this post — not an employer ATS
              score, and not a prediction of hiring success.
            </p>
          </div>
        </div>
        <JobDetails m={m} />
      </Panel>

      {SECTIONS.map((s) => {
        const items = groups[s.key];
        return (
          <Panel
            key={s.key}
            headingId={`req-${s.key}`}
            title={
              <span className="flex flex-wrap items-center gap-3">
                <span
                  aria-hidden
                  className={cn('grid size-7 place-items-center rounded-full text-sm text-[#1c2b22]', s.tone)}
                >
                  {s.glyph}
                </span>
                {s.title}
                <span className="rounded-full bg-tint px-2.5 py-0.5 text-sm font-medium text-soft">
                  {items.length}
                </span>
              </span>
            }
          >
            <p className="-mt-2 mb-4 text-sm text-soft">{s.blurb}</p>
            {items.length ? (
              <ul className="grid gap-3 lg:grid-cols-2">
                {items.map((r, i) => (
                  <RequirementCard key={`${r.requirement}-${i}`} r={r} fallback={s.fallback} />
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-soft">{s.empty}</p>
            )}
          </Panel>
        );
      })}

      {hasRecs && (
        <Panel headingId="recs-h" title="How to improve your CV for this job">
          {!!m.recommendations?.length && (
            <ol className="flex flex-col gap-3">
              {m.recommendations.map((r, i) => (
                <li key={i} className="flex gap-3.5">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-tint text-xs font-semibold"
                  >
                    {i + 1}
                  </span>
                  <p className="min-w-0 text-[15px] leading-relaxed break-words">{r}</p>
                </li>
              ))}
            </ol>
          )}
          {!!m.suggestedWording?.length && (
            <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-soft">Stronger wording (based on your CV)</h3>
              {m.suggestedWording.map((w, i) => (
                <div key={i} className="rounded-xl bg-bg p-4">
                  <p className="text-[13px] font-medium text-soft capitalize">{w.section}</p>
                  <p className="mt-0.5 text-[15px] leading-relaxed break-words">{w.suggestion}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {!!m.questions?.length && (
        <Panel headingId="questions-h" title="A few things to confirm">
          <p className="-mt-2 mb-3 text-sm text-soft">
            Answer these honestly — only add something to your CV if it is true.
          </p>
          <ul className="flex flex-col gap-2.5">
            {m.questions.map((q, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                <span aria-hidden className="text-soft">
                  ?
                </span>
                <span className="min-w-0 break-words">{q}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel headingId="next-h" title="Next steps">
        <div className="flex flex-wrap items-center gap-3">
          <ButtonLink to={`/app/match/${m.id}/tailor`}>Tailor my CV for this job</ButtonLink>
          <ButtonLink to={`/app/applications/new?${appQuery}`} variant="secondary">
            Add to Applications
          </ButtonLink>
          <ButtonLink to="/app/match" variant="ghost">
            Start a new match
          </ButtonLink>
        </div>
        <p className="mt-4 text-[13px] text-soft">
          Tailoring creates a new CV version for you to review — it never changes your original, and FlowJob
          never adds skills you do not have.
        </p>
      </Panel>
    </div>
  );
}

/**
 * Step 2 of Job Match: the saved analysis as a focused, full-width report (no sidebar, no
 * input form). It only READS the saved match by id — it never starts a new analysis.
 */
export default function MatchReportPage() {
  const { matchId } = useParams();
  const { data: m, isLoading, isError, error, refetch, isFetching } = useMatch(matchId);
  useDocumentTitle(m ? `${m.jobTitle} · Match report` : 'Match report');

  if (isLoading) return <ReportLoading />;

  if (isError || !m) {
    const status = error instanceof ApiError ? error.status : 0;
    if (status === 404)
      return (
        <EmptyState
          title="Match report not found"
          text="It may have been deleted, or the link is not right."
          action={<ButtonLink to="/app/match">Back to Job Match</ButtonLink>}
        />
      );
    if (status === 401 || status === 403)
      return (
        <EmptyState
          title="You can’t open this report"
          text="Your session may have expired. Sign in again and retry."
          action={<ButtonLink to="/app/match">Back to Job Match</ButtonLink>}
        />
      );
    return (
      <EmptyState
        title="Could not load this report"
        text="Check your connection and try again."
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button loading={isFetching} onClick={() => refetch()}>
              Try again
            </Button>
            <ButtonLink to="/app/match" variant="secondary">
              Back to Job Match
            </ButtonLink>
          </div>
        }
      />
    );
  }

  return <Report key={m.id} m={m} />;
}
