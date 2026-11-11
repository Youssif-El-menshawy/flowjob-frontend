import { describe, expect, it } from 'vitest';
import type { CvContent, TailorSuggestion } from '@/shared/api/types';
import { applySuggestions, defaultText, reviewSuggestion, type Decision } from './tailorReview';

const source = {
  summary: 'Engineer who builds APIs.',
  experience: [{ id: 'e1', title: 'Dev', company: 'Acme', start: '', end: '', bullets: ['First', 'Second', 'Third'] }],
  projects: [{ id: 'p1', name: 'API', tech: 'FastAPI', description: 'A REST service' }],
  skills: ['Python', 'MongoDB', 'Excel'],
} as unknown as CvContent;

const reorderSkills: TailorSuggestion = {
  id: 's0', op: 'reorder', risk: 'auto', section: 'skills', original: 'Python, MongoDB, Excel', suggested: 'MongoDB, Python, Excel',
};
const reorderBullets: TailorSuggestion = {
  id: 's1', op: 'reorder', risk: 'auto', section: 'experience', experienceId: 'e1', order: [2, 0, 1],
  original: 'First\nSecond\nThird', suggested: 'Third\nFirst\nSecond',
};
const rewrite: TailorSuggestion = {
  id: 's2', op: 'rewrite', risk: 'review', section: 'summary', original: 'Engineer who builds APIs.',
  suggested: 'Backend engineer who builds REST APIs.', reviewRequired: true,
};
const del: TailorSuggestion = {
  id: 's3', op: 'delete', risk: 'review', section: 'experience', experienceId: 'e1', bulletIndex: 1, original: 'Second', suggested: '',
};
const addSkill: TailorSuggestion = {
  id: 's4', op: 'add_skill', risk: 'review', section: 'skills', skill: 'FastAPI', original: 'Python, MongoDB, Excel',
  suggested: 'Python, MongoDB, Excel, FastAPI', evidence: { path: 'projects.p1.tech', quote: 'FastAPI' },
};

const review = (list: TailorSuggestion[], decisions: Record<string, Decision> = {}, edits: Record<string, string> = {}, current = true) =>
  list.map((s) => reviewSuggestion(s, source, current, edits[s.id] ?? defaultText(s), decisions[s.id]));

describe('suggestion targets', () => {
  it('names the role and bullet, the project, or the skill, with a short excerpt of the original', () => {
    const bullet = reviewSuggestion(
      { id: 'b', op: 'rewrite', section: 'experience', experienceId: 'e1', bulletIndex: 1, original: 'Second', suggested: 'Second, clearer' },
      source, true, 'x',
    );
    expect(bullet.target).toEqual({ title: 'Dev, bullet 2', excerpt: 'Second' });
    const project = reviewSuggestion({ id: 'p', op: 'rewrite', section: 'project', projectId: 'p1', original: 'A REST service', suggested: 'A REST API service' }, source, true, 'x');
    expect(project.target).toEqual({ title: 'API, description', excerpt: 'A REST service' });
    expect(reviewSuggestion(rewrite, source, true, 'x').target).toEqual({ title: '', excerpt: 'Engineer who builds APIs.' });
    expect(reviewSuggestion(addSkill, source, true, 'FastAPI').target).toEqual({ title: 'FastAPI', excerpt: '' });
    expect(reviewSuggestion(reorderBullets, source, true, 'x').target).toEqual({ title: 'Dev', excerpt: '' });
    const long = reviewSuggestion({ ...rewrite, original: `${'word '.repeat(30)}end` }, source, true, 'x');
    expect(long.target.excerpt.length).toBeLessThanOrEqual(71);
    expect(long.target.excerpt.endsWith('…')).toBe(true);
  });
});

describe('typed tailoring review', () => {
  it('previews verified reorders automatically and Undo restores the original order', () => {
    const auto = review([reorderSkills, reorderBullets]);
    expect(auto.map((s) => [s.status, s.applied, s.auto])).toEqual([['Auto-applied', true, true], ['Auto-applied', true, true]]);
    const out = applySuggestions(source, auto);
    expect(out.skills).toEqual(['MongoDB', 'Python', 'Excel']);
    expect(out.experience[0].bullets).toEqual(['Third', 'First', 'Second']);

    const undone = review([reorderSkills, reorderBullets], { s0: 'original', s1: 'original' });
    expect(undone.map((s) => s.status)).toEqual(['Original kept', 'Original kept']);
    expect(applySuggestions(source, undone)).toEqual(source);
    // Redo
    const redone = review([reorderSkills], { s0: { acceptedText: 'MongoDB, Python, Excel' } });
    expect(applySuggestions(source, redone).skills).toEqual(['MongoDB', 'Python', 'Excel']);
  });

  it('never applies rewrites, deletions or new skills without an explicit Apply; pending keeps the original', () => {
    const pending = review([rewrite, del, addSkill]);
    expect(pending.every((s) => s.status === 'Needs review' && !s.applied && s.needsReview)).toBe(true);
    expect(applySuggestions(source, pending)).toEqual(source);
    // A draft that claims reviewRequired:false or risk:'auto' on a rewrite must not make it automatic.
    const lying = review([{ ...rewrite, risk: 'auto', reviewRequired: false }]);
    expect(lying[0].applied).toBe(false);
  });

  it('applies approved changes together, in source-index terms, and edited text wins', () => {
    const all = review(
      [reorderBullets, rewrite, del, addSkill, reorderSkills],
      { s2: { acceptedText: 'My own summary.' }, s3: { acceptedText: '' }, s4: { acceptedText: 'FastAPI 0.1' } },
      { s2: 'My own summary.', s4: 'FastAPI 0.1' },
    );
    const out = applySuggestions(source, all);
    expect(out.summary).toBe('My own summary.');
    expect(out.experience[0].bullets).toEqual(['Third', 'First']);          // reorder then removal of source index 1 ("Second")
    expect(out.skills).toEqual(['MongoDB', 'Python', 'Excel', 'FastAPI 0.1']);
    expect(source.experience[0].bullets).toEqual(['First', 'Second', 'Third']); // the original CV object is untouched
  });

  it('blocks suggestions that no longer match the verified source', () => {
    expect(review([rewrite], {}, {}, false)[0].blocked).toBe(true);
    const staleSkill = { ...reorderSkills, original: 'Python, MongoDB' };
    expect(review([staleSkill])[0]).toMatchObject({ blocked: true, applied: false, auto: false });
    expect(review([{ ...addSkill, skill: 'python' }])[0].blocked).toBe(true);                 // already listed
    expect(review([{ ...reorderBullets, order: [0, 0, 1] }])[0].blocked).toBe(true);          // not a permutation
    expect(review([{ ...rewrite, original: 'Something else' }])[0].blocked).toBe(true);
  });

  it('keeps legacy drafts (no op) working: nothing automatic, rewrite semantics unchanged', () => {
    const legacy: TailorSuggestion = { id: 'l1', section: 'summary', original: source.summary, suggested: 'Old style.', reviewRequired: true };
    const [item] = review([legacy]);
    expect(item.status).toBe('Needs review');
    const [accepted] = review([legacy], { l1: { acceptedText: 'Old style.' } });
    expect(applySuggestions(source, [accepted]).summary).toBe('Old style.');
  });
});
