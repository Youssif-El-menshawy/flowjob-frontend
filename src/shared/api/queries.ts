// TanStack Query hooks for every resource. Screens only talk to the API through these.
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob } from './client';
import { fetchTailorDraft, requestTailorDraft } from './tailoring';
import type {
  Application,
  ApplicationInput,
  ApplicationPatch,
  Cv,
  CvContentInput,
  CvWriteInput,
  GmailReview,
  GmailStatus,
  MatchResult,
  RunMatchInput,
  Profile,
  ReviewEdits,
  TailorDirectInput,
  TailorMatchInput,
  User,
} from './types';

export const qk = {
  profile: ['profile'] as const,
  cvs: ['cvs'] as const,
  cv: (id: string) => ['cvs', id] as const,
  matches: ['matches'] as const,
  match: (id: string) => ['matches', id] as const,
  tailorDraft: (id: string) => ['tailor', id] as const,
  apps: ['applications'] as const,
  app: (id: string) => ['applications', id] as const,
  gmail: ['gmail'] as const,
  gmailReviews: ['gmail', 'reviews'] as const,
};

// Profile
export const useProfile = () => useQuery({ queryKey: qk.profile, queryFn: () => api<Profile>('/profile') });
export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: Profile) => api<Profile>('/profile', { method: 'PUT', json: p }),
    onSuccess: (p) => qc.setQueryData(qk.profile, p),
  });
}

// CVs
export const useCvs = () => useQuery({ queryKey: qk.cvs, queryFn: () => api<Cv[]>('/cvs') });
export const useCv = (id?: string) =>
  useQuery({
    queryKey: qk.cv(id ?? ''),
    queryFn: ({ signal }) => api<Cv>(`/cvs/${id}`, { signal }),
    enabled: !!id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
export function useCreateCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cv: CvWriteInput & { tailorDraftId?: string }) => api<Cv>('/cvs', { method: 'POST', json: cv }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cvs }),
  });
}
export function useUpdateCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...cv }: CvWriteInput & { id: string }) =>
      api<Cv>(`/cvs/${id}`, { method: 'PUT', json: cv }),
    onSuccess: (cv) => {
      qc.setQueryData(qk.cv(cv.id), cv);
      // Update the cached list synchronously too, so re-opening this CV right away (e.g. switching
      // back to it in the builder) can never show its pre-save content while the refetch is in flight.
      qc.setQueryData<Cv[]>(qk.cvs, (old) => old?.map((x) => (x.id === cv.id ? cv : x)));
      qc.invalidateQueries({ queryKey: qk.cvs });
    },
  });
}
/** Fetch the backend-rendered Harvard PDF for a saved CV (same document for preview and download). */
export const fetchCvPdfBlob = (id: string, signal?: AbortSignal) =>
  apiBlob(`/cvs/${id}/pdf`, { signal });

/** Render unsaved CV content to a Harvard PDF for the live builder preview (no DB write). */
export const fetchCvPreviewPdf = (content: CvContentInput, signal?: AbortSignal, tailorDraftId?: string, cvId?: string) =>
  apiBlob('/cvs/preview/pdf', { method: 'POST', json: { content, tailorDraftId, cvId }, signal });

export function useDeleteCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/cvs/${id}`, { method: 'DELETE' }),
    onSuccess: (_, id) => {
      qc.setQueryData<Cv[]>(qk.cvs, (old) => old?.filter((cv) => cv.id !== id));
      qc.invalidateQueries({ queryKey: qk.cvs });
      qc.invalidateQueries({ queryKey: qk.apps });
    },
  });
}

// Matching + tailoring
export const useMatches = () =>
  useQuery({ queryKey: qk.matches, queryFn: ({ signal }) => api<MatchResult[]>('/matches', { signal }) });
export const useMatch = (id?: string) =>
  useQuery({
    queryKey: qk.match(id ?? ''),
    queryFn: ({ signal }) => api<MatchResult>(`/matches/${id}`, { signal }),
    enabled: !!id,
  });
export function useDeleteMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/matches/${id}`, { method: 'DELETE' }),
    onSuccess: async (_, id) => {
      const list = { queryKey: qk.matches, exact: true };
      const report = { queryKey: qk.match(id), exact: true };
      // A fetch started before deletion must not restore the removed report.
      await Promise.all([qc.cancelQueries(list), qc.cancelQueries(report)]);
      qc.setQueryData<MatchResult[]>(qk.matches, (old) => old?.filter((match) => match.id !== id));
      qc.removeQueries(report);
      void qc.invalidateQueries(list);
    },
  });
}
export function useRunMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: RunMatchInput) => api<MatchResult>('/matches', { method: 'POST', json: b }),
    onSuccess: (m) => {
      qc.setQueryData(qk.match(m.id), m);
      qc.invalidateQueries({ queryKey: qk.matches });
    },
  });
}
function useTailorMutation<Input extends TailorMatchInput | TailorDirectInput>() {
  const qc = useQueryClient();
  const pending = useRef(false);
  const mutation = useMutation({
    mutationFn: (input: Input) => requestTailorDraft(input),
    retry: false,
    onSuccess: (draft) => qc.setQueryData(qk.tailorDraft(draft.id), draft),
    onSettled: () => { pending.current = false; },
  });
  const mutate: typeof mutation.mutate = (...args) => {
    // Lock immediately, before React has rendered the pending button state.
    if (pending.current || mutation.isPending) return;
    pending.current = true;
    mutation.mutate(...args);
  };
  return { mutate, isPending: mutation.isPending, isError: mutation.isError, error: mutation.error };
}

