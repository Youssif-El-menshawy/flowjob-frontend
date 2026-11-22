import { ApiError, ServerUnavailableError } from '@/shared/api/client';
import type { CvContent, CvImportResult, CvImportWarning, Profile } from '@/shared/api/types';
import type { Section } from '@/features/cv/CvForm';

export const MAX_CV_PDF_BYTES = 5 * 1024 * 1024;

async function readHead(file: File): Promise<Uint8Array> {
  const head = file.slice(0, 1024);
  if (typeof head.arrayBuffer === 'function') return new Uint8Array(await head.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(head);
  });
}

/** The same checks the backend makes first, so a wrong file never leaves the browser. null = looks like a PDF. */
export async function checkCvPdf(file: File): Promise<string | null> {
  if (!file.size) return 'This file is empty. Choose your CV as a PDF file.';
  if (file.size > MAX_CV_PDF_BYTES) return 'This file is larger than 5 MB. Choose a smaller PDF.';
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return 'Choose a PDF file.';
  let head: Uint8Array;
  try {
    head = await readHead(file);
  } catch {
    return 'This file could not be read. Choose it again.';
  }
  let start = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf ? 3 : 0; // UTF-8 byte-order mark
  while (start < head.length && [0x09, 0x0a, 0x0c, 0x0d, 0x20].includes(head[start])) start++;
  const signature = String.fromCharCode(...head.slice(start, start + 5));
  return signature === '%PDF-' ? null : 'This file is not a PDF. Choose your CV as a PDF file.';
}

export interface ImportFailure {
  title: string;
  message: string;
}

/** What to tell the user when POST /profile/import/pdf fails. The backend's own message is kept where it is specific. */
export function describeImportError(error: unknown): ImportFailure {
  if (error instanceof ServerUnavailableError) return { title: 'FlowJob is unavailable', message: error.message };
  if (!(error instanceof ApiError)) {
    return { title: 'Import failed', message: 'Something went wrong while importing your CV. Please try again.' };
  }
  const message = error.message;
  switch (error.status) {
    case 409:
      return { title: 'Your CV is already imported', message };
    case 413:
      return { title: 'This PDF is too large', message: 'The limit is 5 MB. Export a smaller PDF and try again.' };
    case 415:
      return { title: 'Not a PDF', message };
    case 422:
      if (/scanned|selectable text/i.test(message)) return { title: 'This looks like a scanned CV', message };
      if (/password/i.test(message)) return { title: 'This PDF is password-protected', message };
      return { title: 'This PDF could not be imported', message };
    case 428:
      return { title: 'Consent needed', message };
    case 429:
      return /limit/i.test(message)
        ? { title: 'Daily import limit reached', message: `${message} You can still create your CV manually.` }
        : { title: 'The AI service is busy', message };
    case 502:
    case 504:
      return { title: 'The CV could not be organized', message };
    case 503:
      return { title: 'Import is unavailable right now', message };
    default:
      return { title: 'Import failed', message };
  }
}

const SECTION_OF: Array<[RegExp, Section]> = [
  [/^(fullName|email|phone|location|links)/, 'personal'],
  [/^summary/, 'summary'],
  [/^experience/, 'experience'],
  [/^education/, 'education'],
  [/^projects/, 'projects'],
  [/^(skills|languages)/, 'skills'],
];

const MISSING_SECTION: Record<CvImportResult['missing'][number], Section> = {
  fullName: 'personal', email: 'personal', phone: 'personal', location: 'personal', summary: 'summary',
  experience: 'experience', education: 'education', skills: 'skills',
};

export const MISSING_LABEL: Record<CvImportResult['missing'][number], string> = {
  fullName: 'Full name', email: 'Email', phone: 'Phone', location: 'Location', summary: 'Summary',
  experience: 'Experience', education: 'Education', skills: 'Skills',
};

const ENTRY = { experience: 'Job', education: 'Education entry', projects: 'Project' } as const;
const PART: Record<string, string> = {
  title: 'job title', company: 'company', location: 'location', start: 'start date', end: 'end date',
  bullets: 'bullet point', school: 'school', degree: 'degree', note: 'note', name: 'name', tech: 'technologies',
  description: 'description',
};
const FIELD: Record<string, string> = {
  fullName: 'Full name', email: 'Email', phone: 'Phone', location: 'Location', summary: 'Summary', links: 'Link',
  skills: 'Skill', languages: 'Languages', experience: 'Jobs', education: 'Education', projects: 'Projects',
};

/** Reasons where the value is in the CV but its place could not be confirmed, as opposed to not found at all. */
const UNSURE = new Set<CvImportWarning['reason']>(['date_not_near_entry', 'date_ambiguous', 'under_other_entry', 'outside_entry']);

export interface ImportNote {
  section: Section;
  label: string;
  value: string;
  message: string;
  unsure: boolean;
}

