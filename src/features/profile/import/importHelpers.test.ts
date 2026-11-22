import { describe, expect, it } from 'vitest';
import type { CvContent, Profile } from '@/shared/api/types';
import { combine, conflicts, describeValue, pick } from './importHelpers';

const EMPTY: Profile = {
  fullName: 'Ana Nowak', email: 'ana@example.com', phone: '', location: '', links: [], summary: '',
  experience: [], education: [], projects: [], skills: [], languages: '',
};
const job = (id: string, title: string) => ({ id, title, company: 'Acme', location: '', start: '2021-01', end: '', bullets: [] });
const CV: CvContent = {
  ...EMPTY, fullName: 'Ada Example', email: 'ada@example.com', phone: '+48 600 123 456', location: 'Wrocław',
  summary: 'From the CV.', experience: [job('import-experience-1', 'Engineer')], skills: ['Python'],
  languages: 'English (C1)',
};

describe('combining an import with the Profile', () => {
  it('fills an empty Profile from the CV but keeps the account name and email', () => {
    const out = combine(EMPTY, CV);
    expect(out).toEqual({ ...CV, fullName: 'Ana Nowak', email: 'ana@example.com' });
    expect(conflicts(EMPTY, CV)).toEqual([]);
  });

  it('keeps existing Profile values by default and never empties them', () => {
    const mine: Profile = { ...EMPTY, summary: 'Mine.', skills: ['Go'], education: [{ id: 'e', school: 'S', degree: 'D', start: '', end: '', note: '' }] };
    const out = combine(mine, CV);
    expect(out.summary).toBe('Mine.');
    expect(out.skills).toEqual(['Go']);
    expect(out.education).toEqual(mine.education); // the CV has none
    expect(out.experience).toEqual(CV.experience); // the Profile has none
    expect(conflicts(mine, CV)).toEqual(['summary', 'skills']);
  });

  it('uses the CV’s value only where it is chosen', () => {
    const mine: Profile = { ...EMPTY, summary: 'Mine.', skills: ['Go'] };
    const out = combine(mine, CV, { skills: 'cv' });
    expect(out.skills).toEqual(['Python']);
    expect(out.summary).toBe('Mine.');
    expect(pick('summary', mine, CV, 'cv')).toBe('From the CV.');
  });

  it('does not report a conflict for the same entries with different ids or spacing', () => {
    const mine: Profile = { ...EMPTY, experience: [job('mine-1', 'Engineer')], summary: ' From the CV. ' };
    expect(conflicts(mine, CV)).toEqual([]);
  });

  it('returns copies, so editing the review never changes the inputs', () => {
    const out = combine(EMPTY, CV);
    out.experience[0].title = 'Changed';
    expect(CV.experience[0].title).toBe('Engineer');
  });

  it('describes values for the choice', () => {
    expect(describeValue('experience', [job('1', 'Engineer'), job('2', 'Lead')])).toBe('2 jobs: Engineer, Lead');
    expect(describeValue('skills', ['a', 'b', 'c', 'd'])).toBe('4 skills: a, b, c, …');
    expect(describeValue('phone', '+48 600')).toBe('“+48 600”');
  });
});
