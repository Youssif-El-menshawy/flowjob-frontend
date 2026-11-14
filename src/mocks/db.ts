// A tiny in-browser "database" for the mock API, persisted in localStorage so accounts survive reloads.
import type { Application, Cv, GmailReview, MatchResult, Profile, TailorDraft } from '@/shared/api/types';
import { DEMO_EMAIL, DEMO_PASSWORD, demoData, uid } from './seed';

export interface UserRec {
  id: string;
  name: string;
  email: string;
  /** Mock only. The real backend stores an Argon2 hash. */
  password: string;
  createdAt: string;
}

export interface UserData {
  profile: Profile;
  cvs: Cv[];
  matches: MatchResult[];
  drafts: TailorDraft[];
  applications: Application[];
  gmail: MockGmail;
}

/** Demo-only Gmail state. Status suggestions live on the applications, like the real API. */
export interface MockGmail {
  connected: boolean;
  email?: string;
  lastSyncAt?: string;
  reviews: GmailReview[];
}

interface DB {
  users: UserRec[];
  access: Record<string, string>;
  refresh: Record<string, string>;
  data: Record<string, UserData>;
}

// v2: Gmail moved to the reviewed-suggestion contract (older demo data is reseeded).
const KEY = 'flowjob.mockdb.v2';
/** Stands in for the httpOnly refresh-token cookie the real API sets. */
export const COOKIE_KEY = 'flowjob.mock.refreshCookie';

function seed(): DB {
  const id = 'user-demo';
  return {
    users: [
      {
        id,
        name: 'Sara Nowak',
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        createdAt: '2026-09-01T10:00:00.000Z',
      },
    ],
    access: {},
    refresh: {},
    data: { [id]: demoData() },
  };
}

let cache: DB | null = null;

export function db(): DB {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as DB) : seed();
  } catch {
    cache = seed();
  }
  return cache;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db()));
  } catch {
    /* storage full or blocked: keep in memory */
  }
}

export function resetDemo() {
  const d = db();
  d.data['user-demo'] = demoData();
  save();
}

export function issueTokens(userId: string) {
  const d = db();
  const access = `mock-access.${uid()}`;
  const refresh = `mock-refresh.${uid()}`;
  d.access[access] = userId;
  d.refresh[refresh] = userId;
  save();
  try {
    localStorage.setItem(COOKIE_KEY, refresh);
  } catch {
    /* ignore */
  }
  return access;
}

export function clearCookie() {
  try {
    const r = localStorage.getItem(COOKIE_KEY);
    if (r) delete db().refresh[r];
    localStorage.removeItem(COOKIE_KEY);
    save();
  } catch {
    /* ignore */
  }
}

export function readCookie(): string | null {
  try {
    return localStorage.getItem(COOKIE_KEY);
  } catch {
    return null;
  }
}

export const publicUser = (u: UserRec) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  createdAt: u.createdAt,
});
