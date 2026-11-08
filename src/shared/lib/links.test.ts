import { describe, expect, it } from 'vitest';
import { joinLinks, linkKind, normalizeHttpsUrl, splitLinks } from './links';

describe('normalizeHttpsUrl', () => {
  it('adds a missing https://, upgrades http://, trims, and keeps paths', () => {
    expect(normalizeHttpsUrl('linkedin.com/in/jane', 'linkedin')).toEqual({ ok: true, value: 'https://linkedin.com/in/jane' });
    expect(normalizeHttpsUrl('  www.github.com/jane  ', 'github')).toEqual({ ok: true, value: 'https://www.github.com/jane' });
    expect(normalizeHttpsUrl('http://github.com/jane', 'github')).toEqual({ ok: true, value: 'https://github.com/jane' });
    expect(normalizeHttpsUrl('https://github.com/', 'github')).toEqual({ ok: true, value: 'https://github.com' });
    expect(normalizeHttpsUrl('uk.linkedin.com/in/jane', 'linkedin')).toMatchObject({ ok: true });
  });
  it('treats empty as valid (optional)', () => {
    expect(normalizeHttpsUrl('   ', 'github')).toEqual({ ok: true, value: '' });
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'mailto:a@b.com',
    'ftp://github.com/x',
    'github.com/a b',
    'https://user:pw@github.com/x',
    'github',
    'not a url',
  ])('rejects unsafe or malformed input: %s', (v) => {
    expect(normalizeHttpsUrl(v, 'github').ok).toBe(false);
  });
  it('requires the host to match the field', () => {
    expect(normalizeHttpsUrl('github.com/jane', 'linkedin').ok).toBe(false);
    expect(normalizeHttpsUrl('https://github.com.evil.io/x', 'github').ok).toBe(false);
    expect(normalizeHttpsUrl('https://evil.com/github.com', 'github').ok).toBe(false);
  });
  it('without a kind, accepts any safe web link', () => {
    expect(normalizeHttpsUrl('janedoe.dev')).toEqual({ ok: true, value: 'https://janedoe.dev' });
  });
});

describe('splitLinks / joinLinks', () => {
  it('classifies by real hostname and keeps every other link in order', () => {
    const s = splitLinks(['https://janedoe.dev', 'github.com/jane', 'linkedin.com/in/jane', 'https://example.com/x', 'portfolio']);
    expect(s).toEqual({
      linkedin: 'linkedin.com/in/jane',
      github: 'github.com/jane',
      others: ['https://janedoe.dev', 'https://example.com/x', 'portfolio'],
    });
  });
  it('a second LinkedIn/GitHub link is not lost', () => {
    const s = splitLinks(['linkedin.com/in/a', 'linkedin.com/company/b']);
    expect(s.others).toEqual(['linkedin.com/company/b']);
  });
  it('does not mistake look-alike hosts for LinkedIn/GitHub', () => {
    expect(linkKind('https://github.com.evil.io')).toBeNull();
    expect(linkKind('https://notlinkedin.com')).toBeNull();
    expect(linkKind('javascript:github.com')).toBeNull();
  });
  it('joinLinks puts LinkedIn, GitHub, then the rest, skipping empties', () => {
    expect(joinLinks(' ', 'https://github.com/j', ['x.dev'])).toEqual(['https://github.com/j', 'x.dev']);
  });
});
