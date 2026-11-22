import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useCvs } from '@/shared/api/queries';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn, fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, PageHeader } from '@/shared/ui/Display';
import { Input, Select } from '@/shared/ui/Field';
import { PageLoader } from '@/shared/ui/Spinner';
import { CvActionDialog, type CvAction } from './CvLibraryActions';
import { sortCvs, type CvSort } from './cvOptions';
import { SavedCvPreview } from './SavedCvPreview';

const DESKTOP = '(min-width: 1024px)';
const desktopSnapshot = () => window.matchMedia?.(DESKTOP).matches ?? true;
function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia?.(DESKTOP);
  media?.addEventListener('change', onChange);
  return () => media?.removeEventListener('change', onChange);
}

export default function MyCvsPage() {
  useDocumentTitle('My CVs');
  const cvs = useCvs();
  const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CvSort>('updated');
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [action, setAction] = useState<{ cvId: string; type: CvAction } | null>(null);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const closeAction = useCallback(() => setAction(null), []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortCvs(
      (cvs.data ?? []).filter((cv) =>
        [cv.name, cv.company, cv.jobTitle].some((value) => value?.toLowerCase().includes(query)),
      ),
      sort,
    );
  }, [cvs.data, search, sort]);
  // Sorting never changes the fallback preference. A hidden CV cannot drive the preview.
  const selected = visible.find((cv) => cv.id === preferredId) ?? (sort === 'updated' ? visible[0] : sortCvs(visible)[0]);
  const actionCv = cvs.data?.find((cv) => cv.id === action?.cvId);
  const hasOriginal = cvs.data?.some((cv) => cv.kind === 'original');
  const tailoredCount = cvs.data?.filter((cv) => cv.kind === 'tailored').length ?? 0;

  if (cvs.isLoading) return <PageLoader />;
  return (
    <>
      <PageHeader
        title="My CVs"
        subtitle="Find, preview, and manage your saved CVs."
        actions={
          <>
            <ButtonLink to="/app/cvs/import" variant="secondary">Import CV</ButtonLink>
            {!!cvs.data?.length && <ButtonLink to="/app/match">Tailor for a new job</ButtonLink>}
          </>
        }
      />
      {cvs.isError && !cvs.data ? (
        <EmptyState
          title="Could not load your CVs"
          text="Check your connection and try again."
          action={<Button onClick={() => void cvs.refetch()}>Retry library</Button>}
        />
      ) : !cvs.data?.length ? (
        <EmptyState
          title="No saved CVs yet"
          text="Create your original CV to get started. Your tailored versions will appear here as you save them."
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <ButtonLink to="/app/cv-builder">Create CV</ButtonLink>
              <ButtonLink to="/app/cvs/import" variant="secondary">Import CV</ButtonLink>
            </div>
          }
        />
      ) : (
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card className="min-w-0 !p-4 sm:!p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">CV Library</h2>
              <p className="text-xs text-soft">{tailoredCount} tailored {tailoredCount === 1 ? 'CV' : 'CVs'}</p>
            </div>
            <div className="mb-4 grid gap-3 sm:max-lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,auto)]">
              <Input
                label="Search CVs"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, company, title"
              />
              <Select label="Sort by" value={sort} onChange={(event) => setSort(event.target.value as CvSort)}>
                <option value="updated">Recently updated</option>
                <option value="created">Recently created</option>
                <option value="name">Name A–Z</option>
              </Select>
            </div>
            {visible.length ? (
              <ul aria-label="Saved CVs" className="space-y-1.5 lg:max-h-[65vh] lg:overflow-y-auto lg:pr-1">
                {visible.map((cv) => {
                  const active = cv.id === selected?.id;
                  const detail = [cv.jobTitle, cv.company].filter(Boolean).join(' · ');
                  return (
                    <li key={cv.id}>
                      <button
                        type="button"
                        aria-current={active ? 'true' : undefined}
                        onClick={() => {
                          setPreferredId(cv.id);
                          if (!desktop) setMobileOpen(true);
                        }}
                        className={cn(
                          'flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                          active ? 'border-primary/50 bg-tint' : 'border-transparent hover:bg-bg',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold" title={cv.name}>{cv.name}</span>
                          {detail && <span className="block truncate text-xs text-soft" title={detail}>{detail}</span>}
                          <span className="mt-0.5 block text-xs text-soft">
                            {cv.kind === 'original' ? 'Original' : 'Tailored'}
                            {' · Updated '}{fmtDate(cv.updatedAt, true)}
                          </span>
                        </span>
                        {active && <span aria-hidden className="shrink-0 text-sm font-semibold text-primary">✓</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="space-y-2 py-5 text-center" role="status">
                <p className="text-sm text-soft">No CVs match your search.</p>
                <Button size="sm" variant="secondary" onClick={() => setSearch('')}>Clear search</Button>
              </div>
            )}
            {!search.trim() && (!hasOriginal || tailoredCount === 0) && (
              <p className="mt-4 text-sm text-soft">
                {hasOriginal ? (
                  <>Create your first tailored version from <Link to="/app/match" className="text-primary underline">Job Match</Link>.</>
                ) : (
                  <Link to="/app/cv-builder" className="text-primary underline">Create an original CV</Link>
                )}
              </p>
            )}
          </Card>

          {selected && (desktop || mobileOpen) && (
            <SavedCvPreview
              key={selected.id}
              cv={selected}
              mobile={!desktop}
              mobileOpen={!actionCv}
              onBack={closeMobile}
              onAction={(type) => setAction({ cvId: selected.id, type })}
            />
          )}
        </div>
      )}
      {action && actionCv && (
        <CvActionDialog
          key={`${action.type}:${actionCv.id}`}
          action={action.type}
          cv={actionCv}
          onClose={closeAction}
          onDeleted={() => {
            setPreferredId(null);
            setSearch('');
          }}
        />
      )}
    </>
  );
}
