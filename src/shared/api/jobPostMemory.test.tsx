import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { jobPosts } from '@/shared/lib/jobPosts';
import { api } from './client';
import { useRunMatch, useTailor, useTailorDirect } from './queries';

// The job post is kept in this tab by the request hooks themselves, so it is remembered even when the page that
// started the request has been left (React Query runs a mutation's own onSuccess after the component is gone).
vi.mock('./client', async (original) => ({ ...await original<typeof import('./client')>(), api: vi.fn() }));

const POST = 'Synthetic post: we need Python, REST APIs and MongoDB for a backend role.';
const draft = (o: Record<string, unknown> = {}) => ({
  id: 'd7', sourceCvId: 'cv1', sourceCvRevision: 'rev', jobTitle: 'Backend Engineer', company: 'Acme', suggestions: [], ...o,
});

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});
afterEach(() => vi.resetAllMocks());

describe('remembering the job post where the request completes', () => {
  it('keeps a match post even when the page was left before the match finished', async () => {
    let finish!: (m: unknown) => void;
    vi.mocked(api).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const hook = renderHook(() => useRunMatch(), { wrapper });
    act(() => hook.result.current.mutate({ cvId: 'cv1', jobTitle: 'Backend Engineer', jobDescription: POST }));
    hook.unmount(); // the person navigated away while the match was still running
    await act(async () => finish({ id: 'm7' }));
    await waitFor(() => expect(jobPosts.get('m7')).toBe(POST));
  });

  it('keeps the exact post a direct draft was made from', async () => {
    vi.mocked(api).mockResolvedValueOnce({ sourceVerification: 1 }).mockResolvedValueOnce(draft({ matchId: null }));
    const hook = renderHook(() => useTailorDirect(), { wrapper });
    act(() => hook.result.current.mutate({ cvId: 'cv1', jobTitle: 'Backend Engineer', jobDescription: POST }));
    await waitFor(() => expect(jobPosts.forDraft({ id: 'd7', matchId: null })).toBe(POST));
  });

  it('keeps the post sent with a draft from a match, so the draft still has it if the match entry is dropped', async () => {
    vi.mocked(api).mockResolvedValueOnce({ sourceVerification: 1 }).mockResolvedValueOnce(draft({ matchId: 'm1' }));
    const hook = renderHook(() => useTailor(), { wrapper });
    act(() => hook.result.current.mutate({ matchId: 'm1', jobDescription: POST }));
    await waitFor(() => expect(jobPosts.forDraft({ id: 'd7', matchId: 'm1' })).toBe(POST));
    expect(jobPosts.get('m1')).toBeUndefined(); // nothing is attributed to the match that was not sent with it
  });

  it('keeps nothing for a draft made without a post', async () => {
    vi.mocked(api).mockResolvedValueOnce({ sourceVerification: 1 }).mockResolvedValueOnce(draft({ matchId: 'm1' }));
    const hook = renderHook(() => useTailor(), { wrapper });
    act(() => hook.result.current.mutate({ matchId: 'm1' }));
    await waitFor(() => expect(hook.result.current.isPending).toBe(false));
    expect(jobPosts.forDraft({ id: 'd7', matchId: 'm1' })).toBeUndefined();
    expect(sessionStorage.getItem('flowjob.jobPosts')).toBeNull();
  });
});
