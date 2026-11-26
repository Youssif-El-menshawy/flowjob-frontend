import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchJob, useCvs, useJobs } from '@/shared/api/queries';
import type { JobFit, JobLevel, JobLevelFilter, JobListing } from '@/shared/api/types';
import { useDebouncedValue, useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { cn, fmtDate, fmtRelative } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { EmptyState, PageHeader, Segmented } from '@/shared/ui/Display';
import { controlClass } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icons';
import { useToast } from '@/shared/ui/Overlay';
import { PageLoader, Spinner } from '@/shared/ui/Spinner';

const PAGE_SIZE = 20;
/** Same cap the match form uses for a job description. */
const MAX_JOB_CHARS = 12000;
/** How many skill names to show before "+N more". */
const SHOW_SKILLS = 5;

const TABS = ['Students & graduates', 'Internships', 'All levels'] as const;
type Tab = (typeof TABS)[number];
const TAB_LEVEL: Record<Tab, JobLevelFilter> = {
  'Students & graduates': 'entry',
  Internships: 'internship',
  'All levels': 'all',
};
type Sort = 'fit' | 'recent';

const LEVEL_BADGE: Record<JobLevel, { label: string; className: string } | null> = {
  internship: { label: 'Internship', className: 'bg-accent-soft text-accent-ink' },
  entry: { label: 'Entry level', className: 'bg-success-bg text-success-ink' },
  other: null,
};

const FIT_STYLE: Record<string, string> = {
  'Strong fit': 'bg-success-bg text-success-ink',
  'Good fit': 'bg-accent-soft text-accent-ink',
  'Partial fit': 'bg-tint text-ink',
  'Low fit': 'bg-tint text-soft',
};

/** What the match form needs to start with this job already filled in. */
export interface PrefilledJob {
  title: string;
  company: string;
  url: string;
  description: string;
  /** The CV chosen on the Jobs page, so Job Match uses the same one. */
  cvId?: string;
}

const list = (names: string[]) =>
  names.length > SHOW_SKILLS
    ? `${names.slice(0, SHOW_SKILLS).join(', ')} +${names.length - SHOW_SKILLS} more`
    : names.join(', ');

/** Keyword skill fit: a quick guide, not the AI match. */
function FitSummary({ fit }: { fit: JobFit }) {
  if (fit.score === null) {
    return (
      <p className="mt-1.5 text-xs text-soft">
        {fit.label === 'No description'
          ? 'No description to compare with your CV. Open the posting to read it.'
          : 'The ad names too few skills for a score.'}
      </p>
    );
  }
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 text-xs">
      <p>
        <span className={cn('mr-2 rounded-full px-2 py-0.5 font-semibold', FIT_STYLE[fit.label])}>
          {fit.label} · {fit.score}%
        </span>
        {fit.matched.length > 0 && <span className="text-soft">You have: {list(fit.matched)}</span>}
      </p>
      {fit.missing.length > 0 && <p className="text-soft">Missing: {list(fit.missing)}</p>}
      {fit.missingOptional.length > 0 && <p className="text-soft">Nice to have: {list(fit.missingOptional)}</p>}
      {fit.missingLanguages.length > 0 && (
        <p className="font-medium text-danger">Asks for {fit.missingLanguages.join(' and ')}, which is not on your CV</p>
      )}
    </div>
  );
}

