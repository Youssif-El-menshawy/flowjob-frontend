import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { countryByCode, filterCountries, type CountryCode } from '@/shared/lib/phone';
import { cn } from '@/shared/lib/utils';
import { controlClass } from './Field';

const NO_COUNTRY = { code: '', name: 'No country', dial: '', flag: '' } as const;

/**
 * Searchable country picker (flag, name, optional dialing code) following the ARIA combobox/listbox pattern.
 * No dependency: the button shows the current country; its popover has a search box and a listbox.
 * Keyboard: ↑/↓ move, Enter selects, Esc closes and returns focus to the button.
 */
export function CountrySelect({
  value,
  onChange,
  label,
  disabled,
  invalid,
  showDialCode = true,
  onClear,
}: {
  value: CountryCode | '';
  onChange: (c: CountryCode) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  showDialCode?: boolean;
  onClear?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const matches = useMemo(() => filterCountries(query, showDialCode), [query, showDialCode]);
  const results = onClear && !query.trim() ? [NO_COUNTRY, ...matches] : matches;
  const current = value ? countryByCode(value) : undefined;
  const optId = (i: number) => `${id}-opt-${i}`;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const openMenu = () => {
    setQuery('');
    const i = value ? filterCountries('').findIndex((c) => c.code === value) : 0;
    setActive(value ? Math.max(0, i) + (onClear ? 1 : 0) : 0);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const choose = (c: CountryCode | '') => {
    if (c) onChange(c);
    else onClear?.();
    close();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(Math.max(0, results.length - 1), a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) choose(results[active].code);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't also close a surrounding dialog
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current ? `${label}: ${current.name}${showDialCode ? ` +${current.dial}` : ''}` : `${label}: not selected`}
        onClick={() => (open ? close(false) : openMenu())}
        className={cn(controlClass(invalid), 'flex min-h-12 w-full items-center justify-between gap-2 text-left')}
      >
        {current ? (
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden className="text-lg leading-none">{current.flag}</span>
            <span className={showDialCode ? "tabular-nums" : "truncate"}>{showDialCode ? `+${current.dial}` : current.name}</span>
          </span>
        ) : (
          <span className="text-soft/70">Country</span>
        )}
        <span aria-hidden className="text-xs text-soft">▾</span>
      </button>
      {open && (
        <div className={cn(
          'absolute left-0 z-30 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-xl',
          showDialCode ? 'w-[min(340px,86vw)]' : 'w-full',
        )}>
          <input
            autoFocus
            role="combobox"
            aria-label="Search countries"
            aria-expanded
            aria-controls={`${id}-list`}
            aria-activedescendant={results[active] ? optId(active) : undefined}
            aria-autocomplete="list"
            value={query}
            placeholder={showDialCode ? "Search country or code" : "Search country"}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            className="w-full border-b border-line bg-transparent px-3.5 py-3 text-[15px] outline-none placeholder:text-soft/60"
          />
          <ul ref={list} id={`${id}-list`} role="listbox" aria-label="Countries" className="max-h-60 overflow-y-auto py-1">
            {results.length === 0 && <li className="px-3.5 py-3 text-sm text-soft">No matching country.</li>}
            {results.map((c, i) => (
              <li
                key={c.code}
                id={optId(i)}
                role="option"
                aria-selected={c.code === value}
                data-active={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c.code)}
                onMouseMove={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-3.5 py-2 text-[15px]',
                  i === active && 'bg-tint',
                  c.code === value && 'font-semibold',
                )}
              >
                {c.flag && <span aria-hidden className="text-lg leading-none">{c.flag}</span>}
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {showDialCode && c.dial && <span className="shrink-0 tabular-nums text-soft">+{c.dial}</span>}
                {c.code === value && <span aria-hidden>✓</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
