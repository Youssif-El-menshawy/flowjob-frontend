import { useState } from 'react';
import { ApiError } from '@/shared/api/client';
import { useCorrectActivity, useDismissActivity } from '@/shared/api/queries';
import type { ActivityEvent, ActivityType } from '@/shared/api/types';
import { ACTIVITY_TYPES } from '@/shared/api/types';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Display';
import { Input, Select } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Overlay';
import {
  activityLabel,
  fmtDateTime,
  fromLocalInput,
  isDeadline,
  safeGmailUrl,
  toLocalInput,
} from './gmailLabels';

function Entry({ appId, e }: { appId: string; e: ActivityEvent }) {
  const toast = useToast();
  const correct = useCorrectActivity();
  const dismiss = useDismissActivity();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<ActivityType>(e.eventType);
  const [when, setWhen] = useState(toLocalInput(e.scheduledAt));
  const url = safeGmailUrl(e.gmailUrl);
  const busy = correct.isPending || dismiss.isPending;
  const fail = (err: unknown) =>
    toast({ text: err instanceof ApiError ? err.message : 'Could not save. Try again.', tone: 'error' });

  const save = () => {
    const body: { eventType?: string; scheduledAt?: string | null } = {};
    if (type !== e.eventType) body.eventType = type;
    const iso = fromLocalInput(when);
    if (toLocalInput(e.scheduledAt) !== when) body.scheduledAt = iso;
    correct.mutate(
      { appId, eventId: e.id, ...body },
      { onSuccess: () => { setEditing(false); toast({ text: 'Activity corrected.' }); }, onError: fail },
    );
  };

  return (
    <li className="flex flex-col gap-1.5 border-b border-line pb-4 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {activityLabel(e.eventType)}
          {e.corrected && <span className="ml-2 text-xs font-normal text-soft">corrected by you</span>}
        </p>
        <span className="text-[13px] text-soft">{fmtDateTime(e.occurredAt)}</span>
      </div>
      {e.scheduledAt && (
        <p className="text-sm">
          {isDeadline(e.eventType) ? 'Deadline' : 'Scheduled'}: <strong className="font-semibold">{fmtDateTime(e.scheduledAt)}</strong>
          {e.previousScheduledAt && (
            <span className="text-soft">
              {' '}
              · previously <s>{fmtDateTime(e.previousScheduledAt)}</s>
            </span>
          )}
        </p>
      )}
      {e.excerpt && (
        <blockquote className="text-sm leading-relaxed break-words text-soft">“{e.excerpt}”</blockquote>
      )}
      {editing ? (
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          <Select label="Activity type" value={type} onChange={(ev) => setType(ev.target.value as ActivityType)}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {activityLabel(t)}
              </option>
            ))}
          </Select>
          <Input label="Date and time" optional type="datetime-local" value={when} onChange={(ev) => setWhen(ev.target.value)} />
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" loading={correct.isPending} disabled={busy} onClick={save}>
              Save
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
              Open in Gmail
            </a>
          )}
          <button className="font-medium text-primary hover:underline disabled:opacity-50" disabled={busy} onClick={() => setEditing(true)}>
            Correct
          </button>
          <button
            className="font-medium text-danger hover:underline disabled:opacity-50"
            disabled={busy}
            onClick={() => dismiss.mutate({ appId, eventId: e.id }, { onSuccess: () => toast({ text: 'Activity dismissed.' }), onError: fail })}
          >
            Dismiss
          </button>
        </div>
      )}
    </li>
  );
}

export function ActivityTimeline({ appId, events }: { appId: string; events: ActivityEvent[] }) {
  if (!events.length) return null;
  return (
    <Card className="animate-in" aria-labelledby="activity-title">
      <h2 id="activity-title" className="mb-1 text-[17px] font-semibold">
        Recruitment activity
      </h2>
      <p className="mb-4 text-[13px] text-soft">From your Gmail. Correct or dismiss anything that looks wrong.</p>
      <ol className="flex flex-col gap-4">
        {[...events].reverse().map((e) => (
          <Entry key={e.id} appId={appId} e={e} />
        ))}
      </ol>
    </Card>
  );
}
