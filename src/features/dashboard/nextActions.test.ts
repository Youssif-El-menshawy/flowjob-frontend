import { describe, expect, it } from 'vitest';
import type { ActivityEvent, Application } from '@/shared/api/types';
import { buildNextActions, whenChip } from './nextActions';

const NOW = new Date('2026-11-15T10:00:00');

const app = (over: Partial<Application> = {}): Application =>
  ({
    id: 'a1', company: 'Acme', jobTitle: 'Engineer', status: 'Applied', updatedAt: '', history: [], suggestion: null,
    ...over,
  }) as Application;

const ev = (over: Partial<ActivityEvent>): ActivityEvent => ({
  id: Math.random().toString(36).slice(2), eventType: 'interview_invitation', occurredAt: '2026-11-01T00:00:00Z',
  corrected: false, ...over,
});

describe('buildNextActions', () => {
  it('is empty without evidence: a status alone is not an interview', () => {
    expect(buildNextActions([app({ status: 'Interview' })], { gmailConnected: true, now: NOW })).toEqual([]);
  });

  it('orders reviews, then upcoming dates (soonest first), then follow-ups', () => {
    const list = buildNextActions(
      [
        app({ id: 'f', followUpDate: '2026-11-16' }),
        app({ id: 'i', activity: [ev({ scheduledAt: '2026-11-20T14:00:00' }), ev({ eventType: 'assessment', scheduledAt: '2026-11-17T09:00:00' })] }),
        app({ id: 'r', suggestion: { id: 's', proposedStatus: 'Offer', receivedAt: '2026-11-14T00:00:00Z' } }),
      ],
      { gmailConnected: true, now: NOW },
    );
    expect(list.map((a) => `${a.kind}:${a.label}`)).toEqual([
      'review:Review Gmail update',
      'scheduled:Assessment due',
      'scheduled:Interview',
      'followUp:Follow up',
    ]);
  });

  it('drops a time that a later email moved, and counts repeated emails about one time once', () => {
    const list = buildNextActions(
      [
        app({
          activity: [
            ev({ scheduledAt: '2026-11-18T10:00:00' }),
            ev({ eventType: 'interview_rescheduled', scheduledAt: '2026-11-19T11:00:00', previousScheduledAt: '2026-11-18T10:00:00' }),
            ev({ eventType: 'recruiter_follow_up', scheduledAt: '2026-11-19T11:00:00' }),
          ],
        }),
      ],
      { gmailConnected: true, now: NOW },
    );
    expect(list).toHaveLength(1);
    expect(list[0].at).toBe('2026-11-19T11:00:00');
  });

  it('skips closed applications, past times, far-off follow-ups and suggestions while Gmail is disconnected', () => {
    const list = buildNextActions(
      [
        app({ status: 'Rejected', activity: [ev({ scheduledAt: '2026-11-18T10:00:00' })], followUpDate: '2026-11-16' }),
        app({ activity: [ev({ scheduledAt: '2026-11-14T10:00:00' })] }),
        app({ followUpDate: '2027-01-30' }),
        app({ suggestion: { id: 's', proposedStatus: 'Offer', receivedAt: '2026-11-14T00:00:00Z' } }),
      ],
      { gmailConnected: false, now: NOW },
    );
    expect(list).toEqual([]);
  });
});

describe('whenChip', () => {
  it('labels near dates and overdue follow-ups only', () => {
    expect(whenChip(0, 'scheduled')).toBe('Today');
    expect(whenChip(1, 'scheduled')).toBe('Tomorrow');
    expect(whenChip(4, 'followUp')).toBe('In 4 days');
    expect(whenChip(12, 'scheduled')).toBeNull();
    expect(whenChip(-3, 'followUp')).toBe('Overdue');
    expect(whenChip(-3, 'scheduled')).toBeNull();
  });
});
