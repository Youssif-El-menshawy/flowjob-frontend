import { useEffect, useId, useRef, useState } from 'react';
import { MONTH_NAMES, formatDate, parseDate } from '@/shared/lib/dates';
import { cn } from '@/shared/lib/utils';
import { controlClass } from './Field';

const THIS_YEAR = new Date().getFullYear();

/**
 * Reusable month + year selector. Controlled by a string value in the CV's stored format
 * ("Jul 2026", or a bare "2023"). Month and year can be picked in any order: a month chosen
 * before a year is held locally (the stored string can't express it) and reported through
 * `onIncompleteChange`, so the parent can ask for the year when saving. A year alone is a valid
 * date. An existing free-text value we cannot parse is kept and shown until the user picks a new date.
 */
export function MonthYearPicker({
  label,
  value,
  onChange,
  disabled,
  error,
  optional,
  onIncompleteChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
  optional?: boolean;
  /** True while a month is chosen without a year (an incomplete date). */
  onIncompleteChange?: (incomplete: boolean) => void;
}) {
  const id = useId();
  const p = parseDate(value);
  const fromValue = () => ({
    year: p.kind === 'date' ? p.year : '',
    month: p.kind === 'date' ? p.month : '',
  });
  const [{ year, month }, setParts] = useState(fromValue);
  const lastEmitted = useRef(value);
  // Re-sync only when the value was changed from outside (item loaded, Present toggled); our own
  // emissions are ignored so a half-picked month survives the round trip.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setParts(fromValue());
    onIncompleteChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const change = (y: string, m: string) => {
    setParts({ year: y, month: m });
    const next = formatDate(y, m);
    lastEmitted.current = next;
    onIncompleteChange?.(!y && !!m);
    onChange(next);
  };
  const years: string[] = [];
  for (let y = THIS_YEAR + 10; y >= 1950; y--) years.push(String(y));
  if (year && !years.includes(year)) years.push(year); // keep an out-of-range stored year selectable

  const sel = cn(controlClass(!!error), 'min-h-12 pr-8');
  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0"
      aria-describedby={error ? `${id}-err` : undefined}
      disabled={disabled}
    >
      <legend className="mb-2 text-sm font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-soft">(optional)</span>}
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <select
          aria-label={`${label} month`}
          aria-invalid={!!error}
          className={sel}
          value={month}
          onChange={(e) => change(year, e.target.value)}
        >
          <option value="">Month</option>
          {MONTH_NAMES.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, '0')}>
              {m}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} year`}
          aria-invalid={!!error}
          className={sel}
          value={year}
          onChange={(e) => change(e.target.value, month)}
        >
          <option value="">Year</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {p.kind === 'legacy' && (
        <p className="mt-1.5 text-xs text-soft">
          Saved as “{p.raw}”. Pick a month and year to replace it.
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
