import { api, ApiError } from './client';
import type { TailorDirectInput, TailorDraft, TailorMatchInput } from './types';

export const TAILORING_BACKEND_INCOMPATIBLE =
  'The running backend does not support verified tailoring drafts. Update or restart it before trying again.';

function hasDraftContent(draft: TailorDraft | null | undefined): draft is TailorDraft {
  return typeof draft?.id === 'string' && !!draft.id
    && typeof draft.sourceCvId === 'string' && !!draft.sourceCvId
    && typeof draft.jobTitle === 'string' && typeof draft.company === 'string'
    && Array.isArray(draft.suggestions)
    && draft.suggestions.every((item) => typeof item?.id === 'string'
      && typeof item.original === 'string' && typeof item.suggested === 'string');
}

export async function fetchTailorDraft(id: string, signal: AbortSignal): Promise<TailorDraft> {
  const draft = await api<TailorDraft>(`/tailor/${encodeURIComponent(id)}`, { signal });
  if (!hasDraftContent(draft) || draft.id !== id) {
    throw new ApiError(502, { message: 'The backend did not return the requested tailoring draft.' });
  }
  return draft;
}

export async function requestTailorDraft(input: TailorDirectInput | TailorMatchInput): Promise<TailorDraft> {
  // Fail before POST so an older backend cannot generate a draft this client cannot use.
  const capabilities = await api<{ sourceVerification?: number }>('/tailor/capabilities').catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) {
      throw new ApiError(503, { message: TAILORING_BACKEND_INCOMPATIBLE });
    }
    throw error;
  });
  if (capabilities?.sourceVerification !== 1) {
    throw new ApiError(503, { message: TAILORING_BACKEND_INCOMPATIBLE });
  }

  const draft = await api<TailorDraft>('/tailor', { method: 'POST', json: input });
  if (!hasDraftContent(draft) || typeof draft.sourceCvRevision !== 'string' || !draft.sourceCvRevision.trim()
    || (input.cvId && draft.sourceCvId !== input.cvId)
    || ('matchId' in input ? draft.matchId !== input.matchId : draft.matchId != null)) {
    throw new ApiError(502, { message: 'Tailoring did not return a verified draft for this CV. Please try again after checking the backend.' });
  }
  return draft;
}
