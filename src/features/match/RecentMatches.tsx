import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDeleteMatch, useMatches } from '@/shared/api/queries';
import type { MatchResult } from '@/shared/api/types';
import { fmtDate } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icons';
import { Modal } from '@/shared/ui/Overlay';

function MatchActions({ label, onDelete }: { label: string; onDelete: () => void }) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const close = () => {
    if (details.current) details.current.open = false;
  };
  return (
    <details
      ref={details}
      className="relative mr-1.5 shrink-0 sm:mr-2"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !details.current?.open) return;
        event.stopPropagation();
        close();
        trigger.current?.focus();
      }}
    >
      <summary
        ref={trigger}
        aria-label={`Actions for ${label}`}
        className="grid size-11 cursor-pointer list-none place-items-center rounded-full text-xl text-soft hover:bg-tint hover:text-ink focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden>⋯</span>
      </summary>
      <div className="absolute right-0 z-20 mt-1 min-w-36 rounded-xl border border-line bg-surface p-1 shadow-lg">
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start text-danger hover:bg-danger-soft"
          onClick={() => {
            close();
            trigger.current?.focus();
            onDelete();
          }}
        >
          <Icon.trash /> Delete match
        </Button>
      </div>
    </details>
  );
}

function DeleteMatchDialog({ match, onClose }: { match: MatchResult; onClose: () => void }) {
  const deletion = useDeleteMatch();
  const close = useCallback(() => {
    if (!deletion.isPending) onClose();
  }, [deletion.isPending, onClose]);

  return (
    <Modal
      open
      onClose={close}
      title="Delete match?"
      size="confirm"
      showCloseButton={false}
      footer={
        <>
          <Button variant="secondary" disabled={deletion.isPending} onClick={close} data-autofocus>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={deletion.isPending}
            onClick={() => deletion.mutate(match.id, { onSuccess: onClose })}
          >
            Delete match
          </Button>
        </>
      }
    >
      <p className="break-words text-soft">
        Delete the match report for <strong>{match.jobTitle}</strong>
        {match.company && <> at <strong>{match.company}</strong></>}?
      </p>
      {deletion.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          Could not delete this match. Please try again.
        </p>
      )}
    </Modal>
  );
}

export function RecentMatches() {
  const { data: matches } = useMatches();
  const [selected, setSelected] = useState<MatchResult | null>(null);
  const close = useCallback(() => setSelected(null), []);

  return (
    <>
      {!!matches?.length && (
        <section className="mt-12" aria-labelledby="recent-matches">
          <h2 id="recent-matches" className="mb-3 text-[17px] font-semibold">
            Recent matches
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {matches.slice(0, 5).map((match) => {
              const label = match.company ? `${match.jobTitle} · ${match.company}` : match.jobTitle;
              return (
                <li key={match.id} className="group flex items-center">
                  <Link
                    to={`/app/match/${match.id}`}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 hover:bg-bg group-first:rounded-tl-2xl group-last:rounded-bl-2xl sm:gap-4 sm:px-4"
                  >
                    <span className="font-display w-12 shrink-0 text-lg font-semibold">
                      {match.scoreAvailable === false ? '—' : `${match.score}%`}
                    </span>
                    <span className="grid min-w-0 flex-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                      <span className="truncate">{label}</span>
                      <span className="text-xs text-soft sm:text-sm">{fmtDate(match.createdAt)}</span>
                    </span>
                    <Icon.arrowRight />
                  </Link>
                  <MatchActions label={label} onDelete={() => setSelected(match)} />
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {selected && <DeleteMatchDialog match={selected} onClose={close} />}
    </>
  );
}
