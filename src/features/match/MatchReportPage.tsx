import { useId, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useMatch } from '@/shared/api/queries';
import type { MatchResult } from '@/shared/api/types';
import { defaultTab, groupRequirements, pickTop, type Groups, type Req, type TabKey } from './matchReport';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { cn, fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { EmptyState, ProgressBar } from '@/shared/ui/Display';
import { Skeleton } from '@/shared/ui/Spinner';

const STATUS_LABEL: Record<string, string> = {
  clearly_demonstrated: 'Clearly demonstrated',
  partially_demonstrated: 'Partially demonstrated',
  not_mentioned: 'Not mentioned in the CV',
  uncertain: 'Unverified',
};


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

const TABS: { key: TabKey; label: string; hint: string; empty: string; fallback: string }[] = [
  {
    key: 'matched',
    label: 'Matched',
    hint: 'Requirements your CV clearly demonstrates.',
    empty: 'Nothing from this post shows clearly in your CV yet.',
    fallback: 'Clearly demonstrated',
  },
  {
    key: 'partial',
    label: 'Partial',
    hint: 'Related experience that covers the requirement only in part.',
    empty: 'No partial matches.',
    fallback: 'Partially demonstrated',
  },
  {
    key: 'unverified',
    label: 'Unverified',
    hint: 'Not shown in your CV. That does not mean you lack them — add anything that is genuinely true.',
    empty: 'Nothing obvious is missing.',
    fallback: 'Not shown in the CV',
  },
];

const badge = (r: Req) =>
  r.importance && (
    <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[11px] font-medium text-soft">
      {r.importance === 'required' ? 'Required' : 'Preferred'}
    </span>
  );

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('size-4 shrink-0 text-soft transition-transform motion-reduce:transition-none', open && 'rotate-180')}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Collapsed-by-default requirement row; client-side disclosure only. */
function RequirementRow({
  r,
  fallback,
  open,
  onToggle,
}: {
  r: Req;
  fallback: string;
  open: boolean;
  onToggle: () => void;
}) {
  const bodyId = useId();
  const label = (r.status && STATUS_LABEL[r.status]) || fallback;
  return (
    <li className="min-w-0 rounded-xl border border-line bg-bg/50">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex min-h-12 w-full items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-left hover:bg-tint"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 font-semibold break-words">{r.requirement}</span>
            {badge(r)}
            <span className="text-xs font-medium text-soft">{label}</span>
          </span>
          <Chevron open={open} />
        </button>
      </h3>
      <div id={bodyId} hidden={!open}>
        <p className="px-4 pb-4 text-[15px] leading-relaxed whitespace-pre-line break-words text-soft">
          {r.evidence || 'No further detail was saved for this requirement.'}
        </p>
      </div>
    </li>
  );
}

