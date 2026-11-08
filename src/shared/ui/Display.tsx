import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ApplicationStatus } from '@/shared/api/types';
import { cn } from '@/shared/lib/utils';

export function Card({
  className,
  children,
  style,
  as: As = 'section',
}: {
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
  as?: 'section' | 'div' | 'article';
}) {
  return (
    <As style={style} className={cn('rounded-2xl border border-line bg-surface p-6', className)}>
      {children}
    </As>
  );
}

export function CardTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex items-baseline justify-between gap-3', className)}>
      <h2 className="text-[17px] font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export const STATUS_STYLE: Record<ApplicationStatus, { pill: string; slab: string }> = {
  Saved: { pill: 'bg-[#e4e9ef] text-[#3f5468]', slab: 'bg-st-saved' },
  Applied: { pill: 'bg-[#dceafb] text-[#1f4e86]', slab: 'bg-st-applied' },
  Interview: { pill: 'bg-[#e6e1fb] text-[#4b3a9e]', slab: 'bg-st-interview' },
  Offer: { pill: 'bg-[#d6f0df] text-[#1e6b3e]', slab: 'bg-st-offer' },
  Rejected: { pill: 'bg-[#f6dcd7] text-[#7a2a20]', slab: 'bg-st-rejected' },
  Withdrawn: { pill: 'bg-[#eceae3] text-[#4f4d46]', slab: 'bg-st-withdrawn' },
};

export function StatusPill({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold whitespace-nowrap',
        STATUS_STYLE[status].pill,
        className,
      )}
    >
      {status}
    </span>
  );
}

export function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn('h-2.5 overflow-hidden rounded-full bg-side', className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-full bg-accent animate-fill"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
  className,
}: {
  title: string;
  text: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center animate-in',
        className,
      )}
    >
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-[15px] leading-relaxed text-soft">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-in">
      <div className="flex min-w-0 flex-col gap-1.5">
        {back && (
          <Link to={back.to} className="mb-1 w-fit text-sm font-semibold text-primary hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[30px] leading-tight font-semibold sm:text-[34px]">{title}</h1>
        {subtitle && <p className="text-base text-soft">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 30" className={cn('size-[30px]', className)} aria-hidden>
      <rect x="2" y="16" width="8" height="12" rx="2" className="fill-primary" />
      <rect x="11" y="10" width="8" height="18" rx="2" fill="#6F9A7C" />
      <rect x="20" y="3" width="8" height="25" rx="2" className="fill-accent" />
    </svg>
  );
}

export function Logo({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex w-fit items-center gap-2.5 text-ink" aria-label="FlowJob home">
      <LogoMark />
      <span className="font-display text-[21px] font-bold tracking-tight">FlowJob</span>
    </Link>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (t: T) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={t === value}
          onClick={() => onChange(t)}
          className={cn(
            'min-h-11 shrink-0 px-0.5 text-[15px] transition-[color,box-shadow] duration-150',
            t === value
              ? 'font-semibold text-ink shadow-[inset_0_-3px_0_var(--accent)]'
              : 'font-medium text-soft hover:text-ink',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (t: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-full bg-side p-1">
      {options.map((o) => (
        <button
          key={o}
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cn(
            'min-h-9 rounded-full px-4 text-sm font-medium transition-colors',
            o === value ? 'bg-surface text-ink shadow-sm' : 'text-soft hover:text-ink',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Note({
  children,
  tone = 'tint',
  className,
}: {
  children: ReactNode;
  tone?: 'tint' | 'accent' | 'success';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl px-4 py-3 text-sm leading-relaxed',
        tone === 'tint' && 'bg-tint',
        tone === 'accent' && 'bg-accent-soft',
        tone === 'success' && 'bg-success-bg text-success-ink',
        className,
      )}
    >
      {children}
    </div>
  );
}