export function describeWarning(warning: CvImportWarning): ImportNote {
  const section = SECTION_OF.find(([pattern]) => pattern.test(warning.field))?.[1] ?? 'personal';
  const entry = /^(experience|education|projects)\[(\d+)\](?:\.(\w+))?/.exec(warning.field);
  let label: string;
  if (entry) {
    const [, kind, index, part] = entry;
    label = `${ENTRY[kind as keyof typeof ENTRY]} ${Number(index) + 1} in your CV${part ? `: ${PART[part] ?? part}` : ''}`;
  } else {
    label = FIELD[warning.field.replace(/\[\d+\].*$/, '')] ?? warning.field;
  }
  return { section, label, value: warning.value, message: warning.message, unsure: UNSURE.has(warning.reason) };
}

/** How many notes and missing fields each section has, for the section tabs. */
export function countBySection(result: CvImportResult): Partial<Record<Section, number>> {
  const counts: Partial<Record<Section, number>> = {};
  for (const warning of result.warnings) {
    const { section } = describeWarning(warning);
    counts[section] = (counts[section] ?? 0) + 1;
  }
  for (const field of result.missing) counts[MISSING_SECTION[field]] = (counts[MISSING_SECTION[field]] ?? 0) + 1;
  return counts;
}

// --- combining the import with the Profile ------------------------------------------------------------------------

/** Profile values the review can take from the CV. Full name and email always stay the account's (Profile's). */
export type ChoiceKey = 'phone' | 'location' | 'links' | 'summary' | 'experience' | 'education' | 'projects' | 'skills' | 'languages';
export const CHOICE_KEYS: ChoiceKey[] = [
  'phone', 'location', 'links', 'summary', 'experience', 'education', 'projects', 'skills', 'languages',
];
export const CHOICE_SECTION: Record<ChoiceKey, Section> = {
  phone: 'personal', location: 'personal', links: 'personal', summary: 'summary', experience: 'experience',
  education: 'education', projects: 'projects', skills: 'skills', languages: 'skills',
};
export const CHOICE_LABEL: Record<ChoiceKey, string> = {
  phone: 'Phone', location: 'Location', links: 'Links', summary: 'Summary', experience: 'Experience',
  education: 'Education', projects: 'Projects', skills: 'Skills', languages: 'Languages',
};

/** Which version of a value the review keeps: the Profile's (the default) or the CV's. */
export type Source = 'profile' | 'cv';
export type Choices = Partial<Record<ChoiceKey, Source>>;

type Value = Profile[ChoiceKey];

export const isEmptyValue = (value: Value) =>
  Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim();

/** Compared without entry ids (the import numbers its own) and surrounding whitespace. */
const comparable = (value: Value) =>
  JSON.stringify(
    Array.isArray(value)
      ? value.map((item) => (item && typeof item === 'object' ? { ...item, id: undefined } : item))
      : String(value ?? '').trim(),
  );

/** Values the Profile and the CV both have and that differ: the user decides, and the Profile's is kept by default. */
export function conflicts(profile: Profile, imported: CvContent): ChoiceKey[] {
  return CHOICE_KEYS.filter(
    (key) => !isEmptyValue(profile[key]) && !isEmptyValue(imported[key]) && comparable(profile[key]) !== comparable(imported[key]),
  );
}

/** One value as the review keeps it: the CV's where the Profile has none, the Profile's where the CV has none, and
 *  otherwise the chosen one (the Profile's unless the user chose the CV's). */
export function pick(key: ChoiceKey, profile: Profile, imported: CvContent, choice: Source | undefined): Value {
  const mine = profile[key];
  const theirs = imported[key];
  const value = isEmptyValue(mine) ? theirs : isEmptyValue(theirs) || choice !== 'cv' ? mine : theirs;
  return structuredClone(value);
}

/** The Profile the review starts with. Full name and email are always the Profile's (the account's). */
export function combine(profile: Profile, imported: CvContent, choices: Choices = {}): Profile {
  const out = structuredClone(profile);
  for (const key of CHOICE_KEYS) (out as Record<ChoiceKey, Value>)[key] = pick(key, profile, imported, choices[key]);
  return out;
}

/** A short description of a value for the conflict choice, e.g. "2 jobs" or "“+48 600 123 456”". */
export function describeValue(key: ChoiceKey, value: Value): string {
  if (Array.isArray(value)) {
    const n = value.length;
    const noun: Partial<Record<ChoiceKey, [string, string]>> = {
      experience: ['job', 'jobs'], education: ['entry', 'entries'], projects: ['project', 'projects'],
      skills: ['skill', 'skills'], links: ['link', 'links'],
    };
    const [one, many] = noun[key] ?? ['item', 'items'];
    const names = key === 'skills' || key === 'links'
      ? (value as string[])
      : (value as Array<{ title?: string; degree?: string; name?: string }>).map((x) => x.title || x.degree || x.name || '');
    const listed = names.filter(Boolean).slice(0, 3).join(', ');
    return `${n} ${n === 1 ? one : many}${listed ? `: ${listed}${names.length > 3 ? ', …' : ''}` : ''}`;
  }
  const text = String(value ?? '').trim();
  return `“${text.length > 80 ? `${text.slice(0, 79)}…` : text}”`;
}
