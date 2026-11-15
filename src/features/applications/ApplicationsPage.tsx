import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { qk, useApplications, useUpdateApplication } from '@/shared/api/queries';
import type { Application, ApplicationStatus } from '@/shared/api/types';
import { STATUSES } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn, fmtDate } from '@/shared/lib/utils';
import { ButtonLink } from '@/shared/ui/Button';
import { EmptyState, PageHeader, Segmented, STATUS_STYLE, StatusPill } from '@/shared/ui/Display';
import { controlClass } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icons';
import { useToast } from '@/shared/ui/Overlay';
import { PageLoader } from '@/shared/ui/Spinner';
import { GmailHeaderAction, GmailHeaderStatus } from './gmail/GmailHeaderAction';
import { oauthErrorMessage } from './gmail/gmailLabels';
import { NeedsReview } from './gmail/NeedsReview';

const COLUMNS: { name: string; statuses: ApplicationStatus[]; slab: string; drop?: ApplicationStatus }[] = [
  { name: 'Saved', statuses: ['Saved'], slab: STATUS_STYLE.Saved.slab, drop: 'Saved' },
  { name: 'Applied', statuses: ['Applied'], slab: STATUS_STYLE.Applied.slab, drop: 'Applied' },
  { name: 'Interview', statuses: ['Interview'], slab: STATUS_STYLE.Interview.slab, drop: 'Interview' },
  { name: 'Offer', statuses: ['Offer'], slab: STATUS_STYLE.Offer.slab, drop: 'Offer' },
  { name: 'Closed', statuses: ['Rejected', 'Withdrawn'], slab: 'bg-[#e3ded3]' },
];

function CardItem({ a, i }: { a: Application; i: number }) {
  const hist = a.history ?? [];
  const lastGmail = a.source === 'gmail' || (hist.length > 0 && hist[hist.length - 1].source !== 'manual');
  const needsReview = !!a.suggestion;
  return (
    <Link
      to={`/app/applications/${a.id}`}
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', a.id)}
      className={cn(
        'block rounded-2xl border bg-surface p-3.5 lift animate-in',
        needsReview ? 'border-accent' : 'border-line',
      )}
      style={{ animationDelay: `${i * 0.04}s` }}
    >
      <p className="font-medium">{a.company}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-soft">{a.jobTitle}</p>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="text-soft">{fmtDate(a.dateApplied)}</span>
        {needsReview ? (
          <span className="font-semibold text-accent-ink">Needs review</span>
        ) : a.status === 'Rejected' || a.status === 'Withdrawn' ? (
          <span className="text-soft">{a.status}</span>
        ) : lastGmail ? (
          <span className="font-medium text-success-ink">From Gmail</span>
        ) : null}
      </div>
    </Link>
  );
}

