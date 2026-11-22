import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useApproveReview, useDismissReview } from '@/shared/api/queries';
import type { ApplicationStatus, GmailReview, ReviewEdits } from '@/shared/api/types';
import { STATUSES } from '@/shared/api/types';
import { fmtDate } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Overlay';
import { activityLabel, fmtDateTime, fromLocalInput, reviewReason, safeGmailUrl, toLocalInput } from './gmailLabels';

const NEW = '__new__';

function Excerpt({ r }: { r: GmailReview }) {
  const url = safeGmailUrl(r.gmailUrl);
  return (
    <div className="flex flex-col gap-1.5">
      {r.excerpt && (
        // Plain text only: React escapes it, and no link inside an email is ever rendered.
        <blockquote className="rounded-xl bg-accent-soft px-4 py-3 text-sm leading-relaxed break-words">
          “{r.excerpt}”
        </blockquote>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-soft">
        <span>Email from {fmtDateTime(r.receivedAt)}</span>
        {r.proposal.eventType && <span>{activityLabel(r.proposal.eventType)}</span>}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
            Open in Gmail
          </a>
        )}
      </p>
    </div>
  );
}

/** One Gmail suggestion with its Approve / Edit / Dismiss actions. `onDone` runs after a decision is saved. */
export function ReviewCard({ r, onDone, onDirtyChange }: {
  r: GmailReview;
  onDone?: (id: string) => void;
  /** Called when the card gains or loses choices or edits that are not saved yet. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const approve = useApproveReview();
  const dismiss = useDismissReview();
  const [editing, setEditing] = useState(false);
  const p = r.proposal;
  const [company, setCompany] = useState(p.company ?? '');
  const [jobTitle, setJobTitle] = useState(p.jobTitle ?? '');
  const [dateApplied, setDateApplied] = useState(p.dateApplied ?? '');
  const [status, setStatus] = useState<ApplicationStatus>(
    (r.kind === 'status_change' ? p.to : p.status) ?? 'Applied',
  );
  const [target, setTarget] = useState<string>('');
  // Schedule suggestion: the user enters the time when the email's time could not be converted safely.
  const needsTime = r.kind === 'schedule_change' && !p.scheduledAt;
  const [when, setWhen] = useState(toLocalInput(p.scheduledAt));
  const busy = approve.isPending || dismiss.isPending;
  const proposedStatus = (r.kind === 'status_change' ? p.to : p.status) ?? 'Applied';
  const dirty = target !== '' || when !== toLocalInput(p.scheduledAt) || (editing && (
    company !== (p.company ?? '') || jobTitle !== (p.jobTitle ?? '') || dateApplied !== (p.dateApplied ?? '')
    || status !== proposedStatus));
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  // Synchronous guard: a fast double click must not send a second decision before React re-renders.
  const inFlight = useRef(false);
  const once = <T,>(run: (done: () => void) => T) => {
    if (inFlight.current) return;
    inFlight.current = true;
    run(() => {
      inFlight.current = false;
    });
  };

  const fail = (e: unknown) =>
    toast({
      text: e instanceof ApiError ? e.message : 'Could not save your decision. Try again.',
      tone: 'error',
    });

  const doApprove = (edits?: ReviewEdits, done = 'Saved.') =>
    once((release) =>
      approve.mutate(
        { id: r.id, edits },
        {
          onSuccess: () => {
            toast({ text: done });
            onDone?.(r.id);
          },
          onError: fail,
          onSettled: release,
        },
      ),
    );

  const title = (() => {
    switch (r.kind) {
      case 'new_application':
        return `New application: ${p.company ?? 'Unknown employer'} · ${p.jobTitle ?? 'Unknown role'}`;
      case 'ambiguous_link':
        return `Which application is this? ${p.company ?? ''}${p.jobTitle ? ` · ${p.jobTitle}` : ''}`;
      case 'status_change':
        return `Move ${r.application?.company ?? 'this application'} to ${p.to}?`;
      case 'schedule_change':
        return `Update the date for ${r.application?.company ?? 'this application'}?`;
    }
  })();

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-accent/60 bg-surface p-4 animate-in">
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{title}</p>
        {r.kind === 'status_change' && r.application && (
          <p className="text-sm text-soft">
            <Link to={`/app/applications/${r.application.id}`} className="hover:underline">
              {r.application.jobTitle}
            </Link>{' '}
            · now {p.from} → suggested {p.to}
          </p>
        )}
        {r.kind === 'schedule_change' && r.application && (
          <p className="text-sm text-soft">{r.application.jobTitle}</p>
        )}
        {r.kind === 'schedule_change' && !needsTime && (
          <p className="text-sm text-soft">
            New: {fmtDateTime(p.scheduledAt)}
            {p.previousScheduledAt && (
              <>
                {' '}
                · was <s>{fmtDateTime(p.previousScheduledAt)}</s>
              </>
            )}
          </p>
        )}
        {needsTime && p.statedTime && (
          // Plain text as the email states it; never converted or guessed.
          <p className="text-sm text-soft break-words">The email says: {p.statedTime}</p>
        )}
        {r.kind === 'new_application' && p.dateApplied && (
          <p className="text-sm text-soft">
            Date: {fmtDate(p.dateApplied, true)}
            {p.dateProvisional && ' (date of this email, not a confirmed submission date)'}
          </p>
        )}
        {reviewReason(r) && <p className="text-[13px] text-accent-ink">{reviewReason(r)}</p>}
      </div>
      <Excerpt r={r} />

      {r.kind === 'ambiguous_link' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Choose the matching application</legend>
          {r.candidates.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name={`target-${r.id}`} value={c.id} checked={target === c.id}
                onChange={() => setTarget(c.id)} />
              {c.company} · {c.jobTitle} <span className="text-soft">({c.status})</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name={`target-${r.id}`} value={NEW} checked={target === NEW}
              onChange={() => setTarget(NEW)} />
            It is a new application
          </label>
        </fieldset>
      )}

      {editing && r.kind === 'new_application' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Employer" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={200} />
          <Input label="Job title" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} maxLength={200} />
          <Input label="Date applied" type="date" value={dateApplied} onChange={(e) => setDateApplied(e.target.value)} />
          <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </div>
      )}
      {needsTime && (
        <Input
          label="Date and time (your time zone)"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
      )}
      {editing && r.kind === 'status_change' && (
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </Select>
      )}

      <div className="flex flex-wrap gap-2">
        {r.kind === 'ambiguous_link' ? (
          <Button size="sm" disabled={!target || busy} loading={approve.isPending}
            onClick={() => doApprove(target === NEW ? {} : { applicationId: target },
              target === NEW ? 'Application added.' : 'Linked to your application.')}>
            Approve
          </Button>
        ) : needsTime ? (
          <Button size="sm" disabled={!fromLocalInput(when) || busy} loading={approve.isPending}
            onClick={() => doApprove({ scheduledAt: fromLocalInput(when)! }, 'Date saved.')}>
            Save date
          </Button>
        ) : editing ? (
          <Button size="sm" loading={approve.isPending} disabled={busy || (r.kind === 'new_application' && (!company.trim() || !jobTitle.trim()))}
            onClick={() => doApprove(r.kind === 'new_application'
              ? { company: company.trim(), jobTitle: jobTitle.trim(), status, ...(dateApplied ? { dateApplied } : {}) }
              : { status }, 'Saved.')}>
            Save and approve
          </Button>
        ) : (
          <Button size="sm" loading={approve.isPending} disabled={busy}
            onClick={() => doApprove(undefined, r.kind === 'new_application' ? 'Application added.' : 'Saved.')}>
            Approve
          </Button>
        )}
        {(r.kind === 'new_application' || r.kind === 'status_change') && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing((v) => !v)}>
            {editing ? 'Cancel edit' : 'Edit'}
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} loading={dismiss.isPending}
          onClick={() =>
            once((release) =>
              dismiss.mutate(r.id, {
                onSuccess: () => {
                  toast({ text: 'Dismissed.' });
                  onDone?.(r.id);
                },
                onError: fail,
                onSettled: release,
              }),
            )
          }>
          Dismiss
        </Button>
      </div>
    </li>
  );
}
