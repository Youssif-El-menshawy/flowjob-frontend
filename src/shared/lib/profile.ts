import type { Profile } from '@/shared/api/types';

/**
 * Single source of truth for profile completeness, used by both the Profile page
 * (strength meter) and the Dashboard onboarding. Computed from the real profile the
 * backend returns — no hardcoded "completed" flag and no placeholder-text shortcuts.
 */
export function profileStrength(p: Profile) {
  const checks = [
    { label: 'Personal details', done: !!(p.fullName && p.email && p.location) },
    { label: 'Summary', done: p.summary.trim().length > 30 },
    { label: 'Experience', done: p.experience.length > 0 },
    { label: 'Education', done: p.education.length > 0 },
    { label: 'Projects', done: p.projects.length > 0 },
    { label: 'Skills', done: p.skills.length >= 4 },
  ];
  return { checks, pct: Math.round((checks.filter((c) => c.done).length / checks.length) * 100) };
}

// Projects are genuinely optional, so they never block "complete".
const OPTIONAL_CHECKS = new Set(['Projects']);

/** True when every non-optional profile section is filled in. */
export function isProfileComplete(p: Profile | undefined | null): boolean {
  if (!p) return false;
  return profileStrength(p).checks.every((c) => c.done || OPTIONAL_CHECKS.has(c.label));
}
