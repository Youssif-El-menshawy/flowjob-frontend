// Mock "AI" used by the mock API. A simple, explainable keyword matcher that stands in for the LLM.
// Rule from the SRS: never invent skills or experience the user does not have.
import type { CvContent, MatchGap, MatchResult, MatchStrength, TailorSuggestion } from '@/shared/api/types';

interface SkillDef {
  name: string;
  aliases: string[];
  tip: string;
}

export const SKILLS: SkillDef[] = [
  {
    name: 'React',
    aliases: ['react', 'react.js', 'reactjs'],
    tip: 'Add a React project or feature you built.',
  },
  {
    name: 'TypeScript',
    aliases: ['typescript', 'ts'],
    tip: 'Mention where you used TypeScript, even in a course project.',
  },
  {
    name: 'JavaScript',
    aliases: ['javascript', 'js', 'es6'],
    tip: 'List JavaScript explicitly in your skills.',
  },
  {
    name: 'HTML/CSS',
    aliases: ['html', 'css', 'html/css', 'sass', 'tailwind'],
    tip: 'Show a page or layout you built.',
  },
  {
    name: 'Git',
    aliases: ['git', 'github', 'gitlab', 'version control'],
    tip: 'Mention working with Git and pull requests.',
  },
  {
    name: 'Unit testing',
    aliases: ['unit test', 'unit testing', 'jest', 'vitest', 'testing library', 'pytest', 'tests'],
    tip: 'Mention tests you wrote, or try a short testing course.',
  },
  {
    name: 'REST APIs',
    aliases: ['rest', 'rest api', 'rest apis', 'api', 'apis'],
    tip: 'Add a project where you called or built an API.',
  },
  { name: 'Python', aliases: ['python'], tip: 'Add a Python script or project you wrote.' },
  {
    name: 'SQL',
    aliases: ['sql', 'postgresql', 'postgres', 'mysql'],
    tip: 'Mention a database you designed or queried.',
  },
  { name: 'Java', aliases: ['java', 'spring'], tip: 'Add a Java course project or assignment.' },
  { name: 'C#', aliases: ['c#', '.net', 'dotnet'], tip: 'Add a C# or .NET project.' },
  {
    name: 'Node.js',
    aliases: ['node', 'node.js', 'express'],
    tip: 'Show a small Node.js service you built.',
  },
  { name: 'Docker', aliases: ['docker', 'containers'], tip: 'Try containerising one of your projects.' },
  {
    name: 'Cloud',
    aliases: ['aws', 'azure', 'gcp', 'cloud'],
    tip: 'A free-tier cloud deployment is a quick win.',
  },
  {
    name: 'CI/CD',
    aliases: ['ci/cd', 'ci', 'github actions', 'pipelines'],
    tip: 'Add a CI pipeline to one of your repos.',
  },
  {
    name: 'Agile',
    aliases: ['agile', 'scrum', 'kanban', 'sprint'],
    tip: 'Mention working in sprints or with a task board.',
  },
  {
    name: 'Communication',
    aliases: ['communication', 'teamwork', 'collaborat', 'team player'],
    tip: 'Give an example of working with a team.',
  },
  { name: 'English', aliases: ['english'], tip: 'Add your English level to your profile.' },
  { name: 'Figma', aliases: ['figma', 'ui design', 'ux'], tip: 'Link a design you made in Figma.' },
  {
    name: 'Machine learning',
    aliases: ['machine learning', 'ml', 'pytorch', 'tensorflow', 'scikit'],
    tip: 'Add an ML course project with results.',
  },
];

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[^a-z0-9#+./ ]/g, ' ')
    .replace(/\s+/g, ' ')} `;
const has = (text: string, alias: string) => {
  if (alias.length <= 3) return text.includes(` ${alias} `);
  return text.includes(alias);
};

export function extractSkills(text: string): SkillDef[] {
  const t = norm(text);
  return SKILLS.filter((s) => s.aliases.some((a) => has(t, a)));
}

export function guessJob(text: string): { jobTitle: string; company: string } {
  const first =
    text
      .trim()
      .split('\n')
      .find((l) => l.trim().length > 0) ?? '';
  const parts = first
    .split(/,| at | - | – | \| /i)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    jobTitle: (parts[0] || 'This role').slice(0, 80),
    company: (parts[1] || 'the company').slice(0, 60),
  };
}

function cvText(cv: CvContent) {
  return [
    cv.summary,
    cv.skills.join(', '),
    cv.languages,
    ...cv.experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
    ...cv.projects.flatMap((p) => [p.name, p.tech, p.description]),
    ...cv.education.flatMap((e) => [e.degree, e.note ?? '']),
  ].join('\n');
}

function evidenceFor(skill: SkillDef, cv: CvContent): string {
  for (const e of cv.experience) {
    for (const b of [e.title, ...e.bullets]) {
      if (skill.aliases.some((a) => has(norm(b), a))) return `${e.title} at ${e.company}`;
    }
  }
  for (const p of cv.projects) {
    if (skill.aliases.some((a) => has(norm(`${p.name} ${p.tech} ${p.description}`), a)))
      return `Project: ${p.name}`;
  }
  if (skill.name === 'English' && cv.languages) return cv.languages;
  return 'Listed in your skills';
}

export function analyseMatch(
  cv: CvContent,
  jobText: string,
): Omit<MatchResult, 'id' | 'cvId' | 'cvName' | 'createdAt'> {
  const { jobTitle, company } = guessJob(jobText);
  const required = extractSkills(jobText);
  const mine = new Set(extractSkills(cvText(cv)).map((s) => s.name));
  const strengths: MatchStrength[] = [];
  const gaps: MatchGap[] = [];
  for (const s of required) {
    if (mine.has(s.name)) strengths.push({ skill: s.name, evidence: evidenceFor(s, cv) });
    else gaps.push({ skill: s.name, tip: s.tip });
  }
  const base = required.length ? strengths.length / required.length : 0.5;
  const score = Math.max(
    12,
    Math.min(96, Math.round(base * 88 + (cv.experience.length ? 6 : 0) + (cv.projects.length ? 3 : 0))),
  );
  const verdict: MatchResult['verdict'] =
    score >= 85 ? 'Strong fit' : score >= 65 ? 'Good fit' : score >= 45 ? 'Partial fit' : 'Low fit';
  const top = strengths.slice(0, 2).map((s) => s.skill);
  const miss = gaps.slice(0, 2).map((g) => g.skill);
  let summary: string;
  if (!required.length)
    summary = 'We could not find clear skill requirements in this post. Try pasting the full description.';
  else if (!gaps.length)
    summary = `Your CV covers every skill this post asks for${top.length ? `, especially ${top.join(' and ')}` : ''}.`;
  else if (!strengths.length)
    summary = `This post asks for ${miss.join(' and ')}, which your CV does not show yet.`;
  else
    summary = `Your ${top.join(' and ')} experience matches the core of this role. ${miss.join(' and ')} ${miss.length > 1 ? 'are' : 'is'} asked for but not shown in your CV yet.`;
  return { jobTitle, company, jobText, score, verdict, summary, strengths, gaps };
}

const STRONGER: Record<string, string> = {
  'Worked on the frontend of internal apps.': 'Built reusable React components used across 4 internal tools.',
  'Helped the team with tasks.': 'Reviewed pull requests and fixed UI bugs with a team of 5.',
};

/** Suggests edits that only reword or reorder what is already in the CV. */
export function tailorSuggestions(
  cv: CvContent,
  match: Pick<MatchResult, 'jobTitle' | 'strengths'>,
): Omit<TailorSuggestion, 'id'>[] {
  const out: Omit<TailorSuggestion, 'id'>[] = [];
  const SOFT = ['Communication', 'English', 'Agile'];
  const top = match.strengths
    .map((s) => s.skill)
    .filter((s) => !SOFT.includes(s))
    .slice(0, 3);
  if (top.length) {
    const title =
      match.jobTitle.toLowerCase().includes('developer') || match.jobTitle.toLowerCase().includes('engineer')
        ? match.jobTitle
        : 'developer';
    out.push({
      section: 'summary',
      original: cv.summary,
      suggested: `${title.charAt(0).toUpperCase() + title.slice(1)} with hands-on ${top.length > 1 ? `${top.slice(0, -1).join(', ')} and ${top[top.length - 1]}` : top[0]} experience from real team projects, who cares about clean, reviewed and tested work.`,
    });
  }
  for (const e of cv.experience) {
    e.bullets.forEach((b, i) => {
      if (STRONGER[b])
        out.push({
          section: 'experience',
          experienceId: e.id,
          bulletIndex: i,
          original: b,
          suggested: STRONGER[b],
        });
    });
  }
  const matched = new Set(match.strengths.map((s) => s.skill.toLowerCase()));
  const reordered = [...cv.skills].sort(
    (a, b) => Number(matched.has(b.toLowerCase())) - Number(matched.has(a.toLowerCase())),
  );
  if (reordered.join() !== cv.skills.join()) {
    out.push({ section: 'skills', original: cv.skills.join(', '), suggested: reordered.join(', ') });
  }
  return out;
}
