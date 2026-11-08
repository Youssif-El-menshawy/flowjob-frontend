// Month/year helpers for CV date fields.
//
// Stored format is unchanged: "Jul 2026" (or a bare "2023" year), and an empty end date
// means "Present". The backend Harvard renderer shows these strings verbatim (and an empty
// end as "Present"), so nothing about the PDF changes. Older CVs may hold other free text;
// it is parsed leniently on load and never rewritten unless the user edits that date.

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export type ParsedDate =
  | { kind: 'empty' }
  | { kind: 'present' }
  | { kind: 'date'; year: string; month: string } // month is '' (year only) or '01'..'12'
  | { kind: 'legacy'; raw: string }; // free text we cannot map to a month/year

const PRESENT = /^(present|current|currently|now|ongoing|to date)$/i;

const monthFromName = (s: string) => {
  const i = MONTH_NAMES.findIndex((m) => s.slice(0, 3).toLowerCase() === m.toLowerCase());
  return i >= 0 && s.length >= 3 ? String(i + 1).padStart(2, '0') : null;
};

export function parseDate(value?: string | null): ParsedDate {
  const t = (value ?? '').trim();
  if (!t) return { kind: 'empty' };
  if (PRESENT.test(t)) return { kind: 'present' };
  let m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(t); // backend-native "YYYY-MM"
  if (m) return { kind: 'date', year: m[1], month: m[2] };
  m = /^(\d{4})$/.exec(t);
  if (m) return { kind: 'date', year: m[1], month: '' };
  m = /^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(t); // "Jul 2026", "July 2026"
  if (m) {
    const mm = monthFromName(m[1]);
    if (mm) return { kind: 'date', year: m[2], month: mm };
  }
  m = /^(0?[1-9]|1[0-2])[/.-](\d{4})$/.exec(t); // "07/2026"
  if (m) return { kind: 'date', year: m[2], month: m[1].padStart(2, '0') };
  return { kind: 'legacy', raw: t };
}

/** "Jul 2026", or just "2023" when no month is chosen, or '' when there is no year. */
export function formatDate(year: string, month: string): string {
  if (!year) return '';
  return month ? `${MONTH_NAMES[Number(month) - 1]} ${year}` : year;
}

const key = (p: ParsedDate, edge: 'start' | 'end'): number | null =>
  p.kind === 'date' ? Number(p.year) * 12 + (p.month ? Number(p.month) : edge === 'start' ? 1 : 12) : null;

export interface RangeErrors {
  start?: string;
  end?: string;
}

/**
 * End must not be before start. Only comparable dates are compared (free-text legacy values are
 * left alone), and a missing month is treated leniently (start → Jan, end → Dec). When "Present"
 * is off the end date is required, because an empty end date means Present.
 */
export function validateRange(start: string, end: string, present: boolean): RangeErrors {
  const errors: RangeErrors = {};
  if (present) return errors;
  const e = parseDate(end);
  if (e.kind === 'empty' || e.kind === 'present') {
    errors.end = 'Choose an end date, or tick Present.';
    return errors;
  }
  const sk = key(parseDate(start), 'start');
  const ek = key(e, 'end');
  if (sk !== null && ek !== null && ek < sk) errors.end = 'End date can’t be before the start date.';
  return errors;
}
