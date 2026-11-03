import type {
  Application,
  ApplicationStatus,
  Cv,
  CvContent,
  GmailConnection,
  MatchResult,
  Profile,
  StatusEvent,
} from '@/shared/api/types';
import { analyseMatch } from './matcher';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const DEMO_EMAIL = 'sara@flowjob.dev';
export const DEMO_PASSWORD = 'flowjob123';

export function emptyProfile(name: string, email: string): Profile {
  return {
    fullName: name,
    email,
    phone: '',
    location: '',
    links: [],
    summary: '',
    experience: [],
    education: [],
    projects: [],
    skills: [],
    languages: '',
  };
}

export function demoProfile(): Profile {
  return {
    fullName: 'Sara Nowak',
    email: DEMO_EMAIL,
    phone: '+48 600 000 000',
    location: 'Wrocław, Poland',
    links: ['github.com/saranowak', 'linkedin.com/in/saranowak'],
    summary: 'Computer science student interested in web development and teamwork.',
    experience: [
      {
        id: 'exp1',
        title: 'Frontend Intern',
        company: 'Tooploox',
        location: 'Wrocław',
        start: 'Jul 2026',
        end: 'Sep 2026',
        bullets: [
          'Worked on the frontend of internal apps.',
          'Helped the team with tasks.',
          'Used React, TypeScript and Git every day.',
        ],
      },
      {
        id: 'exp2',
        title: 'Student Mentor',
        company: 'University IT Club',
        start: 'Oct 2025',
        end: 'Jun 2026',
        bullets: [
          'Ran weekly Git and web basics workshops for 30 first-year students.',
          'Organised a 24-hour student hackathon.',
        ],
      },
    ],
    education: [
      {
        id: 'edu1',
        degree: 'BSc Applied Computer Science',
        school: 'Wrocław University of Science and Technology',
        start: '2023',
        end: '2027',
        note: 'Thesis: job application tracking with AI support',
      },
    ],
    projects: [
      {
        id: 'pr1',
        name: 'FlowJob',
        tech: 'React, TypeScript, FastAPI, PostgreSQL',
        description: 'Team project: a job search assistant. Led UI/UX design and the frontend.',
      },
    ],
    skills: ['Python', 'SQL', 'HTML/CSS', 'JavaScript', 'React', 'TypeScript', 'Git'],
    languages: 'English C1, Polish native',
  };
}

export const toContent = (p: Profile): CvContent => JSON.parse(JSON.stringify(p));

const ALLEGRO_JOB = `Junior Frontend Developer, Allegro, Wrocław

You will build features in React and TypeScript, write unit tests with Jest, and work with REST APIs together with backend engineers.

Requirements: React, TypeScript, Git, unit testing, basic REST API knowledge, English B2+.`;

const d = (s: string) => new Date(s + 'T10:00:00').toISOString();

function ev(
  status: ApplicationStatus,
  date: string,
  source: StatusEvent['source'] = 'manual',
  note?: string,
): StatusEvent {
  return { id: uid(), status, at: d(date), source, note };
}

