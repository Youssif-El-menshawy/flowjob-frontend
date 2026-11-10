import type { CvContent, TailorSuggestion } from '@/shared/api/types';

const splitSkills = (text: string) => text.split(',').map((skill) => skill.trim()).filter(Boolean);
const skillKey = (skill: string) => skill.trim().toLowerCase();

function compareSkills(original: string[], proposed: string) {
  const next = splitSkills(proposed);
  const before = new Set(original.map(skillKey));
  const after = new Set(next.map(skillKey));
  return {
    retained: original.filter((skill) => after.has(skillKey(skill))),
    added: next.filter((skill) => !before.has(skillKey(skill))),
    removed: original.filter((skill) => !after.has(skillKey(skill))),
  };
}

function uniqueItem<T extends { id: string }>(items: T[], id: string) {
  const matches = items.filter((item) => item?.id != null && String(item.id) === id);
  return matches.length === 1 ? matches[0] : undefined;
}

function findTarget(content: CvContent, suggestion: TailorSuggestion): { text: string; replace: (text: string) => void } | null {
  const { section, experienceId, bulletIndex, projectId } = suggestion;
  if (section === 'experience') {
    if (!experienceId || typeof bulletIndex !== 'number' || !Number.isInteger(bulletIndex) || projectId != null) return null;
    const item = uniqueItem(content.experience ?? [], experienceId);
    const text = item?.bullets?.[bulletIndex];
    return item && typeof text === 'string' ? { text, replace: (value) => { item.bullets[bulletIndex] = value; } } : null;
  }
  if (experienceId != null || bulletIndex != null) return null;
  if (section === 'project') {
    if (!projectId) return null;
    const item = uniqueItem(content.projects ?? [], projectId);
    return item && typeof item.description === 'string'
      ? { text: item.description, replace: (value) => { item.description = value; } }
      : null;
  }
  if (projectId != null) return null;
  if (section === 'summary' && typeof content.summary === 'string') {
    return { text: content.summary, replace: (value) => { content.summary = value; } };
  }
  if (section === 'skills' && Array.isArray(content.skills)) {
    return { text: content.skills.join(', '), replace: (value) => { content.skills = splitSkills(value); } };
  }
  return null;
}

export type Decision = 'original' | { acceptedText: string };

export function reviewSuggestion(
  suggestion: TailorSuggestion, source: CvContent, sourceIsCurrent: boolean, text: string, decision?: Decision,
) {
  const target = sourceIsCurrent ? findTarget(source, suggestion) : null;
  const blocked = !target?.text.trim() || target.text !== suggestion.original;
  const skillChanges = suggestion.section === 'skills' ? compareSkills(source.skills ?? [], text) : null;
  const needsReview = blocked || suggestion.reviewRequired !== false || text !== suggestion.suggested
    || !!(skillChanges && (skillChanges.added.length || skillChanges.removed.length));
  const applied = !blocked && !!text.trim() && decision !== 'original' && (!needsReview || decision?.acceptedText === text);
  const status = applied ? 'Applied' : blocked || (needsReview && decision !== 'original') ? 'Needs review' : 'Original kept';
  return { ...suggestion, text, skillChanges, blocked, needsReview, applied, status };
}

export type ReviewedSuggestion = ReturnType<typeof reviewSuggestion>;

/** Preview, download and save use the same reviewed clone. */
export function applySuggestions(content: CvContent, suggestions: ReviewedSuggestion[]): CvContent {
  const copy = structuredClone(content);
  for (const suggestion of suggestions) {
    if (!suggestion.applied) continue;
    const target = findTarget(copy, suggestion);
    if (target && target.text === suggestion.original) target.replace(suggestion.text);
  }
  return copy;
}
