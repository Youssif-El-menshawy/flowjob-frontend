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
    for (let i = 0; i < 25; i += 1) jobPosts.remember(`m${i}`, `post ${i}`);
    expect(jobPosts.get('m4')).toBeUndefined();
    expect(jobPosts.get('m5')).toBe('post 5'); // the 20 most recent are kept
    expect(jobPosts.get('m24')).toBe('post 24');
    sessionStorage.setItem('flowjob.jobPosts', 'not json');
    expect(jobPosts.get('m24')).toBeUndefined();
    jobPosts.remember('m20', 'fresh');
    expect(jobPosts.get('m20')).toBe('fresh');
    jobPosts.clear();
    expect(jobPosts.get('m20')).toBeUndefined();
  });
});

describe('jobPosts.forDraft', () => {
  it('returns only the post the draft was really made from', () => {
    jobPosts.clear();
    jobPosts.remember('m1', 'Post for the match.');
    jobPosts.rememberDraft('d9', 'Post pasted for the draft.');
    expect(jobPosts.forDraft({ id: 'd1', matchId: 'm1' })).toBe('Post for the match.');
    expect(jobPosts.forDraft({ id: 'd9', matchId: null })).toBe('Post pasted for the draft.');
    // A draft's own post (exactly what was sent when it was made) when its match's entry is not here.
    expect(jobPosts.forDraft({ id: 'd9', matchId: 'm-gone' })).toBe('Post pasted for the draft.');
    // Never substituted from another match or draft.
    expect(jobPosts.forDraft({ id: 'd-other', matchId: 'm-gone' })).toBeUndefined();
    expect(jobPosts.forDraft({ id: 'd-other' })).toBeUndefined();
    jobPosts.clear();
  });

  it('drops the least recently used post, not one that was just used again', () => {
    jobPosts.remember('active', 'The post in use.');
    for (let i = 0; i < 18; i += 1) jobPosts.remember(`m${i}`, `post ${i}`);
    jobPosts.remember('active', 'The post in use.'); // used again (for example by a re-check)
    jobPosts.remember('m18', 'post 18');
    jobPosts.remember('m19', 'post 19');
    expect(jobPosts.get('active')).toBe('The post in use.');
    expect(jobPosts.get('m0')).toBeUndefined();
  });
});