export function demoData() {
  const profile = demoProfile();
  const now = new Date().toISOString();
  const original: Cv = {
    id: 'cv-original',
    name: 'Original CV',
    kind: 'original',
    createdAt: d('2026-09-01'),
    updatedAt: d('2026-10-03'),
    content: toContent(profile),
  };
  const tailored = (id: string, name: string, jobTitle: string, company: string, date: string): Cv => {
    const c = toContent(profile);
    c.summary = `${jobTitle} candidate with hands-on React, TypeScript and Git experience from real team projects.`;
    c.experience[0].bullets = [
      'Built reusable React components used across 4 internal tools.',
      'Reviewed pull requests and fixed UI bugs with a team of 5.',
      'Used React, TypeScript and Git every day.',
    ];
    return {
      id,
      name,
      kind: 'tailored',
      jobTitle,
      company,
      createdAt: d(date),
      updatedAt: d(date),
      content: c,
    };
  };
  const cvs: Cv[] = [
    original,
    tailored('cv-allegro', 'Allegro v2', 'Junior Frontend Developer', 'Allegro', '2026-10-02'),
    tailored('cv-nokia', 'Nokia v1', 'Software Trainee', 'Nokia', '2026-10-11'),
    tailored('cv-capgemini', 'Capgemini v1', 'Graduate Developer', 'Capgemini', '2026-09-18'),
  ];
  const m = analyseMatch(original.content, ALLEGRO_JOB);
  const matches: MatchResult[] = [
    { ...m, id: 'match-allegro', cvId: original.id, cvName: original.name, createdAt: d('2026-10-01') },
  ];

  const app = (
    company: string,
    jobTitle: string,
    date: string,
    history: StatusEvent[],
    extra: Partial<Application> = {},
  ): Application => ({
    id: uid(),
    company,
    jobTitle,
    dateApplied: date,
    status: history[history.length - 1].status,
    history,
    suggestion: null,
    updatedAt: history[history.length - 1].at,
    ...extra,
  });
  const applications: Application[] = [
    app('Spotify', 'Junior Web Developer', '2026-10-21', [ev('Applied', '2026-10-21')]),
    app('Revolut', 'Frontend Engineer Intern', '2026-10-19', [ev('Applied', '2026-10-19')]),
    app('Netguru', 'React Developer', '2026-10-17', [ev('Applied', '2026-10-17')], {
      jobUrl: 'netguru.com/careers',
    }),
    app('Ocado Technology', 'Graduate Engineer', '2026-10-15', [ev('Applied', '2026-10-15')]),
    app('Sii', 'Junior Developer', '2026-10-14', [ev('Applied', '2026-10-14')]),
    app(
      'Nokia',
      'Software Trainee',
      '2026-10-09',
      [
        ev('Applied', '2026-10-09', 'manual', 'Saved with Nokia v1.'),
        ev(
          'Under review',
          '2026-10-12',
          'gmail_auto',
          '“Thanks for applying. Our team is reviewing your application.”',
        ),
      ],
      { cvId: 'cv-nokia' },
    ),
    app('ING Tech', 'Junior Developer', '2026-10-06', [
      ev('Applied', '2026-10-06'),
      ev('Under review', '2026-10-10'),
    ]),
    app('Asseco', 'Frontend Developer', '2026-10-03', [
      ev('Applied', '2026-10-03'),
      ev('Under review', '2026-10-08'),
    ]),
    app(
      'Allegro',
      'Junior Frontend Developer',
      '2026-10-02',
      [
        ev('Applied', '2026-10-02', 'manual', 'Saved with Allegro v2.'),
        ev(
          'Under review',
          '2026-10-06',
          'gmail_auto',
          '“Thank you for applying, our team is reviewing your application.”',
        ),
        ev('Interview', '2026-10-14', 'gmail_confirmed', 'Invitation to a technical interview on 20 Oct.'),
      ],
      {
        cvId: 'cv-allegro',
        jobUrl: 'allegro.pl/kariera/junior-frontend',
        notes: 'Referred by Kasia from the meetup.',
        suggestion: {
          id: uid(),
          proposedStatus: 'Offer',
          from: 'careers@allegro.pl',
          snippet: '“We are happy to share the next steps of your offer…”',
          receivedAt: now,
        },
      },
    ),
    app('Comarch', 'Web Developer', '2026-09-29', [
      ev('Applied', '2026-09-29'),
      ev('Interview', '2026-10-13'),
    ]),
    app(
      'Capgemini',
      'Graduate Developer',
      '2026-09-20',
      [ev('Applied', '2026-09-20'), ev('Interview', '2026-10-01'), ev('Offer', '2026-10-16')],
      { cvId: 'cv-capgemini' },
    ),
    app('Google', 'STEP Intern', '2026-09-05', [
      ev('Applied', '2026-09-05'),
      ev('Rejected', '2026-09-26', 'gmail_auto', '“Unfortunately we will not be moving forward…”'),
    ]),
    app('Microsoft', 'Explore Intern', '2026-09-01', [
      ev('Applied', '2026-09-01'),
      ev('Rejected', '2026-09-30'),
    ]),
    app('Samsung R&D', 'QA Intern', '2026-08-28', [
      ev('Applied', '2026-08-28'),
      ev('Withdrawn', '2026-09-10', 'manual', 'Took the Tooploox internship instead.'),
    ]),
  ];
  const gmail: GmailConnection = {
    connected: true,
    email: 'sara.nowak@gmail.com',
    lastSyncAt: now,
    autoSync: true,
    updatesThisMonth: 9,
  };
  return { profile, cvs, matches, drafts: [], applications, gmail };
}
