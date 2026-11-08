import { countries, countryByCode, type CountryCode } from './phone';

export interface LocationParts {
  city: string;
  country: CountryCode | '';
}

const countryCode = (name: string): LocationParts['country'] =>
  countries().find((country) => country.name.toLowerCase() === name.trim().toLowerCase())?.code ?? '';

/** Only split on a suffix that is a full country name. Keep unknown legacy text together. */
export function parseLocation(value: string): LocationParts {
  if (!value.trim()) return { city: '', country: '' };
  const separator = Math.max(value.lastIndexOf(','), value.lastIndexOf('/'));
  if (separator >= 0) {
    const city = value.slice(0, separator).trim();
    const country = countryCode(value.slice(separator + 1));
    if (city && country) return { city, country };
    return { city: value, country: '' };
  }
  const country = countryCode(value);
  return { city: country ? '' : value, country };
}

export function formatLocation({ city, country }: LocationParts): string {
  return [city.trim(), countryByCode(country)?.name].filter(Boolean).join(', ');
}
