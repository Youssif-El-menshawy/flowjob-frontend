export const cn = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function fmtDate(iso?: string | null, withYear = false) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

export const suggestionPhrase = (s: string) =>
  (
    ({
      Offer: 'an offer',
      Interview: 'an interview invite',
      Saved: 'a saved role',
      Rejected: 'a rejection',
      Withdrawn: 'a withdrawal',
    }) as Record<string, string>
  )[s] ?? s.toLowerCase();

export function fmtRelative(iso?: string) {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  const d = new Date(iso);
  if (diff < 86400 && d.getDate() === new Date().getDate()) return `today, ${timeFmt.format(d)}`;
  return fmtDate(iso, true);
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export const firstName = (name?: string) => (name ?? '').trim().split(/\s+/)[0] || 'there';
export const initials = (name?: string) =>
  (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || 'FJ';

/** Trigger a browser download for an in-memory Blob (e.g. a PDF fetched from the API). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
