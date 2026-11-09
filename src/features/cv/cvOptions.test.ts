import { describe, expect, it } from 'vitest';
import type { Cv } from '@/shared/api/types';
import { cvOptionLabel, sortCvs } from './cvOptions';

const cv = (o: Partial<Cv>): Cv =>
  ({ id: 'x', name: 'N', kind: 'tailored', createdAt: '2026-01-01', updatedAt: '2026-01-01', content: {}, ...o }) as Cv;

describe('cvOptionLabel', () => {
  it('labels originals and tailored versions from real metadata only', () => {
    expect(cvOptionLabel(cv({ kind: 'original', name: 'Original CV' }))).toBe('Original CV');
    expect(cvOptionLabel(cv({ kind: 'original', name: 'Main' }))).toBe('Main — Original');
    expect(cvOptionLabel(cv({ name: 'Hays v1', company: 'Hays' }))).toBe('Hays v1 — Tailored');
    expect(cvOptionLabel(cv({ name: 'Backend v2', company: 'Snowflake', jobTitle: 'Engineer' }))).toBe(
      'Backend v2 — Tailored · Snowflake',
    );
    expect(cvOptionLabel(cv({ name: 'Draft', jobTitle: 'Engineer' }))).toBe('Draft — Tailored · Engineer');
    expect(cvOptionLabel(cv({ name: 'Draft' }))).toBe('Draft — Tailored'); // nothing is invented
  });
});

describe('sortCvs', () => {
  it('puts the original first, then others by most recently updated, without mutating the input', () => {
    const list = [
      cv({ id: 'a', updatedAt: '2026-02-01' }),
      cv({ id: 'o', kind: 'original', updatedAt: '2025-01-01' }),
      cv({ id: 'b', updatedAt: '2026-03-01' }),
    ];
    expect(sortCvs(list).map((c) => c.id)).toEqual(['o', 'b', 'a']);
    expect(list.map((c) => c.id)).toEqual(['a', 'o', 'b']);
  });
});
