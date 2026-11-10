import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useApplication,
  useCvs,
  useDeleteApplication,
  useReviewSuggestion,
  useUndoEvent,
  useUpdateApplication,
} from '@/shared/api/queries';
import type { ApplicationStatus } from '@/shared/api/types';
import { STATUSES } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn, fmtDate, suggestionPhrase } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, PageHeader, STATUS_STYLE, StatusPill } from '@/shared/ui/Display';
import { ConfirmDialog, Modal, useToast } from '@/shared/ui/Overlay';
import { PageLoader } from '@/shared/ui/Spinner';
import { ApplicationForm } from './ApplicationForm';

const SOURCE = {
  manual: 'Changed by you',
  gmail_auto: 'From Gmail · applied automatically',
  gmail_confirmed: 'From Gmail · you confirmed',
};

export default function ApplicationDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { data: a, isLoading } = useApplication(id);
  const cvs = useCvs();
  const update = useUpdateApplication();
  const review = useReviewSuggestion();
  const undo = useUndoEvent();
  const del = useDeleteApplication();
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  useDocumentTitle(a ? a.company : 'Application');

  if (isLoading) return <PageLoader />;
  if (!a)
    return (
      <EmptyState
        title="Application not found"
        text="It may have been deleted."
        action={<ButtonLink to="/app/applications">Back to applications</ButtonLink>}
      />
    );
  const cv = cvs.data?.find((c) => c.id === a.cvId);
  const missingCvLabel = cvs.isError ? 'Could not load attached CV'
    : cvs.data ? 'CV no longer available' : 'Loading attached CV…';
  // The real backend does not store a per-event timeline (Gmail/history is a deferred
  // feature); show the current status as a single entry. Demo (MSW) data has full history.
  const history =
    a.history && a.history.length
      ? [...a.history].reverse()
      : [{ id: 'current', status: a.status, at: a.updatedAt, source: 'manual' as const }];

  const setStatus = (status: ApplicationStatus) => {
    setStatusOpen(false);
    if (status === a.status) return;
    update.mutate({ id: a.id, status }, { onSuccess: () => toast({ text: `Moved to ${status}.` }) });
  };

  return (
    <>
      <PageHeader
        back={{ to: '/app/applications', label: 'Back to applications' }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {a.company} <StatusPill key={a.status} status={a.status} className="animate-pop text-sm" />
          </span>
        }
        subtitle={`${a.jobTitle}${a.dateApplied ? ` · applied ${fmtDate(a.dateApplied, true)}` : ''}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            <Button onClick={() => setStatusOpen(true)}>Change status</Button>
          </>
        }
      />

      {a.suggestion && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-3xl border border-accent/60 bg-accent-soft p-5 animate-in">
          <div className="min-w-[260px] flex-1">
            <p className="font-display text-lg font-semibold">
              Gmail found what looks like {suggestionPhrase(a.suggestion.proposedStatus)}
            </p>
            <p className="mt-1 text-sm text-soft">
              {a.suggestion.snippet} · {fmtDate(a.suggestion.receivedAt)}, {a.suggestion.from}
            </p>
            <p className="mt-1 text-[13px] text-accent-ink">
              We never change a status on our own when we are unsure.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={review.isPending}
              onClick={() =>
                review.mutate(
                  { id: a.id, action: 'reject' },
                  { onSuccess: () => toast({ text: 'Got it. Status unchanged.' }) },
                )
              }
            >
              Not right
            </Button>
            <Button
              loading={review.isPending && review.variables?.action === 'confirm'}
              onClick={() => review.mutate({ id: a.id, action: 'confirm' })}
            >
              Move to {a.suggestion.proposedStatus}
            </Button>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[380px_1fr]">
        <div className="flex flex-col gap-5">
          <Card className="animate-in">
            <h2 className="mb-2 text-[17px] font-semibold">Details</h2>
            <dl>
              {[
                ['Company', a.company],
                ['Job title', a.jobTitle],
                ['Date applied', a.dateApplied ? fmtDate(a.dateApplied, true) : '—'],
                ['Location', a.location || '—'],
                ['Work arrangement', a.workArrangement || '—'],
                ['Employment type', a.employmentType || '—'],
                ['Follow-up', a.followUpDate ? fmtDate(a.followUpDate, true) : '—'],
                [
                  'Job post',
                  a.jobUrl ? (
                    <a
                      key="u"
                      href={a.jobUrl.startsWith('http') ? a.jobUrl : `https://${a.jobUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {a.jobUrl.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    '—'
                  ),
                ],
                ['Notes', a.notes || '—'],
              ].map(([k, v]) => (
                <div
                  key={k as string}
                  className="flex justify-between gap-4 border-b border-line py-3 text-[15px] last:border-0"
                >
                  <dt className="shrink-0 text-soft">{k}</dt>
                  <dd className="min-w-0 text-right break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <Card
            className="flex items-center justify-between gap-4 animate-in"
            style={{ animationDelay: '.06s' }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-soft">CV you sent</p>
              <p className="truncate font-medium">{cv?.name ?? (a.cvId ? missingCvLabel : 'Not linked')}</p>
            </div>
            {cv ? (
              <ButtonLink size="sm" variant="secondary" to="/app/cvs">
                Open
              </ButtonLink>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                {a.cvId ? 'Edit attachment' : 'Link a CV'}
              </Button>
            )}
          </Card>
          <button
            onClick={() => setRemoving(true)}
            className="self-start px-1 text-sm font-medium text-danger hover:underline"
          >
            Delete application
          </button>
        </div>

        <Card className="animate-in" style={{ animationDelay: '.1s' }}>
          <h2 className="mb-5 text-[17px] font-semibold">History</h2>
          <ol className="flex flex-col">
            {history.map((e, i) => (
              <li
                key={e.id}
                className="flex gap-4 pb-6 last:pb-0 animate-in"
                style={{ animationDelay: `${0.12 + i * 0.06}s` }}
              >
                <span className="w-16 shrink-0 pt-1 text-sm text-soft">{fmtDate(e.at)}</span>
                <span className="relative flex w-3 shrink-0 justify-center">
                  <span className={cn('mt-1.5 size-3 rounded-full', STATUS_STYLE[e.status].slab)} />
                  {i < history.length - 1 && <span className="absolute top-6 -bottom-5 w-px bg-line" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <StatusPill status={e.status} />
                    <span className="text-[13px] text-soft">
                      {i === history.length - 1 ? 'Added by you' : SOURCE[e.source]}
                    </span>
                  </div>
                  {e.note && <p className="mt-1.5 text-[15px] leading-relaxed text-soft">{e.note}</p>}
                  {i === 0 && history.length > 1 && (
                    <button
                      className="mt-1.5 text-[13px] font-semibold text-accent-ink hover:underline"
                      onClick={() =>
                        undo.mutate(
                          { id: a.id, eventId: e.id },
                          { onSuccess: () => toast({ text: 'Change undone.' }) },
                        )
                      }
                    >
                      Undo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit details" size="lg">
        <ApplicationForm
          mode="edit"
          defaults={a}
          submitLabel="Save changes"
          onCancel={() => setEditing(false)}
          onSubmit={(v) =>
            update
              .mutateAsync({ id: a.id, ...v })
              .then(() => {
                setEditing(false);
                toast({ text: 'Details saved.' });
              })
          }
        />
      </Modal>
      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title="Change status">
        <div className="grid gap-2 sm:grid-cols-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-2xl border px-4 text-left font-medium transition-colors',
                s === a.status ? 'border-primary bg-tint' : 'border-line hover:bg-tint',
              )}
            >
              <span className={cn('size-3 rounded-full', STATUS_STYLE[s].slab)} />
              {s}
              {s === a.status && <span className="ml-auto text-xs text-soft">Current</span>}
            </button>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title={`Delete ${a.company}?`}
        text="The application and its history will be removed. This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(a.id, {
            onSuccess: () => {
              toast({ text: `${a.company} deleted.` });
              nav('/app/applications', { replace: true });
            },
          })
        }
      />
    </>
  );
}
