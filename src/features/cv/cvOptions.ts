import type { Cv } from '@/shared/api/types';

/** Human label for a saved CV, from real metadata only (never inferred). */
export function cvOptionLabel(cv: Cv): string {
  const name = cv.name?.trim() || (cv.kind === 'original' ? 'Original CV' : 'Tailored CV');
  if (cv.kind === 'original') return /original/i.test(name) ? name : `${name} — Original`;
  // Tailored: prefer the company, else the job title — only when the name doesn't already carry it.
  const target = cv.company?.trim() || cv.jobTitle?.trim();
  const hint = target && !name.toLowerCase().includes(target.toLowerCase()) ? target : undefined;
  return `${name} — Tailored${hint ? ` · ${hint}` : ''}`;
}

export type CvSort = 'updated' | 'created' | 'name';

/** Pin originals, then sort each group without mutating the cached list. */
export function sortCvs(cvs: readonly Cv[], sort: CvSort = 'updated'): Cv[] {
  const time = (value: string) => Date.parse(value) || 0;
  const name = (a: Cv, b: Cv) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  return [...cvs].sort((a, b) => {
    const pinned = Number(b.kind === 'original') - Number(a.kind === 'original');
    if (pinned) return pinned;
    if (sort === 'name') return name(a, b);
    if (sort === 'created') return time(b.createdAt) - time(a.createdAt);
    return time(b.updatedAt || b.createdAt) - time(a.updatedAt || a.createdAt);
  });
}
