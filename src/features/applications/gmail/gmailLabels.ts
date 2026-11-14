import type { ActivityType, GmailReview } from '@/shared/api/types';

export const ACTIVITY_LABEL: Record<ActivityType | 'other', string> = {
  application_confirmation: 'Application confirmed',
  application_update: 'Application update',
  assessment: 'Assessment',
  recruiter_follow_up: 'Recruiter follow-up',
  interview_invitation: 'Interview invitation',
  interview_rescheduled: 'Interview rescheduled',
  deadline_extension: 'Deadline extended',
  offer: 'Offer',
  rejection: 'Rejection',
  withdrawal_confirmation: 'Withdrawal confirmed',
  other: 'Recruitment email',
};

export const activityLabel = (t?: string | null) =>
  ACTIVITY_LABEL[(t ?? 'other') as ActivityType] ?? ACTIVITY_LABEL.other;

/** Deadline-like events show their date as a deadline; the others as a scheduled time. */
export const isDeadline = (t?: string | null) => t === 'assessment' || t === 'deadline_extension';

const REASON: Record<string, string> = {
  uncertain: 'The email did not clearly show that you applied.',
  weak_evidence: 'The email did not clearly show that you applied.',
  missing_details: 'The employer or job title was unclear.',
  contradictory: 'The email contained conflicting details.',
  possible_reapplication: 'This may be a new application to a role you applied to before.',
  previously_deleted: 'You deleted a similar application earlier.',
  ambiguous_match: 'It could belong to more than one of your applications.',
};

export const reviewReason = (r: GmailReview) => REASON[r.proposal.reason ?? ''] ?? null;

const CALLBACK_ERRORS: Record<string, string> = {
  denied: 'Google access was not granted.',
  scope_missing: 'Gmail read access was not granted. Connect again and allow it.',
  account_in_use: 'That Google account is already connected to another FlowJob account.',
  different_account: 'Reconnect with the same Google account, or disconnect Gmail first.',
  already_connected: 'Gmail is already connected.',
  no_refresh_token: 'Google did not grant lasting access. Remove FlowJob in your Google account settings and connect again.',
  invalid_state: 'The Google sign-in expired or was started elsewhere. Try connecting again.',
  invalid_identity: 'Google sign-in could not be verified. Try again.',
  exchange_failed: 'Could not finish connecting Gmail. Try again.',
  disconnect_in_progress: 'Gmail is being disconnected. Try again in a moment.',
  not_configured: 'Gmail is not configured on this server.',
};

export const oauthErrorMessage = (code?: string | null) =>
  CALLBACK_ERRORS[code ?? ''] ?? 'Could not connect Gmail. Try again.';

/**
 * Only Gmail web links built by the backend are rendered. Anything else (including links that came from email
 * content or a model) is ignored.
 */
export function safeGmailUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'mail.google.com') return null;
    if (!parsed.pathname.startsWith('/mail/')) return null;
    if (!/^#all\/[0-9a-f]{8,32}$/.test(parsed.hash)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Value for <input type="datetime-local"> in the browser's zone. */
export function toLocalInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A datetime-local value as an ISO string with the browser's offset (the backend requires an offset). */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${value.length === 16 ? `${value}:00` : value}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}
