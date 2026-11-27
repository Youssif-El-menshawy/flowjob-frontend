import { buttonClass } from '@/shared/ui/Button';
import { cn } from '@/shared/lib/utils';

/**
 * A safe link to the employer's job posting, or null. Accepts http(s) links and bare domains people type
 * ("acme.com/jobs/1"); anything else (another scheme, spaces, no domain) gets no button rather than a broken one.
 */
export function jobPostingHref(url: string | null | undefined): string | null {
  const text = (url ?? '').trim();
  if (!text || /\s/.test(text)) return null;
  if (/^https?:\/\/[^/]+\.[^/]+/i.test(text)) return text;
  if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return null;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(?=[/?#]|$)/i.test(text) ? `https://${text}` : null;
}

/** "Apply now": opens the job posting in a new tab, so the person can apply and then track the application. */
export function ApplyNowLink({
  jobUrl,
  full,
  className,
}: {
  jobUrl?: string | null;
  full?: boolean;
  className?: string;
}) {
  const href = jobPostingHref(jobUrl);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonClass('secondary', 'md', full), className)}
    >
      Apply now<span className="sr-only"> (opens the job posting in a new tab)</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
