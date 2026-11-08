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

/** The rising line from the auth panels: "a clearer path forward". */
export function PathChart() {
  const d =
    'M0 170 C 40 170, 60 150, 90 148 S 140 135, 165 128 S 205 100, 230 96 S 270 70, 300 60 S 345 25, 380 0';
  return (
    <svg viewBox="-10 -20 400 210" className="w-full max-w-[460px]" aria-hidden>
      <defs>
        <linearGradient id="fj-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8fd6a8" stopOpacity="0.28" />
          <stop offset="1" stopColor="#8fd6a8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 85, 130, 175].map((y) => (
        <line key={y} x1="0" x2="380" y1={y} y2={y} stroke="#ffffff" strokeOpacity="0.06" />
      ))}
      <path
        d={`${d} L 380 180 L 0 180 Z`}
        fill="url(#fj-area)"
        className="animate-in"
        style={{ animationDelay: '1s' }}
      />
      <path
        d={d}
        fill="none"
        stroke="#9fe0b8"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        className="animate-draw"
      />
      <circle
        cx="380"
        cy="0"
        r="9"
        fill="#9fe0b8"
        fillOpacity="0.2"
        className="animate-pop"
        style={{ animationDelay: '1.9s' }}
      />
      <circle
        cx="380"
        cy="0"
        r="4"
        fill="#9fe0b8"
        className="animate-pop"
        style={{ animationDelay: '1.9s' }}
      />
    </svg>
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
          <span>FlowJob · A little structure for your next chapter.</span>
          <span className="hidden sm:inline">Student project, PWr</span>
        </div>
      </div>
      <aside className="relative hidden w-1/2 max-w-[720px] flex-col overflow-hidden bg-[#10261b] px-16 pt-32 pb-20 text-[#e8efe6] lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_60%,rgba(143,214,168,0.10),transparent_60%)]" />
        <h2 className="relative max-w-sm text-5xl leading-[1.05] font-semibold">{title}</h2>
        <p className="relative mt-5 max-w-sm text-[15px] text-[#a3b5a8]">{text}</p>
        <div className="relative mt-auto">
          <PathChart />
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
