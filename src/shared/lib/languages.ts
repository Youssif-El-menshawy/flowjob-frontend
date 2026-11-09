import { LANGUAGE_NAMES } from './languageCatalog';

export const PROFICIENCIES = ['Native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'] as const;
export type Proficiency = (typeof PROFICIENCIES)[number] | '';

export interface LanguageFields {
  name: string;
  proficiency: Proficiency;
}

export type LanguageEntry =
  | ({ kind: 'language' } & LanguageFields)
  | { kind: 'legacy'; text: string; separator?: string };

export const languageKey = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();

const names = new Map(LANGUAGE_NAMES.map((name) => [languageKey(name), name]));
export const catalogName = (name: string) => names.get(languageKey(name));

const level = PROFICIENCIES.join('|');
const suffix = new RegExp(`^(.+?)(?:\\s*\\(\\s*(${level})\\s*\\)|\\s*[-–—]\\s*(${level})|\\s+(${level}))$`, 'iu');

/** Recognize explicit levels. A custom or ambiguous legacy name is interpreted only on Edit. */
export function readLanguageFields(text: string): LanguageFields {
  const name = text.trim();
  if (catalogName(name)) return { name, proficiency: '' };
  const match = suffix.exec(name);
  if (!match) return { name, proficiency: '' };
  const token = match[2] ?? match[3] ?? match[4];
  return {
    name: match[1].trim(),
    proficiency: PROFICIENCIES.find((item) => item.toLowerCase() === token.toLowerCase()) ?? '',
  };
}

/** Split only top-level list separators; punctuation inside saved notes stays intact. */
function splitEntries(value: string) {
  const parts: Array<{ text: string; separator: string }> = [];
  let depth = 0;
  let start = 0;
  let separator = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    else if (character === ')') {
      if (depth === 0) return null;
      depth -= 1;
    } else if (depth === 0 && (character === ',' || character === '/')) {
      parts.push({ text: value.slice(start, index), separator });
      start = index + 1;
      separator = character;
    }
  }
  if (depth !== 0) return null;
  parts.push({ text: value.slice(start), separator });
  return parts.every((part) => part.text.trim()) ? parts : null;
}

export function parseLanguages(value?: string | null): LanguageEntry[] {
  if (!value?.trim()) return [];
  const parts = splitEntries(value);
  if (!parts) return [{ kind: 'legacy', text: value }];

  const entries: LanguageEntry[] = [];
  for (const part of parts) {
    const fields = readLanguageFields(part.text);
    const name = catalogName(fields.name);
    if (name) entries.push({ kind: 'language', name, proficiency: fields.proficiency });
    else entries.push({ kind: 'legacy', text: part.text, separator: part.separator || undefined });
  }
  return entries;
}

export function formatLanguage({ name, proficiency }: LanguageFields): string {
  return proficiency ? `${name} (${proficiency})` : name;
}

/** Serialize only on an explicit edit. Keep unrecognized chunks verbatim. */
export function formatLanguages(entries: readonly LanguageEntry[]): string {
  return entries.map((entry, index) => {
    const text = entry.kind === 'legacy' ? entry.text : formatLanguage(entry);
    if (index === 0) return text;
    if (entry.kind === 'legacy' && entries[index - 1].kind === 'legacy' && entry.separator) {
      return entry.separator + text;
    }
    return (/^\s/u.test(text) ? ',' : ', ') + text;
  }).join('');
}
