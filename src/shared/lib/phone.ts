// International phone helpers (libphonenumber-js "min" metadata, ~84 KB).
//
// Storage is unchanged: `phone` stays a single optional string. New/edited numbers are saved in E.164
// ("+447911123456"). Existing values are only ever *parsed* for display: a legacy value is never rewritten
// unless the user edits it, and when a country cannot be identified confidently we don't guess one.
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/min';

export type { CountryCode };

export interface CountryOption {
  code: CountryCode;
  name: string;
  /** Calling code without "+", e.g. "44". Several countries can share one (US/CA = 1, GB/GG/JE/IM = 44). */
  dial: string;
  flag: string;
}

export const flagEmoji = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

let cache: CountryOption[] | null = null;
export function countries(): CountryOption[] {
  if (cache) return cache;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  cache = getCountries()
    .map((code) => ({
      code,
      name: names.of(code) ?? code,
      dial: getCountryCallingCode(code),
      flag: flagEmoji(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

export const countryByCode = (code: string): CountryOption | undefined => countries().find((c) => c.code === code);

/** Search by name, ISO code or dialing code ("uk", "kingdom", "+44", "44"). */
export function filterCountries(query: string, includeDial = true): CountryOption[] {
  const q = query.trim().toLowerCase().replace(/^\+/, '');
  if (!q) return countries();
  const digits = /^\d+$/.test(q);
  return countries().filter((c) =>
    digits ? includeDial && c.dial.startsWith(q) : c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q,
  );
}

export type StoredPhone =
  | { kind: 'empty' }
  | { kind: 'parsed'; country: CountryCode; national: string; e164: string }
  | { kind: 'unrecognised'; raw: string };

/**
 * Reads a stored value. Only a number written with an international "+" prefix that libphonenumber
 * can place in a specific country is treated as parsed; everything else (local formats, ambiguous or
 * invalid numbers) is "unrecognised" and kept exactly as stored.
 */
export function parseStoredPhone(value?: string | null): StoredPhone {
  const raw = (value ?? '').trim();
  if (!raw) return { kind: 'empty' };
  if (raw.startsWith('+')) {
    const p = parsePhoneNumberFromString(raw);
    if (p && p.isValid() && p.country) return { kind: 'parsed', country: p.country, national: p.formatNational(), e164: p.number };
  }
  return { kind: 'unrecognised', raw };
}

export type BuildResult = { ok: true; value: string; country?: CountryCode; national?: string } | { ok: false; error: string };

/**
 * Validates `national` for `country` and returns the E.164 value. Empty input is valid (the field is
 * optional). A number typed or pasted with a "+" is read as international, which may change the country.
 */
export function buildPhone(country: CountryCode | '', national: string): BuildResult {
  const text = national.trim();
  if (!text) return { ok: true, value: '' };
  const intl = text.startsWith('+');
  if (!country && !intl) return { ok: false, error: 'Choose a country for this number.' };
  const p = parsePhoneNumberFromString(text, country || undefined);
  if (!p || !p.isValid()) {
    const name = country && !intl ? countryByCode(country)?.name : undefined;
    return { ok: false, error: name ? `Enter a valid ${name} phone number.` : 'Enter a valid phone number, including the country code.' };
  }
  return { ok: true, value: p.number, country: p.country, national: p.formatNational() };
}

/** Best-effort default country for an empty field, from the browser language region (never used for existing numbers). */
export function localeCountry(): CountryCode | '' {
  const lang = typeof navigator !== 'undefined' ? navigator.language : '';
  const region = /[-_]([A-Za-z]{2})\b/.exec(lang)?.[1]?.toUpperCase();
  return region && countryByCode(region) ? (region as CountryCode) : '';
}
