import { describe, expect, it } from 'vitest';
import { buildPhone, countries, countryByCode, filterCountries, flagEmoji, parseStoredPhone } from './phone';

describe('countries', () => {
  it('lists countries with name, flag and dialing code, and supports shared calling codes', () => {
    const gb = countryByCode('GB')!;
    expect(gb).toMatchObject({ name: 'United Kingdom', dial: '44', flag: '🇬🇧' });
    expect(countries().length).toBeGreaterThan(200);
    const dial1 = countries().filter((c) => c.dial === '1').map((c) => c.code);
    expect(dial1).toEqual(expect.arrayContaining(['US', 'CA']));
    const dial44 = countries().filter((c) => c.dial === '44').map((c) => c.code);
    expect(dial44).toEqual(expect.arrayContaining(['GB', 'GG', 'JE', 'IM']));
  });
  it('flagEmoji maps ISO codes to regional indicators', () => {
    expect(flagEmoji('FR')).toBe('🇫🇷');
  });
  it('filters by name, ISO code and dialing code (with or without +)', () => {
    expect(filterCountries('kingdom').map((c) => c.code)).toContain('GB');
    expect(filterCountries('fr').map((c) => c.code)).toContain('FR');
    expect(filterCountries('+44').map((c) => c.code)).toEqual(expect.arrayContaining(['GB', 'GG']));
    expect(filterCountries('1').some((c) => c.code === 'US')).toBe(true);
    expect(filterCountries('zzzz')).toEqual([]);
    expect(filterCountries('')).toHaveLength(countries().length);
  });
});

describe('parseStoredPhone (never guesses)', () => {
  it('empty', () => expect(parseStoredPhone('  ')).toEqual({ kind: 'empty' }));
  it('identifies a valid international number', () => {
    expect(parseStoredPhone('+33612345678')).toMatchObject({ kind: 'parsed', country: 'FR', e164: '+33612345678' });
    expect(parseStoredPhone('+1 415 555 2671')).toMatchObject({ kind: 'parsed', country: 'US', e164: '+14155552671' });
    expect(parseStoredPhone('+1 613 555 0123')).toMatchObject({ kind: 'parsed', country: 'CA' });
  });
  it('reads a country code written in brackets, as CVs often print it', () => {
    expect(parseStoredPhone('(+48) 600 111 222')).toMatchObject({ kind: 'parsed', country: 'PL', e164: '+48600111222' });
    expect(parseStoredPhone('( +33 ) 6 12 34 56 78')).toMatchObject({ kind: 'parsed', country: 'FR' });
  });
  it.each(['555-0100', '(415) 555-2671', '07911 123456', '+1234', '+15555550123', 'call me', '+441481123456', '(+48) 12'])(
    'keeps %s as unrecognised, unchanged',
    (raw) => expect(parseStoredPhone(raw)).toEqual({ kind: 'unrecognised', raw }),
  );
});

describe('buildPhone', () => {
  it('normalises valid numbers to E.164', () => {
    expect(buildPhone('GB', '07911 123456')).toMatchObject({ ok: true, value: '+447911123456' });
    expect(buildPhone('US', '(415) 555-2671')).toMatchObject({ ok: true, value: '+14155552671' });
    expect(buildPhone('FR', '06 12 34 56 78')).toMatchObject({ ok: true, value: '+33612345678' });
  });
  it('is optional', () => {
    expect(buildPhone('', '')).toEqual({ ok: true, value: '' });
    expect(buildPhone('US', '   ')).toEqual({ ok: true, value: '' });
  });
  it('explains problems', () => {
    expect(buildPhone('GB', '12345')).toEqual({ ok: false, error: 'Enter a valid United Kingdom phone number.' });
    expect(buildPhone('', '7911 123456')).toEqual({ ok: false, error: 'Choose a country for this number.' });
    expect(buildPhone('US', 'abc')).toMatchObject({ ok: false });
  });
  it('a pasted +country number is read as international and reports its country', () => {
    expect(buildPhone('US', '+33 6 12 34 56 78')).toMatchObject({ ok: true, value: '+33612345678', country: 'FR' });
    expect(buildPhone('', '+33612345678')).toMatchObject({ ok: true, value: '+33612345678' });
  });
});
