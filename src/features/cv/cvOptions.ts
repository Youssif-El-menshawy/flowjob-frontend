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

/** Original CV(s) first, then everything else by most recently updated. Does not mutate the input. */
export function sortCvs(cvs: readonly Cv[]): Cv[] {
  const time = (c: Cv) => new Date(c.updatedAt || c.createdAt || 0).getTime() || 0;
  return [...cvs].sort(
    (a, b) => Number(b.kind === 'original') - Number(a.kind === 'original') || time(b) - time(a),
  );
}
