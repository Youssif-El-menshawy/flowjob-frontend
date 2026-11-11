import type { CvContent, TailorSuggestion } from '@/shared/api/types';

const splitSkills = (text: string) => text.split(',').map((skill) => skill.trim()).filter(Boolean);
const skillKey = (skill: string) => skill.trim().toLowerCase();
const opOf = (s: TailorSuggestion) => s.op ?? 'rewrite';

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

/** The text a suggestion starts with in its editor: the new wording, or just the skill for add-skill. */
export const defaultText = (s: TailorSuggestion) => (opOf(s) === 'add_skill' && s.skill ? s.skill : s.suggested);

/** Only wording (rewrite) and the added skill's name can be edited. */
export const isEditable = (s: TailorSuggestion) => opOf(s) === 'rewrite' || opOf(s) === 'add_skill';

const excerpt = (text: string, max = 70) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max).replace(/\s+\S*$/, '')}…`;
};

/** Which part of the CV a suggestion is about: the role and bullet, the project, or the skill, plus a short original excerpt. */
function describeTarget(source: CvContent, s: TailorSuggestion): { title: string; excerpt: string } {
  const op = opOf(s);
  let title = '';
  if (s.section === 'experience') {
    const role = uniqueItem(source.experience ?? [], s.experienceId ?? '');
    title = `${role?.title || role?.company || 'Role'}${typeof s.bulletIndex === 'number' ? `, bullet ${s.bulletIndex + 1}` : ''}`;
  } else if (s.section === 'project') {
    title = `${uniqueItem(source.projects ?? [], s.projectId ?? '')?.name || 'Project'}, description`;
  } else if (s.section === 'skills' && (op === 'add_skill' || op === 'delete')) {
    title = s.skill ?? '';
  }
  const showOriginal = (op === 'rewrite' || (op === 'delete' && s.section !== 'skills')) && !!s.original;
  return { title, excerpt: showOriginal ? excerpt(s.original) : '' };
}

export type Decision = 'original' | { acceptedText: string };

/** Is the suggestion still valid against the verified source revision? Never trusts the draft's own claims. */
function isBlocked(source: CvContent, s: TailorSuggestion, sourceIsCurrent: boolean): boolean {
  if (!sourceIsCurrent) return true;
  const skills = Array.isArray(source.skills) ? source.skills : [];
  switch (opOf(s)) {
    case 'rewrite': {
      const target = findTarget(source, s);
      return !target?.text.trim() || target.text !== s.original;
    }
    case 'delete': {
      if (s.section === 'skills') return !skills.some((k) => skillKey(k) === skillKey(s.skill ?? ''));
      const target = findTarget(source, s);
      return !target?.text.trim() || target.text !== s.original;
    }
    case 'add_skill':
      return !s.skill?.trim() || !Array.isArray(source.skills) || skills.some((k) => skillKey(k) === skillKey(s.skill ?? ''));
    case 'reorder': {
      if (s.section === 'skills') {
        const next = splitSkills(s.suggested);
        return skills.join(', ') !== s.original
          || next.length !== skills.length || [...next.map(skillKey)].sort().join('|') !== [...skills.map(skillKey)].sort().join('|');
      }
      const role = uniqueItem(source.experience ?? [], s.experienceId ?? '');
      const order = s.order ?? [];
      return !role || !Array.isArray(role.bullets) || role.bullets.join('\n') !== s.original
        || order.length !== role.bullets.length || [...order].sort((a, b) => a - b).some((v, i) => v !== i);
    }
    default:
      return true;
  }
}

export function reviewSuggestion(
  suggestion: TailorSuggestion, source: CvContent, sourceIsCurrent: boolean, text: string, decision?: Decision,
) {
  const legacy = suggestion.op === undefined; // drafts created before typed changes
  const blocked = isBlocked(source, suggestion, sourceIsCurrent);
  const skillChanges = legacy && suggestion.section === 'skills' ? compareSkills(source.skills ?? [], text) : null;
  // Only a verified REORDER (risk "auto") is previewed without approval. Everything else, including legacy
  // drafts, waits for an explicit Apply. The draft's own flags never make a rewrite automatic.
  const auto = !legacy && suggestion.op === 'reorder' && suggestion.risk === 'auto' && !blocked;
  const needsReview = legacy
    ? blocked || suggestion.reviewRequired !== false || text !== suggestion.suggested
      || !!(skillChanges && (skillChanges.added.length || skillChanges.removed.length))
    : blocked || !auto;
  const hasText = !isEditable(suggestion) || !!text.trim();
  const applied = !blocked && hasText && decision !== 'original' && (!needsReview || (typeof decision === 'object' && decision.acceptedText === text));
  const status = applied
    ? (auto ? 'Auto-applied' : 'Applied')
    : blocked || (needsReview && decision !== 'original') ? 'Needs review' : 'Original kept';
  return { ...suggestion, text, skillChanges, blocked, needsReview, applied, auto, status, target: describeTarget(source, suggestion) };
}

export type ReviewedSuggestion = ReturnType<typeof reviewSuggestion>;

/**
 * Preview, download and save use the same reviewed clone. Every target index refers to the verified source
 * revision, so rewrites, deletions and reorders of the same role compose. Pending suggestions change nothing.
 */
export function applySuggestions(content: CvContent, suggestions: ReviewedSuggestion[]): CvContent {
  const copy = structuredClone(content);
  const applied = suggestions.filter((s) => s.applied);

  // 1. Wording (and the whole-string skills rewrite of legacy drafts).
  for (const s of applied.filter((x) => opOf(x) === 'rewrite')) {
    const target = findTarget(copy, s);
    if (target && target.text === s.original) target.replace(s.text);
  }

  // 2. Bullets per role: remove, then reorder by SOURCE index.
  const roles = new Map<string, { remove: Set<number>; order?: number[] }>();
  const role = (id: string) => roles.get(id) ?? roles.set(id, { remove: new Set() }).get(id)!;
  for (const s of applied) {
    if (opOf(s) === 'delete' && s.section === 'experience' && s.experienceId != null && typeof s.bulletIndex === 'number') {
      role(s.experienceId).remove.add(s.bulletIndex);
    } else if (opOf(s) === 'reorder' && s.section === 'experience' && s.experienceId != null && s.order) {
      role(s.experienceId).order = s.order;
    }
  }
  for (const [id, { remove, order }] of roles) {
    const item = uniqueItem(copy.experience ?? [], id);
    if (!item || !Array.isArray(item.bullets)) continue;
    const indices = order && order.length === item.bullets.length ? order : item.bullets.map((_, i) => i);
    item.bullets = indices.filter((i) => !remove.has(i)).map((i) => item.bullets[i]);
  }

  // 3. Skills: reorder, remove, then add. The database format (a string list) is unchanged.
  if (Array.isArray(copy.skills)) {
    let skills = [...copy.skills];
    for (const s of applied.filter((x) => opOf(x) === 'reorder' && x.section === 'skills')) {
      const byKey = new Map(skills.map((k) => [skillKey(k), k]));
      const next = splitSkills(s.suggested).map((k) => byKey.get(skillKey(k)));
      if (next.length === skills.length && next.every((k): k is string => !!k)) skills = next;
    }
    for (const s of applied.filter((x) => opOf(x) === 'delete' && x.section === 'skills')) {
      skills = skills.filter((k) => skillKey(k) !== skillKey(s.skill ?? ''));
    }
    for (const s of applied.filter((x) => opOf(x) === 'add_skill')) {
      const name = s.text.trim();
      if (name && !skills.some((k) => skillKey(k) === skillKey(name))) skills.push(name);
    }
    copy.skills = skills;
  }
  return copy;
}
