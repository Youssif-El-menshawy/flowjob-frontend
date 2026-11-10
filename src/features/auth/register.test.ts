import { registerSchema } from './RegisterPage';
import { passwordScore } from './AuthShell';
import { applicationSchema } from '@/features/applications/ApplicationForm';

describe('register form', () => {
  it('rejects a short password and missing terms', () => {
    const r = registerSchema.safeParse({
      name: 'Sara',
      email: 'sara@mail.com',
      password: 'short',
      terms: false,
    });
    expect(r.success).toBe(false);
  });
  it('accepts valid input', () => {
    expect(
      registerSchema.safeParse({
        name: 'Sara Nowak',
        email: 'sara@mail.com',
        password: 'flowjob123',
        terms: true,
      }).success,
    ).toBe(true);
  });
  it('scores password strength', () => {
    expect(passwordScore('abc')).toBe(0);
    expect(passwordScore('flowjob123')).toBe(2);
    expect(passwordScore('Flowjob-2026!')).toBe(4);
  });
});

describe('application form', () => {
  it('needs company, title and a past date', () => {
    expect(
      applicationSchema.safeParse({
        company: '',
        jobTitle: 'Dev',
        dateApplied: '2026-10-01',
        status: 'Applied',
      }).success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({
        company: 'Allegro',
        jobTitle: 'Dev',
        dateApplied: '2999-01-01',
        status: 'Applied',
      }).success,
    ).toBe(false);
    expect(
      applicationSchema.safeParse({
        company: 'Allegro',
        jobTitle: 'Dev',
        dateApplied: '2026-10-01',
        status: 'Applied',
      }).success,
    ).toBe(true);
  });
});

describe('registration password bounds', () => {
  const parse = (password: string) => registerSchema.safeParse({
    name: 'Synthetic User', email: 'fixture@example.com', password, terms: true,
  }).success;

  it('uses Unicode code points and preserves ordinary passphrases', () => {
    expect(parse('🙂'.repeat(7))).toBe(false);
    expect(parse('🙂'.repeat(8))).toBe(true);
    expect(parse('🙂'.repeat(256))).toBe(true);
    expect(parse('🙂'.repeat(257))).toBe(false);
    expect(parse(' a phrase with spaces ')).toBe(true);
    expect(parse('unsafe\npassphrase')).toBe(false);
  });
});