/** Accessible tabs (roving tabindex, arrows/Home/End) over the three requirement groups. */
function RequirementTabs({ groups }: { groups: Groups }) {
  const base = useId();
  // Chosen once per report (the page remounts per match id), so background refetches never reset it.
  const [active, setActive] = useState<TabKey>(() => defaultTab(groups));
  const [openRows, setOpenRows] = useState<Set<string>>(() => new Set());
  const tab = TABS.find((t) => t.key === active)!;
  const items = groups[active];

  const focusTab = (k: TabKey) => {
    setActive(k);
    document.getElementById(`${base}-tab-${k}`)?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.key === active);
    const go = (n: number) => {
      e.preventDefault();
      focusTab(TABS[(n + TABS.length) % TABS.length].key);
    };
    if (e.key === 'ArrowRight') go(i + 1);
    else if (e.key === 'ArrowLeft') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(TABS.length - 1);
  };
  const toggle = (id: string) =>
    setOpenRows((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Panel headingId="req-h" title="Requirement breakdown">
      <div
        role="tablist"
        aria-label="Requirement categories"
        onKeyDown={onKeyDown}
        className="-mt-1 mb-4 flex gap-1.5 rounded-full bg-side p-1"
      >
        {TABS.map((t) => {
          const selected = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${base}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${base}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(t.key)}
              className={cn(
                'min-h-10 min-w-0 flex-1 rounded-full px-2 text-sm font-medium transition-colors sm:px-4',
                selected ? 'bg-surface font-semibold text-ink shadow-sm' : 'text-soft hover:text-ink',
              )}
            >
              {t.label} ({groups[t.key].length})
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={`${base}-tab-${active}`}>
        <p className="mb-3 text-sm text-soft">{tab.hint}</p>
        {items.length ? (
          <ul className="flex flex-col gap-2.5">
            {items.map((r, i) => {
              const id = `${active}-${i}`;
              return (
                <RequirementRow
                  key={id}
                  r={r}
                  fallback={tab.fallback}
                  open={openRows.has(id)}
                  onToggle={() => toggle(id)}
                />
              );
            })}
          </ul>
        ) : (
          <p className="text-[15px] text-soft">{tab.empty}</p>
        )}
      </div>
    </Panel>
  );
}

function QuickCard({
  title,
  items,
  empty,
  note,
  label,
  glyph,
  tone,
}: {
  title: string;
  items: { r: Req; label: string }[];
  empty: string;
  note?: string;
  label: string;
  glyph: string;
  tone: string;
}) {
  return (
    <section aria-label={label} className="min-w-0 rounded-2xl border border-line bg-surface p-5">
      <h2 className="flex items-center gap-2.5 text-[17px] font-semibold">
        <span aria-hidden className={cn('grid size-6 place-items-center rounded-full text-xs text-[#1c2b22]', tone)}>
          {glyph}
        </span>
        {title}
      </h2>
      {items.length ? (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map(({ r, label: l }, i) => (
            <li key={`${r.requirement}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="min-w-0 font-medium break-words">{r.requirement}</span>
              {badge(r)}
              <span className="text-xs text-soft">{l}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-soft">{empty}</p>
      )}
      {note && !!items.length && <p className="mt-3 text-[13px] text-soft">{note}</p>}
    </section>
  );
}

/** Shared by the top and bottom action sections — plain links, so no request is ever made here. */
function Actions({ matchId, appQuery, newMatch }: { matchId: string; appQuery: string; newMatch?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ButtonLink to={`/app/match/${matchId}/tailor`}>Tailor my CV for this job</ButtonLink>
      <ButtonLink to={`/app/applications/new?${appQuery}`} variant="secondary">
        Add to Applications
      </ButtonLink>
      {newMatch && (
        <ButtonLink to="/app/match" variant="ghost">
          Start a new match
        </ButtonLink>
      )}
    </div>
  );
}

function Report({ m }: { m: MatchResult }) {
  const scoreAvailable = m.scoreAvailable ?? true;
  const score = useCountUp(scoreAvailable ? m.score : 0, 1000, 100);
  const groups = groupRequirements(m);
  const strongest = pickTop(groups.matched).map((r) => ({ r, label: '' }));
  const toAddress = pickTop([
    ...groups.partial.map((r) => ({ ...r, _l: 'Partly shown' })),
    ...groups.unverified.map((r) => ({ ...r, _l: 'Not shown in the CV' })),
  ]).map((r) => ({ r, label: (r as Req & { _l: string })._l }));
  const assessment = m.overallAssessment ?? m.summary;
  const appQuery = new URLSearchParams({
    company: m.company ?? '',
    jobTitle: m.jobTitle,
    ...(m.jobUrl ? { jobUrl: m.jobUrl } : {}),
    ...(m.cvId ? { cvId: m.cvId } : {}),
  }).toString();
  const hasRecs = !!m.recommendations?.length || !!m.suggestedWording?.length;
  const stats: [string, number][] = [
    ['Matched', groups.matched.length],
    ['Partial', groups.partial.length],
    ['Unverified', groups.unverified.length],
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="min-w-0">
        <p className="text-sm font-medium text-soft">Job match report</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold break-words sm:text-[32px]">{m.jobTitle}</h1>
        <p className="mt-1 text-base break-words text-soft">
          {[m.company, m.cvName ? `CV used: ${m.cvName}` : ''].filter(Boolean).join(' · ')}
        </p>
      </header>

      <Panel headingId="overview-h" className="p-5 sm:p-6">
        <h2 id="overview-h" className="sr-only">
          Match overview
        </h2>
        <div className="grid gap-4 md:grid-cols-[190px_1fr] md:items-center md:gap-8">
          <div>
            {scoreAvailable ? (
              <p aria-hidden className="font-display text-[56px] leading-none font-semibold tracking-tight">
                {score}%
              </p>
            ) : (
              <p className="font-display text-[30px] leading-tight font-semibold">Score unavailable</p>
            )}
            <p className="mt-1.5 text-base font-semibold text-accent-ink">{m.verdict}</p>
          </div>
          <div className="min-w-0">
            {scoreAvailable && <ProgressBar value={m.score} label="Match score" />}
            <p className={cn('text-[15px] leading-relaxed break-words', scoreAvailable && 'mt-3')}>{assessment}</p>
            {m.scoreExplanation && (
              <p className="mt-2 text-[13px] leading-relaxed break-words text-soft">{m.scoreExplanation}</p>
            )}
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4">
          {stats.map(([k, n]) => (
            <div key={k} className="min-w-0 rounded-xl bg-bg px-3 py-2 text-center">
              <dd className="font-display text-xl font-semibold">{n}</dd>
              <dt className="text-xs text-soft">{k}</dt>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-soft">
          A heuristic estimate of CV-to-job alignment — not an employer ATS score or a hiring prediction.
        </p>
        <JobDetails m={m} />
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <QuickCard
          label="Your strongest matches"
          title="Your strongest matches"
          glyph="✓"
          tone="bg-st-offer"
          items={strongest}
          empty="Nothing from this post shows clearly in your CV yet."
        />
        <QuickCard
          label="Areas to address"
          title="Areas to address"
          glyph="?"
          tone="bg-accent"
          items={toAddress}
          empty="Nothing obvious to address."
          note="“Not shown” means the CV doesn’t demonstrate it — not that you lack the skill."
        />
      </div>

      <Actions matchId={m.id} appQuery={appQuery} />

      <RequirementTabs groups={groups} />

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
        <Actions matchId={m.id} appQuery={appQuery} newMatch />
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
