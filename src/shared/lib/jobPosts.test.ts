import { beforeEach, describe, expect, it } from 'vitest';
import { jobPosts, tailorFromMatch } from './jobPosts';

beforeEach(() => sessionStorage.clear());

describe('jobPosts', () => {
  it('remembers the post per match for this tab and adds it to a match tailoring request', () => {
    jobPosts.remember('m1', '  We need Python.  ');
    expect(jobPosts.get('m1')).toBe('We need Python.');
    expect(tailorFromMatch({ matchId: 'm1', fresh: true })).toEqual({ matchId: 'm1', fresh: true, jobDescription: 'We need Python.' });
    // Without a remembered post the request is unchanged, so the backend falls back to the match report alone.
    expect(tailorFromMatch({ matchId: 'other' })).toEqual({ matchId: 'other' });
  });

  it('keeps only the most recent posts and survives unusable storage', () => {
    for (let i = 0; i < 12; i += 1) jobPosts.remember(`m${i}`, `post ${i}`);
    expect(jobPosts.get('m0')).toBeUndefined();
    expect(jobPosts.get('m11')).toBe('post 11');
    sessionStorage.setItem('flowjob.jobPosts', 'not json');
    expect(jobPosts.get('m11')).toBeUndefined();
    jobPosts.remember('m20', 'fresh');
    expect(jobPosts.get('m20')).toBe('fresh');
    jobPosts.clear();
    expect(jobPosts.get('m20')).toBeUndefined();
  });
});
