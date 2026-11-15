import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { qk, useGmail, useGmailReviews } from '@/shared/api/queries';
import type { GmailStatus } from '@/shared/api/types';
import { buttonClass, Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icons';
import { Modal } from '@/shared/ui/Overlay';
import { ReviewCard } from './ReviewCard';

/**
 * Slim bar above the board while Gmail suggestions wait for a decision. The whole bar is one button that opens
 * the review dialog; it renders nothing when there is nothing to review.
 */
export function NeedsReviewBar({ onOpen }: { onOpen: () => void }) {
  const gmail = useGmail();
  const count = gmail.data?.pendingReviewCount ?? 0;
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mb-6 flex w-full items-center gap-3 rounded-2xl border border-accent/50 bg-surface px-4 py-3.5 text-left transition-colors animate-in hover:bg-accent-soft/40 sm:px-5"
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-accent animate-pulse-dot" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">Needs review</span>
        <span className="block text-sm text-soft">
          {count} waiting · Gmail suggestions need your decision
        </span>
      </span>
      <span className={buttonClass('primary', 'sm')}>Review</span>
    </button>
  );
}

/**
 * The review dialog: one suggestion at a time ("1 of N", Previous / Next) with the existing Approve / Edit /
 * Dismiss card. Nothing changes until the user acts on a card; closing just closes. A decided suggestion leaves
 * the list (and the counts) at once, and the dialog closes when none remain.
 */
export function ReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const reviews = useGmailReviews(open);
  const [index, setIndex] = useState(0);
  const [decided, setDecided] = useState<ReadonlySet<string>>(() => new Set());
  const positionRef = useRef<HTMLParagraphElement>(null);

  // The Modal re-runs its focus setup when `onClose` changes identity, so keep a stable wrapper.
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  const close = useCallback(() => latestClose.current(), []);

  useEffect(() => {
    if (!open) {
      setIndex(0);
      setDecided(new Set());
    }
  }, [open]);

  const list = (reviews.data ?? []).filter((r) => !decided.has(r.id));
  const i = Math.min(index, Math.max(0, list.length - 1));
  const current = list[i];

  // Close when nothing is left: after the last decision at once; otherwise once fresh data confirms it.
  const empty = open && reviews.isSuccess && list.length === 0 && (decided.size > 0 || !reviews.isFetching);
  useEffect(() => {
    if (empty) close();
  }, [empty, close]);

  const onDone = (id: string) => {
    setDecided((prev) => new Set(prev).add(id));
    // Update the counts everywhere right away; the refetch that follows the decision confirms them.
    qc.setQueryData<GmailStatus>(qk.gmail, (g) =>
      g ? { ...g, pendingReviewCount: Math.max(0, (g.pendingReviewCount ?? 0) - 1) } : g,
    );
    // The decided card unmounts; keep keyboard focus inside the dialog.
    setTimeout(() => positionRef.current?.focus(), 0);
  };

  return (
    <Modal open={open && !empty} onClose={close} title="Needs review" size="lg" iconClose closeLabel="Close review">
      {reviews.isLoading ? (
        <p className="text-sm text-soft" role="status">
          Loading suggestions…
        </p>
      ) : reviews.isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <p role="alert" className="text-sm text-danger">
            Could not load suggestions.
          </p>
          <Button size="sm" variant="secondary" onClick={() => void reviews.refetch()}>
            Retry
          </Button>
        </div>
      ) : current ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              ref={positionRef}
              tabIndex={-1}
              aria-live="polite"
              className="text-sm font-semibold text-soft focus:outline-none"
            >
              {i + 1} of {list.length}
            </p>
            {list.length > 1 && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={i === 0}
                  onClick={() => setIndex(i - 1)}
                  aria-label="Previous suggestion"
                >
                  <Icon.arrowLeft /> Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={i >= list.length - 1}
                  onClick={() => setIndex(i + 1)}
                  aria-label="Next suggestion"
                >
                  Next <Icon.arrowRight />
                </Button>
              </div>
            )}
          </div>
          <ul aria-label="Suggestion">
            {/* Keyed by id: moving to another suggestion drops any unsaved edits on this one. */}
            <ReviewCard key={current.id} r={current} onDone={onDone} />
          </ul>
          <p className="text-[13px] text-soft">
            Nothing changes until you approve, save or dismiss. Closing keeps every suggestion for later.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
