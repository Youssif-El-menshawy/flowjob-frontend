import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { ThemeToggle } from '@/features/auth/AuthShell';
import { analyseMatch } from '@/mocks/matcher';
import { demoProfile } from '@/mocks/seed';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Logo, ProgressBar, StatusPill } from '@/shared/ui/Display';
import { controlClass } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icons';

const STEPS = [
  { t: 'Build', d: 'One CV from a guided form, ready as PDF.', h: '42%', c: 'bg-[#dce8d8] text-[#1c2b22]' },
  {
    t: 'Match',
    d: 'See your fit, strengths and gaps for a job.',
    h: '60%',
    c: 'bg-[#b9d0b8] text-[#1c2b22]',
  },
  {
    t: 'Tailor',
    d: 'A focused version for that job. Your original stays.',
    h: '80%',
    c: 'bg-[#477558] text-white',
  },
  {
    t: 'Track',
    d: 'Every application and Gmail reply in one place.',
    h: '100%',
    c: 'bg-[#2e5b44] text-white',
  },
];

export default function LandingPage() {
  useDocumentTitle('');
  const { status } = useAuth();
  const authed = status === 'authenticated';
  const [job, setJob] = useState(
    'Junior Frontend Developer, Allegro. React, TypeScript, Git, unit testing, REST APIs, English B2+.',
  );
  const [result, setResult] = useState<ReturnType<typeof analyseMatch> | null>(null);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-6">
        <Logo />
        <nav aria-label="Site" className="flex items-center gap-2 sm:gap-6">
          <a href="#how" className="hidden text-[15px] text-soft hover:text-ink sm:inline">
            How it works
          </a>
          <a href="#pricing" className="hidden text-[15px] text-soft hover:text-ink sm:inline">
            Pricing
          </a>
          <ThemeToggle />
          {authed ? (
            <ButtonLink to="/app">Open dashboard</ButtonLink>
          ) : (
            <>
              <Link to="/login" className="px-2 text-[15px] font-medium">
                Log in
              </Link>
              <ButtonLink to="/register">Create free account</ButtonLink>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto grid max-w-[1180px] items-center gap-14 px-6 pt-10 pb-24 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-in">
          <h1 className="text-5xl leading-[1.02] font-semibold sm:text-[64px]">
            Every application, one step closer.
          </h1>
          <p className="mt-6 max-w-[520px] text-lg leading-relaxed text-soft">
            Build one strong CV, see how well it fits a job before you apply, tailor it in a minute, and keep
            track of every reply.
          </p>
          <form
            className="mt-9 max-w-[560px] rounded-3xl border border-line bg-surface p-5"
            onSubmit={(e) => {
              e.preventDefault();
              setResult(analyseMatch(demoProfile(), job));
            }}
          >
            <label htmlFor="try-job" className="text-sm font-medium">
              Try it: paste a job you like
            </label>
            <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
              <input
                id="try-job"
                value={job}
                onChange={(e) => setJob(e.target.value)}
                className={`${controlClass()} min-h-12 flex-1`}
              />
              <Button type="submit" className="min-h-12">
                Check my match
              </Button>
            </div>
            {result && (
              <div key={result.score + job} className="mt-5 border-t border-line pt-5 animate-in">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-display text-4xl font-semibold">{result.score}%</span>
                  <span className="text-sm text-soft">{result.verdict} · example using a sample CV</span>
                </div>
                <ProgressBar value={result.score} className="mt-3" label="Match score" />
                <p className="mt-3 text-[15px] leading-relaxed text-soft">{result.summary}</p>
                <Link
                  to={authed ? '/app/match' : '/register'}
                  className="mt-3 inline-flex items-center gap-1.5 text-[15px] font-medium text-accent-ink hover:underline"
                >
                  {authed ? 'Check it with your own CV' : 'Create a free account to use your own CV'}{' '}
                  <Icon.arrowRight />
                </Link>
              </div>
            )}
          </form>
        </div>
        <div
          className="flex h-[440px] items-end gap-3"
          role="img"
          aria-label="FlowJob in four steps: build, match, tailor, track"
        >
          {STEPS.map((s, i) => (
            <div
              key={s.t}
              className={`${s.c} flex flex-1 flex-col justify-between rounded-t-3xl rounded-b-lg p-4 animate-grow transition-transform hover:-translate-y-1.5`}
              style={{ height: s.h, animationDelay: `${0.15 + i * 0.1}s` }}
            >
              <span className="font-display text-xl font-semibold">{s.t}</span>
              <span className="text-[13px] leading-snug opacity-90">{s.d}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-[1180px] px-6 py-24">
          <h2 className="max-w-xl text-4xl leading-tight font-semibold">
            Made for the part of job hunting nobody enjoys.
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-soft">
            Each tool does one job well, and they all share the same CV and the same list of applications.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                t: 'A CV that is easy to keep up to date',
                d: 'Fill in a guided form once and download it whenever you need it.',
                x: <span className="font-display font-semibold">Sara Nowak · Frontend Intern</span>,
              },
              {
                t: 'Know your fit before you apply',
                d: 'A match score, what already fits, and what is missing. Then tailor your CV for that job.',
                x: (
                  <div className="w-full">
                    <div className="mb-2 text-sm">
                      <strong>78%</strong> <span className="text-soft">Junior Frontend, Allegro</span>
                    </div>
                    <ProgressBar value={78} />
                  </div>
                ),
              },
              {
                t: 'Your applications, kept in order',
                d: 'Connect Gmail and replies update the status, or ask you first when unsure.',
                x: (
                  <div className="flex flex-wrap gap-2">
                    <StatusPill status="Applied" />
                    <StatusPill status="Interview" />
                    <StatusPill status="Offer" />
                  </div>
                ),
              },
            ].map((f) => (
              <article key={f.t} className="flex flex-col gap-4 rounded-3xl bg-bg p-7 lift">
                <h3 className="text-[22px] leading-snug font-semibold">{f.t}</h3>
                <p className="leading-relaxed text-soft">{f.d}</p>
                <div className="mt-auto flex min-h-14 items-center rounded-2xl bg-surface px-4 py-3">
                  {f.x}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-[1180px] gap-12 px-6 py-24 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="text-4xl font-semibold">Your inbox stays yours.</h2>
          <p className="mt-4 text-lg leading-relaxed text-soft">
            Gmail access is read-only and optional. FlowJob only looks for replies to applications you added
            yourself.
          </p>
        </div>
        <ul>
          {[
            'We keep the sender, subject and result. Never the full email.',
            'Gmail never creates applications on its own.',
            'When a reply is unclear, you decide.',
            'Disconnect any time and your access token is deleted.',
          ].map((s) => (
            <li key={s} className="border-t border-line py-4 text-[17px] last:border-b">
              {s}
            </li>
          ))}
        </ul>
      </section>

      <section id="pricing" className="bg-[#10261b] text-[#e8efe6]">
        <div className="mx-auto max-w-[1180px] px-6 py-24">
          <h2 className="text-4xl font-semibold">Free while you study.</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-3 rounded-3xl bg-white p-8 text-[#1c2b22]">
              <span className="font-medium">Student</span>
              <span className="font-display text-5xl font-semibold">0 zł</span>
              <p className="leading-relaxed text-[#56665b]">
                CV builder, 10 job matches and 5 tailored CVs a month, application tracking and Gmail sync.
              </p>
              <ButtonLink to={authed ? '/app' : '/register'} className="mt-3 self-start">
                {authed ? 'Open dashboard' : 'Create free account'}
              </ButtonLink>
            </div>
            <div className="flex flex-col gap-3 rounded-3xl bg-[#fde8d6] p-8 text-[#1c2b22]">
              <span className="font-medium">Pro (demo pricing)</span>
              <span className="font-display text-5xl font-semibold">
                19 zł <span className="text-lg font-normal">/ month</span>
              </span>
              <p className="leading-relaxed text-[#56665b]">
                Unlimited matches and tailored CVs, for the months when you apply every day.
              </p>
              <p className="mt-auto text-sm text-[#7a3a12]">
                Shown for the course demo. No payments are taken.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-[1180px] flex-wrap justify-between gap-4 px-6 py-8 text-sm text-soft">
        <span>FlowJob · Team project, Wrocław University of Science and Technology</span>
        <span>Privacy · Terms</span>
      </footer>
    </div>
  );
}
