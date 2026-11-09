// Contact-link helpers for CVs and the Profile.
//
// Storage is unchanged: `links: string[]`. LinkedIn and GitHub are recognised by hostname, so
// existing links (in any order, with or without https://) load into the right input, and any
// other legacy link is carried through untouched.

export type LinkKind = 'linkedin' | 'github';

const DOMAIN: Record<LinkKind, string> = { linkedin: 'linkedin.com', github: 'github.com' };
const NAME: Record<LinkKind, string> = { linkedin: 'LinkedIn', github: 'GitHub' };
const EXAMPLE: Record<LinkKind, string> = { linkedin: 'linkedin.com/in/your-name', github: 'github.com/your-name' };

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i; // "javascript:", "https:" … but not "host:8080"

export const linkLabel = (k: LinkKind) => NAME[k];
export const linkExample = (k: LinkKind) => EXAMPLE[k];

function hostOf(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  if (HAS_SCHEME.test(t) && !/^https?:\/\//i.test(t)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** Which labelled network a stored link belongs to, judged by its real hostname. */
export function linkKind(raw: string): LinkKind | null {
  const h = hostOf(raw);
  if (!h) return null;
  for (const k of Object.keys(DOMAIN) as LinkKind[]) if (h === DOMAIN[k] || h.endsWith(`.${DOMAIN[k]}`)) return k;
  return null;
}

export type UrlResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Normalise user input to a safe https URL: adds a missing https://, upgrades http://, and rejects
 * other schemes (javascript:, data:, mailto: …), credentials, spaces and hosts without a dot.
 * With `kind`, the host must also belong to that network. Empty input is valid (the field is optional).
 */
export function normalizeHttpsUrl(input: string, kind?: LinkKind): UrlResult {
  const t = input.trim();
  if (!t) return { ok: true, value: '' };
  const bad = (error: string): UrlResult => ({ ok: false, error });
  const hint = kind ? `Enter a valid ${NAME[kind]} link, e.g. ${EXAMPLE[kind]}.` : 'Enter a valid link, e.g. example.com/you.';
  if (/\s/.test(t)) return bad(hint);
  if (HAS_SCHEME.test(t) && !/^https?:\/\//i.test(t)) return bad('Use a link that starts with https://');
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(t) ? t.replace(/^http:\/\//i, 'https://') : `https://${t}`);
  } catch {
    return bad(hint);
  }
  if (u.username || u.password || !u.hostname.includes('.')) return bad(hint);
  if (kind && linkKind(u.href) !== kind) return bad(`That doesn’t look like a ${NAME[kind]} link. ${hint}`);
  const bare = u.pathname === '/' && !u.search && !u.hash;
  return { ok: true, value: bare ? `https://${u.host}` : u.href };
}

export interface SplitLinks {
  linkedin: string;
  github: string;
  /** Every other stored link, in order, exactly as stored. */
  others: string[];
}

export function splitLinks(links: readonly string[]): SplitLinks {
  const out: SplitLinks = { linkedin: '', github: '', others: [] };
  for (const l of links) {
    const k = linkKind(l);
    if (k && !out[k]) out[k] = l;
    else out.others.push(l);
  }
  return out;
}

export const joinLinks = (linkedin: string, github: string, others: readonly string[]): string[] =>
  [linkedin.trim(), github.trim(), ...others].filter(Boolean);
