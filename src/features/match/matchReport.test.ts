import { describe, expect, it } from 'vitest';
import type { MatchResult } from '@/shared/api/types';
import {
  attentionItems,
  defaultTab,
  groupRequirements,
  improvements,
  isGenericNotShown,
  overviewText,
  pickTop,
  readsAsThirdPerson,
  snippet,
} from './matchReport';

const req = (requirement: string, importance: 'required' | 'preferred', status: string, evidence = `Evidence for ${requirement}`) => ({
  requirement, importance, status, evidence,
});
const mk = (o: Partial<MatchResult> = {}): MatchResult =>
  ({
    id: 'm', cvId: 'c', cvName: 'CV', jobTitle: 'Dev', company: 'Acme', jobText: '', score: 70, verdict: 'Good fit',
    summary: '', strengths: [], gaps: [], createdAt: '2026-01-01', ...o,
  }) as MatchResult;

describe('grouping and selection', () => {
  it('groups saved assessments and defaults Not shown → Partial → Matched', () => {
    const m = mk({
      matched: [req('Py', 'required', 'clearly_demonstrated')],
      partiallyMatched: [req('CI', 'preferred', 'partially_demonstrated')],
      missing: [req('Docker', 'preferred', 'not_mentioned')],
    });
    const g = groupRequirements(m);
    expect(defaultTab(g)).toBe('unverified');
    expect(defaultTab({ ...g, unverified: [] })).toBe('partial');
    expect(defaultTab({ ...g, unverified: [], partial: [] })).toBe('matched');
  });

  it('falls back to legacy strengths/gaps and survives missing data', () => {
    const g = groupRequirements(mk({ strengths: [{ skill: 'Py', evidence: 'e' }], gaps: [{ skill: 'Go', tip: 't' }] }));
    expect([g.matched.length, g.unverified.length]).toEqual([1, 1]);
    expect(() => groupRequirements(mk({ strengths: undefined as never, gaps: undefined as never }))).not.toThrow();
  });

  it('pickTop: required first, saved order otherwise, max n, no mutation', () => {
    const input = [req('A', 'preferred', 'x'), req('B', 'required', 'x'), req('C', 'required', 'x'), req('D', 'preferred', 'x')];
    expect(pickTop(input).map((r) => r.requirement)).toEqual(['B', 'C', 'A']);
    expect(input[0].requirement).toBe('A');
  });

  it('attentionItems ranks required first across partial and not-shown', () => {
    const g = groupRequirements(
      mk({
        partiallyMatched: [req('CI', 'preferred', 'partially_demonstrated')],
        missing: [req('Docker', 'preferred', 'not_mentioned'), req('AWS', 'required', 'uncertain')],
      }),
    );
    expect(attentionItems(g).map((x) => `${x.r.requirement}:${x.kind}`)).toEqual(['AWS:unverified', 'CI:partial', 'Docker:unverified']);
    expect(attentionItems(g, 1)).toHaveLength(1);
  });
});

describe('personal voice', () => {
  it('detects third-person historical wording only', () => {
    expect(readsAsThirdPerson('The candidate has strong Python experience.')).toBe(true);
    expect(readsAsThirdPerson("The candidate's CV shows ...")).toBe(true);
    expect(readsAsThirdPerson('Applicants should add Docker.')).toBe(false); // plural is not about the CV owner
    expect(readsAsThirdPerson('Your CV shows strong Python experience.')).toBe(false);
    expect(readsAsThirdPerson('')).toBe(false);
    expect(readsAsThirdPerson(undefined)).toBe(false);
  });

  it('uses a saved personal explanation as is', () => {
    const m = mk({ overallAssessment: 'Your CV shows solid backend work.' });
    expect(overviewText(m, groupRequirements(m))).toEqual({ text: 'Your CV shows solid backend work.', fromSaved: true });
  });

  it('generates a short personal summary for historical third-person text, never rewriting it', () => {
    const m = mk({
      overallAssessment: 'The candidate has strong Python and REST experience but lacks Docker.',
      matched: [req('Docs', 'preferred', 'clearly_demonstrated'), req('Python', 'required', 'clearly_demonstrated'), req('REST', 'required', 'clearly_demonstrated')],
      missing: [req('Docker', 'preferred', 'not_mentioned')],
    });
    const o = overviewText(m, groupRequirements(m));
    expect(o.fromSaved).toBe(false);
    expect(o.text).toBe('Your CV clearly shows Python and REST. The biggest gap to address is Docker, which isn’t clear from your CV yet.');
    expect(o.text).not.toMatch(/candidate|lack|missing/i);
    expect(m.overallAssessment).toContain('lacks Docker'); // the saved record object is not modified
  });

  it('describes a partly shown gap and the no-strengths case without accusing', () => {
    const m = mk({ overallAssessment: 'The candidate ...', partiallyMatched: [req('CI/CD', 'required', 'partially_demonstrated')] });
    const o = overviewText(m, groupRequirements(m));
    expect(o.text).toBe('None of this post’s requirements are clearly shown in your CV yet. CI/CD is only partly shown, so it is the biggest gap to close.');
  });

  it('falls back to the saved text when there is no requirement data to summarise', () => {
    const m = mk({ overallAssessment: 'The candidate is a fit.' });
    expect(overviewText(m, groupRequirements(m))).toEqual({ text: 'The candidate is a fit.', fromSaved: true });
    expect(overviewText(mk(), groupRequirements(mk()))).toEqual({ text: '', fromSaved: false });
  });
});

describe('evidence helpers', () => {
  it('snippet normalises whitespace and cuts at a word boundary', () => {
    expect(snippet('  a   b\nc ')).toBe('a b c');
    const long = 'word '.repeat(60);
    const s = snippet(long, 50);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length).toBeLessThanOrEqual(51);
    expect(s).not.toMatch(/wor…$/);
    expect(snippet(undefined)).toBe('');
  });

  it('recognises the generic "not shown" sentinel', () => {
    expect(isGenericNotShown('Not mentioned in the CV.')).toBe(true);
    expect(isGenericNotShown('Not shown in your CV.')).toBe(true);
    expect(isGenericNotShown('Tests are mentioned, but not CI/CD.')).toBe(false);
  });
});

describe('improvements (only what the analysis supports)', () => {
  it('uses saved recommendations: trimmed, de-duplicated, at most three', () => {
    const m = mk({ recommendations: [' One ', 'Two', 'Two', '', 'Three', 'Four'] });
    expect(improvements(m, groupRequirements(m)).map((i) => i.text)).toEqual(['One', 'Two', 'Three']);
  });

  it('derives from partly shown requirements (with their evidence) when there are no recommendations', () => {
    const m = mk({ partiallyMatched: [req('CI/CD', 'preferred', 'partially_demonstrated', 'Some pipelines.'), req('AWS', 'required', 'partially_demonstrated', '')] });
    const out = improvements(m, groupRequirements(m));
    expect(out).toEqual([{ text: 'Make CI/CD clearer in your CV.', basis: 'Some pipelines.' }]); // no evidence → no suggestion
  });

  it('returns nothing rather than inventing improvements', () => {
    const m = mk({ matched: [req('Py', 'required', 'clearly_demonstrated')], missing: [req('Docker', 'preferred', 'not_mentioned')] });
    expect(improvements(m, groupRequirements(m))).toEqual([]);
  });
});
