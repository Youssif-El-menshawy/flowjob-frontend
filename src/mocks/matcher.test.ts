import { analyseMatch, extractSkills, guessJob, tailorSuggestions } from './matcher';
import { demoProfile, toContent } from './seed';

const JOB =
  'Junior Frontend Developer, Allegro\nReact, TypeScript, Git, unit testing with Jest, REST APIs, English B2+.';

describe('matcher', () => {
  it('extracts skills from a job post', () => {
    const names = extractSkills(JOB).map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(['React', 'TypeScript', 'Git', 'Unit testing', 'REST APIs', 'English']),
    );
  });

  it('reads the title and company from the first line', () => {
    expect(guessJob(JOB)).toEqual({ jobTitle: 'Junior Frontend Developer', company: 'Allegro' });
  });

  it('scores strengths and gaps without inventing skills', () => {
    const r = analyseMatch(toContent(demoProfile()), JOB);
    expect(r.strengths.map((s) => s.skill)).toContain('React');
    expect(r.gaps.map((g) => g.skill)).toContain('Unit testing');
    expect(r.score).toBeGreaterThan(40);
    expect(r.score).toBeLessThanOrEqual(96);
  });

  it('only rewords what is already in the CV', () => {
    const cv = toContent(demoProfile());
    const r = analyseMatch(cv, JOB);
    const s = tailorSuggestions(cv, r);
    const skills = s.find((x) => x.section === 'skills');
    if (skills) expect(skills.suggested.split(', ').sort()).toEqual([...cv.skills].sort());
  });
});