export const useTailor = () => useTailorMutation<TailorMatchInput>();
export const useTailorDirect = () => useTailorMutation<TailorDirectInput>();

/** Opening a draft only reads it. Recheck cached drafts on entry in case they were removed. */
export const useTailorDraft = (id: string) =>
  useQuery({
    queryKey: qk.tailorDraft(id),
    queryFn: ({ signal }) => fetchTailorDraft(id, signal),
    refetchOnMount: 'always',
    retry: false,
  });

// Applications
export const useApplications = () =>
  useQuery({ queryKey: qk.apps, queryFn: () => api<Application[]>('/applications') });
export const useApplication = (id?: string) =>
  useQuery({
    queryKey: qk.app(id ?? ''),
    queryFn: () => api<Application>(`/applications/${id}`),
    enabled: !!id,
  });

function useAppMutation<V>(fn: (v: V) => Promise<Application | void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (a) => {
      if (a) qc.setQueryData(qk.app(a.id), a);
      qc.invalidateQueries({ queryKey: qk.apps });
    },
  });
}
export const useCreateApplication = () =>
  useAppMutation((b: ApplicationInput) => api<Application>('/applications', { method: 'POST', json: b }));
export const useUpdateApplication = () =>
  useAppMutation(({ id, ...b }: ApplicationPatch & { id: string }) =>
    api<Application>(`/applications/${id}`, { method: 'PATCH', json: b }),
  );
export const useDeleteApplication = () =>
  useAppMutation((id: string) => api<void>(`/applications/${id}`, { method: 'DELETE' }));
// Gmail (connection, sync, Needs Review, recruitment activity)
function useRefreshGmailData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.gmail });
    void qc.invalidateQueries({ queryKey: qk.apps });
  };
}

/** Polls only while a sync is running. */
export const useGmail = (enabled = true) =>
  useQuery({
    queryKey: qk.gmail,
    queryFn: ({ signal }) => api<GmailStatus>('/gmail', { signal }),
    enabled,
    refetchInterval: (q) => (q.state.data?.sync?.running ? 2500 : false),
  });

export const useGmailReviews = (enabled: boolean) =>
  useQuery({
    queryKey: qk.gmailReviews,
    queryFn: ({ signal }) => api<GmailReview[]>('/gmail/reviews', { signal }),
    enabled,
  });

export const useStartGmailOAuth = () =>
  useMutation({
    mutationFn: (mode: 'connect' | 'reconnect') => {
      let timezone: string | undefined;
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        timezone = undefined; // the server falls back to UTC
      }
      return api<{ authorizationUrl: string }>('/gmail/oauth/start', {
        method: 'POST',
        json: { mode, timezone },
      });
    },
  });

export function useSyncGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (retryFailed: boolean) =>
      api<GmailStatus>('/gmail/sync', { method: 'POST', json: { retryFailed } }),
    onSuccess: (status) => qc.setQueryData(qk.gmail, status),
  });
}

export function useDisconnectGmail() {
  const refresh = useRefreshGmailData();
  return useMutation({
    mutationFn: () => api<void>('/gmail', { method: 'DELETE' }),
    // Also after a failure: an interrupted disconnect is then shown as "disconnecting" with a retry.
    onSettled: refresh,
  });
}

export function useApproveReview() {
  const refresh = useRefreshGmailData();
  return useMutation({
    mutationFn: ({ id, edits }: { id: string; edits?: ReviewEdits }) =>
      api<{ review: string; applicationId?: string }>(`/gmail/reviews/${id}/approve`, {
        method: 'POST',
        json: edits ?? {},
      }),
    onSettled: refresh,
  });
}

export function useDismissReview() {
  const refresh = useRefreshGmailData();
  return useMutation({
    mutationFn: (id: string) => api<{ review: string }>(`/gmail/reviews/${id}/dismiss`, { method: 'POST' }),
    onSettled: refresh,
  });
}

function useActivityMutation<V>(fn: (v: V) => Promise<Application>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (a) => {
      qc.setQueryData(qk.app(a.id), a);
      void qc.invalidateQueries({ queryKey: qk.apps });
      void qc.invalidateQueries({ queryKey: qk.gmail });
    },
  });
}
export const useCorrectActivity = () =>
  useActivityMutation(
    ({ appId, eventId, ...b }: { appId: string; eventId: string; eventType?: string; scheduledAt?: string | null }) =>
      api<Application>(`/applications/${appId}/activity/${eventId}`, { method: 'PATCH', json: b }),
  );
export const useDismissActivity = () =>
  useActivityMutation(({ appId, eventId }: { appId: string; eventId: string }) =>
    api<Application>(`/applications/${appId}/activity/${eventId}/dismiss`, { method: 'POST' }),
  );

// Account
export const useUpdateMe = () =>
  useMutation({
    mutationFn: (b: { name?: string; email?: string; currentPassword?: string }) => api<User>('/me', { method: 'PATCH', json: b }),
  });
export const useChangePassword = () =>
  useMutation({
    mutationFn: (b: { current: string; next: string }) =>
      api<void>('/me/password', { method: 'POST', json: b }),
  });
