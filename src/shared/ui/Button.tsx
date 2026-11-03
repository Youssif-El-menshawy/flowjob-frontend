import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', full = false) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none',
    'transition-[transform,filter,background-color,border-color,opacity] duration-150 active:scale-[0.97]',
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
    size === 'md' ? 'min-h-11 px-5 text-[15px]' : 'min-h-9 px-4 text-sm',
    variant === 'primary' && 'bg-primary text-on-primary hover:brightness-110',
    variant === 'secondary' && 'bg-surface text-ink border border-line hover:bg-tint',
    variant === 'ghost' && 'text-primary hover:bg-tint',
    variant === 'danger' && 'bg-surface text-danger border border-danger/40 hover:bg-danger-soft',
    full && 'w-full',
  );
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  full?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    full,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonClass(variant, size, full), className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  );
});

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  full,
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; full?: boolean }) {
  return <Link className={cn(buttonClass(variant, size, full), className)} {...rest} />;
}
