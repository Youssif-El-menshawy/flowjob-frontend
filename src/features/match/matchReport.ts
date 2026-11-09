import type { MatchResult, RequirementImportance, RequirementMatch } from '@/shared/api/types';

/** Legacy/demo results carry no importance, so it is optional for display. */
export type Req = Omit<RequirementMatch, 'importance'> & { importance?: RequirementImportance };

export type TabKey = 'matched' | 'partial' | 'unverified';
export type Groups = Record<TabKey, Req[]>;

/**
 * Map the saved assessments onto the three visible tabs. Pure presentation: it only reads
 * the saved match and never changes classifications or values. Backend "not mentioned" and
 * "uncertain" items both arrive in `missing` and are shown together as Unverified.
 */
export function groupRequirements(m: MatchResult): Groups {
  return {
    matched: m.matched ?? (m.strengths ?? []).map((s) => ({ requirement: s.skill, evidence: s.evidence })),
    partial: m.partiallyMatched ?? [],
    unverified: m.missing ?? (m.gaps ?? []).map((g) => ({ requirement: g.skill, evidence: g.tip })),
  };
}

/** Unverified first (areas to review), then Partial, then Matched. */
export function defaultTab(g: Groups): TabKey {
  if (g.unverified.length) return 'unverified';
  if (g.partial.length) return 'partial';
  return 'matched';
}

const rank = (r: Req) => (r.importance === 'required' ? 0 : r.importance === 'preferred' ? 1 : 2);

/** Up to `n` items, required first; otherwise keeps the saved order (stable sort). */
export function pickTop(items: Req[], n = 3): Req[] {
  return items
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .slice(0, n)
    .map((x) => x.r);
}
