import { describe, expect, it } from 'vitest';
import { catalogName, formatLanguages, parseLanguages } from './languages';

describe('saved language strings', () => {
  it.each([
    ['English - C1 / Arabic - Native', 'English (C1), Arabic (Native)'],
    ['English C1, German B2', 'English (C1), German (B2)'],
    ['English (C1), Arabic (Native)', 'English (C1), Arabic (Native)'],
    [' english c1 / ARABIC native / Polish ', 'English (C1), Arabic (Native), Polish'],
    ['Hawaiian', 'Hawaiian'],
    ['', ''],
  ])('recognizes %j and formats concise PDF text', (input, formatted) => {
    const entries = parseLanguages(input);
    expect(entries.every((entry) => entry.kind === 'language')).toBe(true);
    expect(formatLanguages(entries)).toBe(formatted);
  });

  it('keeps ambiguous legacy fragments and their internal punctuation verbatim', () => {
    const raw = ' Dialect (reading, writing) / informal only , English B2, Some free text ';
    const entries = parseLanguages(raw);
    expect(entries).toMatchObject([
      { kind: 'legacy', text: ' Dialect (reading, writing) ' },
      { kind: 'legacy', text: ' informal only ' },
      { kind: 'language', name: 'English', proficiency: 'B2' },
      { kind: 'legacy', text: ' Some free text ' },
    ]);
    expect(formatLanguages(entries)).toBe(' Dialect (reading, writing) / informal only , English (B2), Some free text ');
  });

  it.each(['English fluent', 'English (B2', 'English, ', '  Notes about language practice  '])(
    'does not guess the meaning of %j',
    (raw) => {
      expect(parseLanguages(raw)).toMatchObject([{ kind: 'legacy', text: raw }]);
      expect(formatLanguages(parseLanguages(raw))).toBe(raw);
    },
  );

  it('keeps saved duplicates and unsupported custom names separate and readable', () => {
    const raw = 'English (B2), English (C1), Fictional Dialect (A1), Another Dialect';
    const entries = parseLanguages(raw);
    expect(entries.map((entry) => entry.kind)).toEqual(['language', 'language', 'legacy', 'legacy']);
    expect(formatLanguages(entries)).toBe(raw);
  });

  it('includes less common spoken and sign languages', () => {
    expect(catalogName('woLOF')).toBe('Wolof');
    expect(catalogName('american sign language')).toBe('American Sign Language');
  });
});
