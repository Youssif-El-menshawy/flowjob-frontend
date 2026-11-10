import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from './client';
import { fetchTailorDraft, requestTailorDraft, TAILORING_BACKEND_INCOMPATIBLE } from './tailoring';

vi.mock('./client', async (original) => ({
  ...await original<typeof import('./client')>(),
  api: vi.fn(),
}));

const input = { cvId: 'cv1', jobTitle: 'Product Quality Analyst', jobDescription: 'Synthetic job description' };
const verified = {
  id: 'draft1', sourceCvId: 'cv1', sourceCvRevision: 'source-hash', jobTitle: input.jobTitle, company: '', suggestions: [
    { id: 's1', section: 'experience', experienceId: 'e1', bulletIndex: 0, original: 'Tested APIs', suggested: 'Tested APIs.', reviewRequired: false },
  ],
};

afterEach(() => vi.resetAllMocks());

describe('requestTailorDraft', () => {
  it('preflights the API and returns the verified response for a new job', async () => {
    vi.mocked(api).mockResolvedValueOnce({ sourceVerification: 1 }).mockResolvedValueOnce(verified);
    await expect(requestTailorDraft(input)).resolves.toEqual(verified);
    expect(api).toHaveBeenNthCalledWith(1, '/tailor/capabilities');
    expect(api).toHaveBeenNthCalledWith(2, '/tailor', { method: 'POST', json: input });
  });

  it('never posts a generation request to a backend without the verification endpoint', async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(404, { message: 'Draft not found.' }));
    await expect(requestTailorDraft(input)).rejects.toMatchObject({
      status: 503, message: TAILORING_BACKEND_INCOMPATIBLE,
    });
    expect(api).toHaveBeenCalledExactlyOnceWith('/tailor/capabilities');
  });

  it.each([
    { ...verified, sourceCvRevision: undefined },
    { ...verified, sourceCvRevision: null },
    { ...verified, sourceCvId: 'wrong-cv' },
    { ...verified, matchId: 'unexpected-match' },
  ])('rejects an unverified or wrong-source generation response', async (draft) => {
    vi.mocked(api).mockResolvedValueOnce({ sourceVerification: 1 }).mockResolvedValueOnce(draft);
    await expect(requestTailorDraft(input)).rejects.toMatchObject({ status: 502 });
    expect(api).toHaveBeenCalledTimes(2);
  });
});


describe('fetchTailorDraft', () => {
  it('retrieves legacy drafts by ID without generating or checking generation capabilities', async () => {
    const legacy = { ...verified, sourceCvRevision: null };
    const signal = new AbortController().signal;
    vi.mocked(api).mockResolvedValueOnce(legacy);
    await expect(fetchTailorDraft('draft1', signal)).resolves.toEqual(legacy);
    expect(api).toHaveBeenCalledExactlyOnceWith('/tailor/draft1', { signal });
  });

  it.each([null, { ...verified, id: 'different-draft' }, { ...verified, suggestions: [null] }])(
    'rejects a missing, wrong-ID or malformed response',
    async (draft) => {
      vi.mocked(api).mockResolvedValueOnce(draft);
      await expect(fetchTailorDraft('draft1', new AbortController().signal)).rejects.toMatchObject({ status: 502 });
    },
  );
});
