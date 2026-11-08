import { describe, expect, it } from 'vitest';
import { formatLocation, parseLocation, type LocationParts } from './location';

describe('stored location', () => {
  it.each<[string, LocationParts]>([
    ['Berlin, Germany', { city: 'Berlin', country: 'DE' }],
    ['Wroclaw/Poland', { city: 'Wroclaw', country: 'PL' }],
    ['Washington, DC, United States', { city: 'Washington, DC', country: 'US' }],
    ['Wrocław', { city: 'Wrocław', country: '' }],
    ['Poland', { city: '', country: 'PL' }],
    ['  London, ON  ', { city: '  London, ON  ', country: '' }],
    ['East/West', { city: 'East/West', country: '' }],
    ['Paris, FR', { city: 'Paris, FR', country: '' }],
    ['', { city: '', country: '' }],
  ])('reads %j without guessing country codes', (value, expected) => {
    expect(parseLocation(value)).toEqual(expected);
  });

  it.each<[LocationParts, string]>([
    [{ city: ' Wrocław ', country: 'PL' }, 'Wrocław, Poland'],
    [{ city: 'New York', country: '' }, 'New York'],
    [{ city: '', country: 'PL' }, 'Poland'],
    [{ city: '   ', country: '' }, ''],
  ])('formats %j without stray separators', (parts, expected) => {
    expect(formatLocation(parts)).toBe(expected);
  });
});
