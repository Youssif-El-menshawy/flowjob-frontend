import { cn } from '@/shared/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block size-5 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4', className)} />;
}

export function PageLoader() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center text-primary"
      role="status"
      aria-label="Loading"
    >
      <Spinner className="size-7" />
    </div>
  );
}
