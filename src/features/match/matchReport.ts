import type { MatchResult, RequirementCategory, RequirementImportance, RequirementMatch } from '@/shared/api/types';

/** Older stored results carry no importance, so it is optional for display. */
export type Req = Omit<RequirementMatch, 'importance'> & { importance?: RequirementImportance };

/** Required > Standard > Preferred; untagged legacy items last. */
export const categoryOf = (r: Req): RequirementCategory | undefined => r.category ?? r.importance;

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

const RANK: Record<RequirementCategory, number> = { required: 0, standard: 1, preferred: 2 };
const rank = (r: Req) => RANK[categoryOf(r)!] ?? 3;

/** Up to `n` items, required first; otherwise keeps the saved order (stable sort). */
export function pickTop(items: Req[], n = 3): Req[] {
  return items
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .slice(0, n)
    .map((x) => x.r);
}

// --- Concise, personal overview -------------------------------------------------------------

/** Older reports were written about "the candidate"; new ones speak to the user ("Your CV shows ..."). */
const THIRD_PERSON = /\b(?:the\s+)?(?:candidate|applicant)(?:['’]s)?\b/i;
export const readsAsThirdPerson = (text?: string | null) => !!text && THIRD_PERSON.test(text);

const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Required first across partial + not-shown, so the "biggest gap" is the most important one. */
export function attentionItems(g: Groups, n = 3): { r: Req; kind: 'partial' | 'unverified' }[] {
  const tagged = [
    ...g.partial.map((r) => ({ r, kind: 'partial' as const })),
    ...g.unverified.map((r) => ({ r, kind: 'unverified' as const })),
  ];
  return tagged
    .map((x, i) => ({ x, i }))
    .sort((a, b) => rank(a.x.r) - rank(b.x.r) || a.i - b.i)
    .slice(0, n)
    .map(({ x }) => x);
}

/**
 * The short explanation shown under the score. A saved explanation that already speaks to the user is
 * used as is. Historical third-person text is never rewritten; instead a short personal summary is
 * generated from the saved requirement data (strongest matches + biggest gap), and the original text
 * stays available under "About this score".
 */
export function overviewText(m: MatchResult, g: Groups): { text: string; fromSaved: boolean } {
  const saved = (m.overallAssessment ?? m.summary ?? '').trim();
  if (saved && !readsAsThirdPerson(saved)) return { text: saved, fromSaved: true };

  const strongest = pickTop(g.matched, 2).map((r) => r.requirement);
  const gap = attentionItems(g, 1)[0];
  const parts: string[] = [];
  if (strongest.length) parts.push(`Your CV clearly shows ${joinNames(strongest)}.`);
  else if (g.partial.length || g.unverified.length)
    parts.push('None of this post’s requirements are clearly shown in your CV yet.');
  if (gap)
    parts.push(
      gap.kind === 'partial'
        ? `${gap.r.requirement} is only partly shown, so it is the biggest gap to close.`
        : `The biggest gap to address is ${gap.r.requirement}, which isn’t clear from your CV yet.`,
    );
  return parts.length ? { text: parts.join(' '), fromSaved: false } : { text: saved, fromSaved: !!saved };
}

/** One-line evidence for a compact card: whitespace-normalised, cut at a word boundary. */
export function snippet(text: string | undefined, max = 140): string {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** The generic "no evidence" sentinel carries no information beyond the "Not shown" label. */
export const isGenericNotShown = (text?: string) => /^not (?:mentioned|shown)\b/i.test((text ?? '').trim());

export interface Improvement {
  text: string;
  /** What in the CV this is based on (only when derived from a partial match). */
  basis?: string;
}

/**
 * Up to three concrete improvements, only from analysis that exists: the saved recommendations first;
 * if there are none, partly-shown requirements (their evidence is the basis). Nothing is invented — an
 * empty list means the saved analysis cannot support a specific change.
 */
export function improvements(m: MatchResult, g: Groups, max = 3): Improvement[] {
  const recs = [...new Set((m.recommendations ?? []).map((r) => r?.trim()).filter(Boolean))].slice(0, max);
  if (recs.length) return recs.map((text) => ({ text }));
  return pickTop(g.partial, max)
    .filter((r) => !!r.evidence?.trim())
    .map((r) => ({ text: `Make ${r.requirement} clearer in your CV.`, basis: snippet(r.evidence, 160) }));
}


/**
 * The Required/Standard/Preferred summary of an AI-first report: the saved counts when present,
 * otherwise derived from per-requirement categories. Legacy reports (no categories) return null,
 * so the row is simply omitted for them.
 */
export function categorySummary(m: MatchResult, g: Groups): { label: string; count: number }[] | null {
  const all = [...g.matched, ...g.partial, ...g.unverified];
  const counts = m.qualificationCounts;
  const of = (c: RequirementCategory) => counts?.[c]?.count ?? all.filter((r) => r.category === c).length;
  if (!counts && !all.some((r) => r.category)) return null;
  return [
    { label: 'required', count: of('required') },
    { label: 'standard', count: of('standard') },
    { label: 'preferred', count: of('preferred') },
  ].filter((x) => x.count > 0);
}
