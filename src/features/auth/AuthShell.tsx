import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/shared/lib/theme';
import { Logo } from '@/shared/ui/Display';
import { Icon } from '@/shared/ui/Icons';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="grid size-10 place-items-center rounded-full border border-line text-soft transition-colors hover:bg-tint hover:text-ink"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? <Icon.sun /> : <Icon.moon />}
    </button>
  );
}

/** The whole job search in FlowJob, step by step: what the app does, shown beside the sign-in forms. */
const JOURNEY = [
  { t: 'Find', d: 'Open roles in Poland, ranked by how well they fit your CV' },
  { t: 'Match', d: 'Your fit for a job, with proof from your own CV' },
  { t: 'Tailor', d: 'A focused CV for that job. Your original never changes' },
  { t: 'Apply', d: 'Straight to the employer’s posting with the right CV' },
  { t: 'Track', d: 'Every application and its status in one place' },
];

export function JourneySteps() {
  return (
    <ol className="relative flex flex-col gap-5" aria-label="Your job search in FlowJob">
      <span aria-hidden className="absolute top-4 bottom-4 left-[15px] w-px bg-[#9fe0b8]/25" />
      {JOURNEY.map((step, i) => (
        <li
          key={step.t}
          className="relative flex items-start gap-4 animate-in"
          style={{ animationDelay: `${0.25 + i * 0.15}s` }}
        >
          <span
            className={
              'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ' +
              (i === JOURNEY.length - 1
                ? 'bg-[#9fe0b8] text-[#10261b]'
                : 'border border-[#9fe0b8]/50 bg-[#10261b] text-[#9fe0b8]')
            }
          >
            {i + 1}
          </span>
          <span className="pt-0.5">
            <span className="block font-semibold text-[#e8efe6]">{step.t}</span>
            <span className="block text-sm leading-snug text-[#a3b5a8]">{step.d}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AuthShell({ children, title, text }: { children: ReactNode; title: string; text: string }) {
  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col px-6 py-7 sm:px-10">
        <div className="flex items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-3">
            <Link to="/" className="hidden items-center gap-1.5 text-sm text-soft hover:text-ink sm:flex">
              <Icon.arrowLeft /> Back to FlowJob
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[380px] animate-in">{children}</div>
        </div>
        <div className="flex justify-between text-xs text-soft">
          <span>FlowJob · Find, apply and track your next job in one place.</span>
          <span className="hidden sm:inline">Student project, PWr</span>
        </div>
      </div>
      <aside className="relative hidden w-1/2 max-w-[720px] flex-col overflow-hidden bg-[#10261b] px-16 pt-24 pb-16 text-[#e8efe6] lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_60%,rgba(143,214,168,0.10),transparent_60%)]" />
        <h2 className="relative max-w-sm text-5xl leading-[1.05] font-semibold">{title}</h2>
        <p className="relative mt-5 max-w-sm text-[15px] text-[#a3b5a8]">{text}</p>
        <div className="relative mt-14">
          <JourneySteps />
        </div>
      </aside>
    </div>
  );
}

export const passwordScore = (p: string) => {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[A-Z]/.test(p)) s++;
  if (p.length >= 12 || /[^A-Za-z0-9]/.test(p)) s++;
  return s;
};