export default function ApplicationsPage() {
  useDocumentTitle('Applications');
  const toast = useToast();
  const { data, isLoading } = useApplications();
  const update = useUpdateApplication();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'Board' | 'Table'>(
    () => (localStorage.getItem('flowjob.appsView') as 'Table') || 'Board',
  );
  const [q, setQ] = useState('');
  const [over, setOver] = useState<string | null>(null);
  const statusFilter = params.get('status') as ApplicationStatus | null;
  const qc = useQueryClient();

  // Return from Google OAuth: report the outcome once, then drop the query parameters.
  const gmailResult = params.get('gmail');
  const gmailReason = params.get('reason');
  useEffect(() => {
    if (!gmailResult) return;
    if (gmailResult === 'connected') toast({ text: 'Gmail connected. Checking the last 30 days…' });
    else if (gmailResult === 'reconnected') toast({ text: 'Gmail reconnected.' });
    else toast({ text: oauthErrorMessage(gmailReason), tone: 'error' });
    void qc.invalidateQueries({ queryKey: qk.gmail });
    const next = new URLSearchParams(params);
    next.delete('gmail');
    next.delete('reason');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmailResult]);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data ?? []).filter(
      (a) =>
        (!t || `${a.company} ${a.jobTitle}`.toLowerCase().includes(t)) &&
        (!statusFilter || view === 'Board' || a.status === statusFilter),
    );
  }, [data, q, statusFilter, view]);

  if (isLoading) return <PageLoader />;
  const setV = (v: 'Board' | 'Table') => {
    setView(v);
    try {
      localStorage.setItem('flowjob.appsView', v);
    } catch {
      /* ignore */
    }
  };

  const onDrop = (status?: ApplicationStatus) => (e: React.DragEvent) => {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const a = data?.find((x) => x.id === id);
    if (!a || !status || a.status === status) return;
    update.mutate({ id, status }, { onSuccess: () => toast({ text: `${a.company} moved to ${status}.` }) });
  };

  return (
    <>
      <PageHeader
        title="Applications"
        subtitle={
          <>
            {`${data?.length ?? 0} ${(data?.length ?? 0) === 1 ? 'application' : 'applications'}`}
            <GmailHeaderStatus settingsLink />
          </>
        }
        actions={
          <>
            {/* Gmail sync and reviews happen here; connection management (disconnect, retries) is in Settings. */}
            <GmailHeaderAction
              showRemaining
              problemAsSync
              onReview={() =>
                document.getElementById('needs-review-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            />
            <ButtonLink to="/app/applications/new">Add application</ButtonLink>
          </>
        }
      />
      <NeedsReview />
      {!data?.length ? (
        <EmptyState
          title="No applications yet"
          text="Add the jobs you have applied for and track their status in one place."
          action={<ButtonLink to="/app/applications/new">Add your first application</ButtonLink>}
        />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Segmented label="View" options={['Board', 'Table'] as const} value={view} onChange={setV} />
            <div className="relative w-full max-w-xs">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-soft">
                <Icon.search />
              </span>
              <label htmlFor="app-search" className="sr-only">
                Search applications
              </label>
              <input
                id="app-search"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search company or role"
                className={cn(controlClass(), 'min-h-11 rounded-full bg-surface pl-11')}
              />
            </div>
            {view === 'Table' && (
              <select
                aria-label="Filter by status"
                value={statusFilter ?? ''}
                onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}
                className={cn(controlClass(), 'min-h-11 w-auto rounded-full bg-surface')}
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            )}
            {view === 'Board' && (
              <p className="ml-auto hidden text-[13px] text-soft md:block">
                Tip: drag a card to change its status.
              </p>
            )}
          </div>

          {view === 'Board' ? (
            <div className="-mx-5 overflow-x-auto px-5 pb-4 sm:mx-0 sm:px-0">
              <div className="grid min-w-[1000px] grid-cols-5 gap-3.5">
                {COLUMNS.map((col) => {
                  const items = list.filter((a) => col.statuses.includes(a.status));
                  return (
                    <section
                      key={col.name}
                      aria-label={col.name}
                      onDragOver={(e) => {
                        if (col.drop) {
                          e.preventDefault();
                          setOver(col.name);
                        }
                      }}
                      onDragLeave={() => setOver(null)}
                      onDrop={onDrop(col.drop)}
                      className={cn(
                        'flex min-h-[300px] flex-col gap-2.5 rounded-3xl p-1.5 transition-colors',
                        over === col.name && 'bg-tint',
                        statusFilter === col.name && 'ring-2 ring-accent',
                      )}
                    >
                      <div
                        className={cn(
                          col.slab,
                          'flex items-center justify-between rounded-full px-4 py-2.5 text-[#1c2b22]',
                        )}
                      >
                        <h2 className="text-sm font-semibold">{col.name}</h2>
                        <span className="text-sm font-semibold">{items.length}</span>
                      </div>
                      {items.map((a, i) => (
                        <CardItem key={a.id} a={a} i={i} />
                      ))}
                      {!items.length && (
                        <p className="px-3 py-6 text-center text-[13px] text-soft">Nothing here</p>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface animate-in">
              <table className="w-full min-w-[680px] text-left text-[15px]">
                <thead className="text-[13px] text-soft">
                  <tr className="border-b border-line">
                    {['Company', 'Role', 'Applied', 'Status', 'Work'].map((h) => (
                      <th key={h} className="px-5 py-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((a) => (
                    <tr key={a.id} className="border-b border-line last:border-0 hover:bg-bg">
                      <td className="px-5 py-3.5 font-medium">
                        <Link to={`/app/applications/${a.id}`} className="hover:underline">
                          {a.company}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-soft">{a.jobTitle}</td>
                      <td className="px-5 py-3.5 text-sm text-soft">{fmtDate(a.dateApplied, true)}</td>
                      <td className="px-5 py-3.5">
                        <StatusPill status={a.status} />
                        {a.suggestion && (
                          <span className="ml-2 text-xs font-semibold text-accent-ink">Needs review</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-soft">
                        {a.workArrangement ?? '—'}
                      </td>
                    </tr>
                  ))}
                  {!list.length && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-soft">
                        No applications match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
