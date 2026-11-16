import { useId, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useMatch, useTailor } from '@/shared/api/queries';
import { jobPosts, tailorFromMatch } from '@/shared/lib/jobPosts';
import type { MatchResult } from '@/shared/api/types';
import {
  attentionItems,
  categoryOf,
  categorySummary,
  defaultTab,
  groupRequirements,
  improvements,
  isGenericNotShown,
  overviewText,
  pickTop,
  snippet,
  type Groups,
  type Req,
  type TabKey,
} from './matchReport';
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

/** The original job post details, shown inside the (already collapsed) Detailed analysis section. */
function JobDetails({ m }: { m: MatchResult }) {
  const description = (m.jobText || jobPosts.get(m.id))?.trim();
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
    <section aria-labelledby="job-details-h" className="mt-8 border-t border-line pt-5">
      <h3 id="job-details-h" className="text-base font-semibold">
        Job details
      </h3>
      <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
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
    </section>
  );
}

/**
 * A button-controlled disclosure. The content stays mounted (only `hidden`), so state inside it — the
 * selected requirement tab and open cards — survives collapsing and re-opening.
 */
function Disclosure({
  label,
  openLabel,
  children,
  className,
}: {
  label: string;
  openLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-primary hover:bg-tint"
      >
        <Chevron open={open} />
        {open && openLabel ? openLabel : label}
      </button>
      <div id={panelId} hidden={!open}>
        {children}
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
    label: 'Not shown',
    hint: 'Not shown in your CV. That does not mean you lack them — add anything that is genuinely true.',
    empty: 'Nothing obvious is missing.',
    fallback: 'Not shown in the CV',
  },
];

const CATEGORY_LABEL = { required: 'Required', standard: 'Standard', preferred: 'Preferred' } as const;

const badge = (r: Req) => {
  const category = categoryOf(r);
  return (
    category && (
      <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[11px] font-medium text-soft">
        {CATEGORY_LABEL[category]}
      </span>
    )
  );
};

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
    <section aria-labelledby="req-h">
      <h3 id="req-h" className="mb-3 text-base font-semibold">
        Requirement breakdown
      </h3>
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
    </section>
  );
}

const evidenceNote = (r: Req) => (isGenericNotShown(r.evidence) ? '' : snippet(r.evidence, 140));

