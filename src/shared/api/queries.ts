// TanStack Query hooks for every resource. Screens only talk to the API through these.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob } from './client';
import type {
  Application,
  ApplicationInput,
  Cv,
  GmailConnection,
  MatchResult,
  RunMatchInput,
  Profile,
  SyncResult,
  TailorDirectInput,
  TailorDraft,
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
    mutationFn: (cv: Partial<Cv> & { tailorDraftId?: string }) => api<Cv>('/cvs', { method: 'POST', json: cv }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.cvs }),
  });
}
export function useUpdateCv() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...cv }: Partial<Cv> & { id: string }) =>
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
export const fetchCvPreviewPdf = (content: unknown, signal?: AbortSignal, tailorDraftId?: string) =>
  apiBlob('/cvs/preview/pdf', { method: 'POST', json: { content, tailorDraftId }, signal });

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
  useQuery({ queryKey: qk.matches, queryFn: () => api<MatchResult[]>('/matches') });
export const useMatch = (id?: string) =>
  useQuery({
    queryKey: qk.match(id ?? ''),
    queryFn: () => api<MatchResult>(`/matches/${id}`),
    enabled: !!id,
  });
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
export function useTailor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) => api<TailorDraft>('/tailor', { method: 'POST', json: { matchId } }),
    onSuccess: (draft) => qc.setQueryData(qk.tailorDraft(draft.id), draft),
  });
}

/**
 * Direct tailoring: a CV + job details, no match record. Same endpoint and quota as the
 * match-linked path; the backend reuses an identical cached draft without a new AI call.
 * (`jobUrl` is not part of the tailoring contract, so it is intentionally not sent.)
 */
export function useTailorDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: TailorDirectInput) => api<TailorDraft>('/tailor', { method: 'POST', json: b }),
    // Seed the draft query so the review route doesn't need a second request.
    onSuccess: (d) => qc.setQueryData(qk.tailorDraft(d.id), d),
  });
}
/** Reads a saved draft (GET only — never starts AI work); makes /app/tailor/:draftId refresh-safe. */
export const useTailorDraft = (id?: string) =>
  useQuery({
    queryKey: qk.tailorDraft(id ?? ''),
    queryFn: () => api<TailorDraft>(`/tailor/${id}`),
    enabled: !!id,
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
  useAppMutation(({ id, ...b }: Partial<ApplicationInput> & { id: string }) =>
    api<Application>(`/applications/${id}`, { method: 'PATCH', json: b }),
  );
export const useDeleteApplication = () =>
  useAppMutation((id: string) => api<void>(`/applications/${id}`, { method: 'DELETE' }));
export const useReviewSuggestion = () =>
  useAppMutation(({ id, action }: { id: string; action: 'confirm' | 'reject' }) =>
    api<Application>(`/applications/${id}/suggestion/${action}`, { method: 'POST' }),
  );
export const useUndoEvent = () =>
  useAppMutation(({ id, eventId }: { id: string; eventId: string }) =>
    api<Application>(`/applications/${id}/history/${eventId}/undo`, { method: 'POST' }),
  );

// Gmail
export const useGmail = () => useQuery({ queryKey: qk.gmail, queryFn: () => api<GmailConnection>('/gmail') });
function useGmailMutation<V>(fn: (v: V) => Promise<GmailConnection>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (g) => qc.setQueryData(qk.gmail, g) });
}
export const useConnectGmail = () =>
  useGmailMutation(() => api<GmailConnection>('/gmail/connect', { method: 'POST' }));
export const useDisconnectGmail = () =>
  useGmailMutation(() => api<GmailConnection>('/gmail/disconnect', { method: 'POST' }));
export const useSetAutoSync = () =>
  useGmailMutation((autoSync: boolean) =>
    api<GmailConnection>('/gmail', { method: 'PATCH', json: { autoSync } }),
  );
export function useSyncGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SyncResult>('/gmail/sync', { method: 'POST' }),
    onSuccess: (r) => {
      qc.setQueryData(qk.gmail, r.connection);
      qc.invalidateQueries({ queryKey: qk.apps });
    },
  });
}

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
export const useDeleteAccount = () =>
  useMutation({ mutationFn: () => api<void>('/me', { method: 'DELETE' }) });
export const exportData = () => api<unknown>('/me/export');
