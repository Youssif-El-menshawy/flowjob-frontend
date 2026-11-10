import { z } from 'zod';

const invalidUnicode = /[\uD800-\uDFFF]/u;
// C0/C1 ranges and unpaired surrogates are disallowed for new passwords only.
// eslint-disable-next-line no-control-regex
const invalidNewPassword = /[\u0000-\u001F\u007F-\u009F\uD800-\uDFFF]/u;

export const loginPassword = z.string()
  .min(1, 'Please enter your password.')
  .refine((password) => [...password].length <= 1024, 'Use at most 1024 characters.')
  .refine((password) => !invalidUnicode.test(password), 'Use valid Unicode characters.');

export const newPassword = z.string()
  .refine((password) => [...password].length >= 8, 'Use at least 8 characters.')
  .refine((password) => [...password].length <= 256, 'Use at most 256 characters.')
  .refine((password) => !invalidNewPassword.test(password), 'Passwords cannot contain control characters or invalid Unicode.');