function CompareList({
  title,
  glyph,
  tone,
  items,
  empty,
  note,
}: {
  title: string;
  glyph: string;
  tone: string;
  items: { r: Req; label: string }[];
  empty: string;
  note?: string;
}) {
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2.5 text-[17px] font-semibold">
        <span aria-hidden className={cn('grid size-6 place-items-center rounded-full text-xs text-[#1c2b22]', tone)}>
          {glyph}
        </span>
        {title}
      </h3>
      {items.length ? (
        <ul className="mt-3 flex flex-col gap-3">
          {items.map(({ r, label }, i) => (
            <li key={`${r.requirement}-${i}`} className="min-w-0">
              <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="min-w-0 font-medium break-words">{r.requirement}</span>
                {badge(r)}
                {label && <span className="text-xs text-soft">{label}</span>}
              </p>
              {evidenceNote(r) && <p className="mt-0.5 text-[13px] leading-snug break-words text-soft">{evidenceNote(r)}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-soft">{empty}</p>
      )}
      {note && !!items.length && <p className="mt-3 text-[13px] text-soft">{note}</p>}
    </div>
  );
}

function ImproveSection({ m, groups }: { m: MatchResult; groups: Groups }) {
  const list = improvements(m, groups);
  const gaps = [...groups.unverified, ...groups.partial].slice(0, 5);
  return (
    <Panel headingId="improve-h" title="Improve your CV for this job">
      {list.length ? (
        <ol className="flex flex-col gap-3">
          {list.map((it, i) => (
            <li key={i} className="flex gap-3.5">
              <span aria-hidden className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-tint text-xs font-semibold">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[15px] leading-relaxed break-words">{it.text}</p>
                {it.basis && <p className="mt-0.5 text-[13px] leading-snug break-words text-soft">Your CV says: {it.basis}</p>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-[15px] text-soft">
          No specific changes stand out from this analysis. You can still tailor your CV to this job.
        </p>
      )}
      {gaps.length > 0 && m.cvId && (
        <div className="mt-4 rounded-xl bg-bg p-4">
          <p className="text-[15px] font-medium">Have one of these already?</p>
          <p className="mt-1.5 text-sm leading-relaxed break-words text-soft">
            {gaps.map((r) => r.requirement).join(' · ')}
          </p>
          <p className="mt-2 text-sm text-soft">
            Tailoring never adds experience you have not written yourself. Add it to your CV in your own words, then
            check this job again.
          </p>
          <ButtonLink to={`/app/cv-builder/${m.cvId}`} variant="secondary" size="sm" className="mt-3">
            Edit my CV
          </ButtonLink>
        </div>
      )}
      <p className="mt-4 text-[13px] text-soft">You review every suggestion before anything is saved. Your original CV never changes.</p>
    </Panel>
  );
}

/** The report's two actions, right in the header: tailoring (primary) and application tracking. */
function HeaderActions({ m, appQuery }: { m: MatchResult; appQuery: string }) {
  const nav = useNavigate();
  const tailor = useTailor();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Button
        className="w-full sm:w-auto"
        loading={tailor.isPending}
        onClick={() => tailor.mutate(tailorFromMatch({ matchId: m.id }), { onSuccess: (draft) => nav(`/app/tailor/${draft.id}`) })}
      >
        Tailor my CV
      </Button>
      <ButtonLink to={`/app/applications/new?${appQuery}`} variant="secondary" className="w-full sm:w-auto">
        Add to Applications
      </ButtonLink>
      {tailor.isError && (
        <p role="alert" className="basis-full text-sm text-danger">
          {tailor.error instanceof ApiError ? tailor.error.message : 'Could not tailor your CV. Please try again.'}
        </p>
      )}
    </div>
  );
}

function Report({ m }: { m: MatchResult }) {
  const scoreAvailable = m.scoreAvailable ?? true;
  const score = useCountUp(scoreAvailable ? m.score : 0, 1000, 100);
  // Set when this report is a re-check of a freshly tailored CV against the same post.
  const previousScore = (useLocation().state as { previousScore?: unknown } | null)?.previousScore;
  const groups = groupRequirements(m);
  const overview = overviewText(m, groups);
  const strongest = pickTop(groups.matched, 2).map((r) => ({ r, label: '' }));
  const attention = attentionItems(groups, 2).map(({ r, kind }) => ({
    r,
    label: kind === 'partial' ? 'Partly shown' : 'Not shown in your CV',
  }));
  const savedAssessment = (m.overallAssessment ?? m.summary ?? '').trim();
  const appQuery = new URLSearchParams({
    company: m.company ?? '',
    jobTitle: m.jobTitle,
    ...(m.jobUrl ? { jobUrl: m.jobUrl } : {}),
    ...(m.cvId ? { cvId: m.cvId } : {}),
  }).toString();
  const stats: [string, number][] = [
    ['Matched', groups.matched.length],
    ['Partial', groups.partial.length],
    ['Not shown', groups.unverified.length],
  ];
  const categories = categorySummary(m, groups);

  return (
    <div className="flex flex-col gap-5">
      <header className="min-w-0">
        <p className="text-sm font-medium text-soft">Job match report</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold break-words sm:text-[32px]">{m.jobTitle}</h1>
        <p className="mt-1 text-base break-words text-soft">
          {[m.company, m.cvName ? `CV used: ${m.cvName}` : ''].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-4">
          <HeaderActions m={m} appQuery={appQuery} />
        </div>
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
            <p className={cn('mt-1.5 text-base font-semibold', scoreAvailable && m.score >= 60 ? 'text-primary' : 'text-accent-ink')}>
              {m.verdict}
            </p>
            {scoreAvailable && typeof previousScore === 'number' && (
              <p className="mt-1 text-sm text-soft">Before tailoring: {previousScore}%</p>
            )}
          </div>
          <div className="min-w-0">
            {scoreAvailable && <ProgressBar value={m.score} label="Match score" tone={m.score >= 60 ? 'primary' : 'accent'} />}
            {overview.text && (
              <p className={cn('text-[15px] leading-relaxed break-words', scoreAvailable && 'mt-3')}>{overview.text}</p>
            )}
            <dl className="mt-3 flex flex-wrap gap-2">
              {stats.map(([k, n]) => (
                <div key={k} className="flex items-baseline gap-1.5 rounded-full bg-bg px-3 py-1">
                  <dd className="font-display text-base font-semibold">{n}</dd>
                  <dt className="text-xs text-soft">{k}</dt>
                </div>
              ))}
            </dl>
            {categories && (
              <p className="mt-2 text-[13px] text-soft">
                Scored qualifications: {categories.map((c) => `${c.count} ${c.label}`).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-soft">
          A heuristic estimate of CV-to-job alignment — not an employer ATS score or a hiring prediction.
        </p>
        <Disclosure label="About this score" openLabel="Hide score details" className="mt-1">
          <div className="mt-1 flex flex-col gap-3 text-[13px] leading-relaxed break-words text-soft">
            {m.scoreExplanation && <p>{m.scoreExplanation}</p>}
            {!overview.fromSaved && savedAssessment && (
              <div>
                <p className="font-medium text-ink">Original assessment</p>
                <p className="mt-0.5">{savedAssessment}</p>
              </div>
            )}
          </div>
        </Disclosure>
      </Panel>

      <Panel headingId="compare-h" title="How your CV compares">
        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          <CompareList
            title="What matches"
            glyph="✓"
            tone="bg-st-offer"
            items={strongest}
            empty="Nothing from this post is clearly shown in your CV yet."
          />
          <CompareList
            title="What needs attention"
            glyph="?"
            tone="bg-accent"
            items={attention}
            empty="Every qualification this post lists is shown in your CV — nothing needs attention. Nice work."
            note="“Not shown” means your CV doesn’t demonstrate it — not that you lack the skill."
          />
        </div>
      </Panel>

      <ImproveSection m={m} groups={groups} />

      <DetailedAnalysis m={m} groups={groups} />
    </div>
  );
}

/** The full requirement breakdown + original job post, collapsed by default. */
function DetailedAnalysis({ m, groups }: { m: MatchResult; groups: Groups }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section aria-labelledby="detail-h" className="rounded-2xl border border-line bg-surface p-5 sm:p-7 animate-in">
      <h2 id="detail-h" className="text-xl font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="-m-1 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl p-1 text-left hover:bg-tint"
        >
          <span>Detailed analysis</span>
          <Chevron open={open} />
        </button>
      </h2>
      <p className="mt-1 text-sm text-soft">Every requirement with the evidence from your CV, plus the original job post.</p>
      <div id={panelId} hidden={!open} className="mt-5">
        <RequirementTabs groups={groups} />
        <JobDetails m={m} />
      </div>
    </section>
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
