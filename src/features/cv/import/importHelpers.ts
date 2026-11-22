import { ApiError, ServerUnavailableError } from '@/shared/api/client';
import type { CvImportResult, CvImportWarning } from '@/shared/api/types';
import type { Section } from '../CvForm';

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

/** What to tell the user when POST /cvs/import fails. The backend's own message is kept where it is specific. */
export function describeImportError(error: unknown): ImportFailure {
  if (error instanceof ServerUnavailableError) return { title: 'FlowJob is unavailable', message: error.message };
  if (!(error instanceof ApiError)) {
    return { title: 'Import failed', message: 'Something went wrong while importing your CV. Please try again.' };
  }
  const message = error.message;
  switch (error.status) {
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
