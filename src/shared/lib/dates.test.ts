import { describe, expect, it } from 'vitest';
import { formatDate, parseDate, validateRange } from './dates';

describe('parseDate (loads every stored format)', () => {
  it.each([
    ['Jul 2026', { kind: 'date', year: '2026', month: '07' }],
    ['July 2026', { kind: 'date', year: '2026', month: '07' }],
    ['sep. 2019', { kind: 'date', year: '2019', month: '09' }],
    ['2026-07', { kind: 'date', year: '2026', month: '07' }],
    ['07/2026', { kind: 'date', year: '2026', month: '07' }],
    ['2023', { kind: 'date', year: '2023', month: '' }],
    ['', { kind: 'empty' }],
    ['  ', { kind: 'empty' }],
    ['Present', { kind: 'present' }],
    ['current', { kind: 'present' }],
    ['Summer 2019', { kind: 'legacy', raw: 'Summer 2019' }],
    ['Foo 2020', { kind: 'legacy', raw: 'Foo 2020' }],
  ])('%s', (input, expected) => expect(parseDate(input)).toEqual(expected));

  it('treats null/undefined as empty', () => {
    expect(parseDate(undefined)).toEqual({ kind: 'empty' });
    expect(parseDate(null)).toEqual({ kind: 'empty' });
  });
});

describe('formatDate (keeps the stored format)', () => {
  it('writes "Mon YYYY", a bare year, or nothing', () => {
    expect(formatDate('2026', '07')).toBe('Jul 2026');
    expect(formatDate('2023', '')).toBe('2023');
    expect(formatDate('', '07')).toBe('');
  });
  it('round-trips with parseDate', () => {
    const p = parseDate('Mar 2021');
    expect(p.kind === 'date' && formatDate(p.year, p.month)).toBe('Mar 2021');
  });
});

describe('validateRange', () => {
  it('accepts end after or equal to start', () => {
    expect(validateRange('Jan 2020', 'Mar 2021', false)).toEqual({});
    expect(validateRange('Jan 2020', 'Jan 2020', false)).toEqual({});
    expect(validateRange('2019', '2023', false)).toEqual({});
  });
  it('rejects end before start', () => {
    expect(validateRange('Mar 2021', 'Jan 2021', false).end).toMatch(/before the start/);
    expect(validateRange('2022', 'Dec 2021', false).end).toMatch(/before the start/);
  });
  it('is lenient with missing months (same year is fine)', () => {
    expect(validateRange('2021', 'Mar 2021', false)).toEqual({});
    expect(validateRange('Dec 2021', '2021', false)).toEqual({});
  });
  it('Present skips the end check; an empty end without Present is an error', () => {
    expect(validateRange('Jan 2030', '', true)).toEqual({});
    expect(validateRange('Jan 2020', '', false).end).toMatch(/Present/);
  });
  it('never blocks on free-text legacy values it cannot compare', () => {
    expect(validateRange('Summer 2019', 'Jan 2018', false)).toEqual({});
    expect(validateRange('Jan 2020', 'Autumn 2021', false)).toEqual({});
  });
});
