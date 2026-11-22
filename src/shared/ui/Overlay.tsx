import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils';
import { Button } from './Button';

// ---------- Modal ----------
// Open dialogs, innermost last. Only the top one answers Escape and keeps Tab inside, so a confirmation shown over
// an editor never closes the editor too.
const openModals: symbol[] = [];

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeLabel = 'Close',
  showCloseButton = true,
  icon,
  iconClose,
  closeTone = 'neutral',
  dismissOnBackdrop = true,
  stackFooter,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'confirm' | 'fullscreen';
  closeLabel?: string;
  showCloseButton?: boolean;
  /** Optional decorative icon shown beside the title. */
  icon?: ReactNode;
  /** Use an accessible X icon button instead of the "Close" text button. */
  iconClose?: boolean;
  /** Colour of the X icon button: the default soft grey, or red. */
  closeTone?: 'neutral' | 'danger';
  /** When false, clicking the backdrop does nothing (Escape and the close button still work). */
  dismissOnBackdrop?: boolean;
  /** Footer buttons stack full-width on narrow screens (primary on top) and sit in one row from sm up. */
  stackFooter?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fullscreen = size === 'fullscreen';
  // Its place in the stack is kept for as long as it stays open.
  const [self] = useState(() => Symbol('modal'));
  // The latest onClose, so a new function on each render never re-runs the focus setup below (which would move
  // focus out of the field being typed in).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = useCallback(() => closeRef.current(), []);
  useEffect(() => {
    if (!open) return;
    openModals.push(self);
    return () => {
      openModals.splice(openModals.indexOf(self), 1);
    };
  }, [open, self]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const onKey = (e: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== self) return;
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'Tab' && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
        )).filter((el) => el.tagName === 'SUMMARY' || !el.closest('details:not([open])'));
        if (!f.length) return;
        const first = f[0],
          last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(
      () =>
        (
          ref.current?.querySelector<HTMLElement>('[data-autofocus]') ??
          ref.current?.querySelector<HTMLElement>('input, textarea, select, button')
        )?.focus(),
      30,
    );
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      prev?.focus();
    };
  }, [open, self]);
  if (!open) return null;
  return createPortal(
    <div className={cn(
      'fixed inset-0 z-50 flex items-end justify-center sm:items-center',
      !fullscreen && 'sm:p-6',
    )}>
      <div
        className="absolute inset-0 bg-[#06140d]/50 backdrop-blur-[2px] animate-in"
        onClick={dismissOnBackdrop ? close : undefined}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full overflow-y-auto bg-surface',
          fullscreen
            ? 'flex h-dvh flex-col p-4 sm:p-6'
            : 'max-h-[92vh] rounded-t-2xl p-6 shadow-2xl animate-pop sm:rounded-2xl sm:p-7',
          !fullscreen && (size === 'md' ? 'sm:max-w-lg' : size === 'confirm' ? 'sm:max-w-[560px]' : 'sm:max-w-2xl'),
        )}
      >
        <div className={cn('flex items-start justify-between gap-3', fullscreen ? 'mb-3 flex-wrap' : 'mb-5')}>
          <h2 className={cn('min-w-0 max-w-full text-2xl font-bold', !!icon && 'flex min-w-0 items-center gap-3')}>
            {icon}
            <span className="min-w-0 break-words">{title}</span>
          </h2>
          {showCloseButton && (iconClose ? (
            <button
              type="button"
              onClick={onClose}
              className={cn(
                '-mt-1 -mr-2 grid size-10 shrink-0 place-items-center rounded-full focus-visible:outline-2',
                closeTone === 'danger'
                  ? 'text-danger hover:bg-danger-soft focus-visible:outline-danger'
                  : 'text-soft hover:bg-tint hover:text-ink focus-visible:outline-primary',
              )}
              aria-label={closeLabel}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-sm font-semibold text-soft hover:bg-tint hover:text-ink"
              aria-label={closeLabel}
            >
              {closeLabel}
            </button>
          ))}
        </div>
        {children}
        {footer && (
          <div
            className={cn(
              'mt-6 flex gap-2.5',
              stackFooter ? 'flex-col-reverse sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto' : 'flex-wrap justify-end',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  text,
  confirmLabel,
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  text: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="leading-relaxed text-soft">{text}</p>
    </Modal>
  );
}

// ---------- Toasts ----------
interface Toast {
  id: number;
  text: string;
  tone: 'default' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
}
const ToastCtx = createContext<(t: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id' | 'tone'> & { tone?: Toast['tone'] }) => {
    const id = Date.now() + Math.random();
    setToasts((x) => [...x, { tone: 'default', ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 4500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex max-w-sm items-center gap-4 rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-in',
                t.tone === 'error' ? 'bg-danger text-white dark:text-[#2a0f0b]' : 'bg-ink text-bg',
              )}
            >
              <span>{t.text}</span>
              {t.action && (
                <button
                  className="font-bold underline underline-offset-2"
                  onClick={() => {
                    t.action!.onClick();
                    setToasts((x) => x.filter((y) => y.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