function JobCard({ job, i, onMatch, matching }: {
  job: JobListing;
  i: number;
  onMatch: (job: JobListing) => void;
  matching: boolean;
}) {
  const badge = LEVEL_BADGE[job.level];
  return (
    <li
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 animate-in sm:flex-row sm:items-center sm:justify-between"
      style={{ animationDelay: `${Math.min(i, 10) * 0.03}s` }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-medium">{job.title}</h2>
          {badge && (
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', badge.className)}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[14px] text-soft">
          {job.company} · {job.city === 'Poland' ? 'Poland (location not specified)' : job.city}
          {job.postedAt ? ` · posted ${fmtDate(job.postedAt, true)}` : ''}
        </p>
        {job.fit && <FitSummary fit={job.fit} />}
        <p className="mt-1 text-xs text-soft">From the company's careers page via {job.source}</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" onClick={() => onMatch(job)} loading={matching} disabled={matching}>
          Match my CV
        </Button>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium hover:bg-tint"
          >
            View posting<span className="sr-only"> (opens in a new tab)</span> ↗
          </a>
        )}
      </div>
    </li>
  );
}

export default function JobsPage() {
  useDocumentTitle('Jobs');
  const nav = useNavigate();
  const toast = useToast();
  const cvs = useCvs();
  const [tab, setTab] = useState<Tab>('Students & graduates');
  const [city, setCity] = useState('');
  const [company, setCompany] = useState('');
  const [search, setSearch] = useState('');
  const [chosenCvId, setCvId] = useState('');
  const [sort, setSort] = useState<Sort>('fit');
  const [page, setPage] = useState(1);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const q = useDebouncedValue(search, 350);

  // Until the user picks one, compare with the original CV (or the first one), like Job Match does.
  const defaultCvId = cvs.data?.find((c) => c.kind === 'original')?.id ?? cvs.data?.[0]?.id ?? '';
  const cvId = chosenCvId || defaultCvId;
  const hasCv = !!cvId;
  const { data, isLoading, isError, isFetching } = useJobs(
    {
      level: TAB_LEVEL[tab],
      city: city || undefined,
      company: company || undefined,
      q: q || undefined,
      cvId: cvId || undefined,
      sort: hasCv ? sort : 'recent',
      page,
      pageSize: PAGE_SIZE,
    },
    // Wait for the CV list, so the first request already uses the right CV.
    !cvs.isLoading,
  );

  // Any filter change starts again at page 1.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  async function matchJob(job: JobListing) {
    setMatchingId(job.id);
    try {
      const detail = await fetchJob(job.id);
      const prefill: PrefilledJob = {
        title: detail.title,
        company: detail.company,
        url: detail.url ?? '',
        description: (detail.description ?? '').slice(0, MAX_JOB_CHARS),
        cvId: cvId || undefined,
      };
      // Also keep the text for this browser session, so it survives "Create your CV first".
      pendingJob.set(prefill.description);
      if (!detail.description) {
        toast({ text: 'This job board does not share the description. Paste it from the posting.' });
      }
      nav('/app/match', { state: { job: prefill } });
    } catch {
      toast({ text: 'Could not load this job. Please try again.' });
    } finally {
      setMatchingId(null);
    }
  }

  if (cvs.isLoading || isLoading) return <PageLoader />;

  const levels = data?.levels ?? {};
  const entryCount = (levels.entry ?? 0) + (levels.internship ?? 0);
  const allCount = entryCount + (levels.other ?? 0);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(city || company || q);
  const selectClass = cn(controlClass(), 'min-h-11 rounded-full bg-surface');

  return (
    <>
      <PageHeader
        title="Jobs in Poland"
        subtitle={
          data?.refreshing && !allCount
            ? 'Collecting open jobs from tracked companies…'
            : `${entryCount} for students and graduates · ${allCount} in total` +
              (data?.refreshedAt ? ` · updated ${fmtRelative(data.refreshedAt)}` : '')
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented label="Experience level" options={TABS} value={tab} onChange={change(setTab)} />
        <div className="relative w-full max-w-xs">
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-soft">
            <Icon.search />
          </span>
          <label htmlFor="job-search" className="sr-only">
            Search jobs
          </label>
          <input
            id="job-search"
            type="search"
            value={search}
            onChange={(e) => change(setSearch)(e.target.value)}
            placeholder="Search role or company"
            className={cn(controlClass(), 'min-h-11 rounded-full bg-surface pl-11')}
          />
        </div>
        <select
          aria-label="Filter by city"
          value={city}
          onChange={(e) => change(setCity)(e.target.value)}
          className={cn(selectClass, 'sm:w-48')}
        >
          <option value="">All cities</option>
          {data?.cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name === 'Poland' ? 'Poland (not specified)' : c.name} ({c.count})
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by company"
          value={company}
          onChange={(e) => change(setCompany)(e.target.value)}
          className={cn(selectClass, 'sm:w-60')}
        >
          <option value="">All companies</option>
          {data?.companies.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
        {isFetching && <Spinner className="size-4" />}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        {hasCv ? (
          <>
            <label className="flex items-center gap-2 text-soft">
              Compare with
              <select
                aria-label="CV to compare with"
                value={cvId}
                onChange={(e) => change(setCvId)(e.target.value)}
                className={cn(selectClass, 'w-auto text-ink sm:w-64')}
              >
                {cvs.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-soft">
              Sort by
              <select
                aria-label="Sort jobs"
                value={sort}
                onChange={(e) => change(setSort)(e.target.value as Sort)}
                className={cn(selectClass, 'w-auto text-ink sm:w-48')}
              >
                <option value="fit">Best match for my CV</option>
                <option value="recent">Newest first</option>
              </select>
            </label>
            <p className="text-xs text-soft">Skill fit is a quick keyword check. Use Match my CV for a full analysis.</p>
          </>
        ) : (
          <p className="text-soft">
            <Link to="/app/cv-builder" className="font-semibold text-primary hover:underline">
              Create a CV
            </Link>{' '}
            to see how well each job fits you.
          </p>
        )}
      </div>

      {isError ? (
        <EmptyState title="Jobs could not be loaded" text="Please check your connection and try again." />
      ) : data?.refreshing && !data.items.length ? (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-6 text-soft">
          <Spinner className="size-4" />
          Collecting open jobs from tracked companies. This takes about 20 seconds the first time.
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          title={filtered ? 'No jobs match your filters' : 'No jobs at this level right now'}
          text={
            filtered
              ? 'Try another city, company or search term.'
              : 'Companies publish most internships in spring. Try "All levels", or check again later.'
          }
          action={
            tab !== 'All levels' ? (
              <Button variant="secondary" onClick={() => change(setTab)('All levels')}>
                Show all levels
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2.5" aria-label="Jobs">
            {data.items.map((job, i) => (
              <JobCard key={job.id} job={job} i={i} onMatch={matchJob} matching={matchingId === job.id} />
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-6 flex items-center justify-center gap-3 text-sm">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <span className="text-soft">
                Page {page} of {pages}
              </span>
              <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </Button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
