import { useGmail, useGmailReviews } from '@/shared/api/queries';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Display';
import { ReviewCard } from './ReviewCard';

/** Inline Needs Review section on the Applications page. Renders nothing when there is nothing to decide. */
export function NeedsReview() {
  const gmail = useGmail();
  const count = gmail.data?.pendingReviewCount ?? 0;
  const reviews = useGmailReviews(count > 0);
  if (count === 0) return null;
  return (
    <Card className="mb-6 animate-in" aria-labelledby="needs-review-title">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="size-2.5 rounded-full bg-accent animate-pulse-dot" />
        <h2 id="needs-review-title" className="text-[17px] font-semibold">
          Needs review
        </h2>
        <span className="ml-auto text-sm text-soft">{count} waiting</span>
      </div>
      {reviews.isLoading ? (
        <p className="text-sm text-soft">Loading suggestions…</p>
      ) : reviews.isError ? (
        <div className="flex items-center gap-3">
          <p role="alert" className="text-sm text-danger">Could not load suggestions.</p>
          <Button size="sm" variant="secondary" onClick={() => void reviews.refetch()}>Retry</Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {(reviews.data ?? []).map((r) => (
            <ReviewCard key={r.id} r={r} />
          ))}
        </ul>
      )}
    </Card>
  );
}
