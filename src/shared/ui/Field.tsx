import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/shared/lib/utils';
import { Icon } from './Icons';

export const controlClass = (invalid?: boolean) =>
  cn(
    'w-full rounded-xl border bg-field px-3.5 text-[15px] text-ink placeholder:text-soft/60',
    'transition-[border-color,box-shadow,background-color] duration-150 focus:outline-none focus:border-primary focus:bg-surface focus:ring-4 focus:ring-primary/10',
    invalid ? 'border-danger' : 'border-line hover:border-soft/50',
  );

interface Wrap {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  labelAction?: ReactNode;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  optional,
  className,
  labelAction,
  children,
}: Wrap & { id: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label} {optional && <span className="font-normal text-soft">(optional)</span>}
        </label>
        {labelAction}
      </div>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-[13px] text-danger animate-in">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  Wrap & InputHTMLAttributes<HTMLInputElement> & { icon?: keyof typeof Icon }
>(function Input({ label, hint, error, optional, className, labelAction, icon, type, ...rest }, ref) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  const Ico = icon ? Icon[icon] : null;
  return (
    <FieldShell id={id} {...{ label, hint, error, optional, className, labelAction }}>
      <div className="relative">
        {Ico && (
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-soft">
            <Ico />
          </span>
        )}
        <input
          ref={ref}
          id={id}
          type={isPw && show ? 'text' : type}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={cn(controlClass(!!error), 'min-h-12', Ico && 'pl-11', isPw && 'pr-12')}
          {...rest}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-soft hover:bg-tint hover:text-ink"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <Icon.eyeOff /> : <Icon.eye />}
          </button>
        )}
      </div>
    </FieldShell>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, Wrap & TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ label, hint, error, optional, className, labelAction, rows = 4, ...rest }, ref) {
    const id = useId();
    return (
      <FieldShell id={id} {...{ label, hint, error, optional, className, labelAction }}>
        <textarea
          ref={ref}
          id={id}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={cn(controlClass(!!error), 'py-3 leading-relaxed resize-y')}
          {...rest}
        />
      </FieldShell>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, Wrap & SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ label, hint, error, optional, className, labelAction, children, ...rest }, ref) {
    const id = useId();
    return (
      <FieldShell id={id} {...{ label, hint, error, optional, className, labelAction }}>
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error}
          className={cn(controlClass(!!error), 'min-h-12 pr-8')}
          {...rest}
        >
          {children}
        </select>
      </FieldShell>
    );
  },
);
