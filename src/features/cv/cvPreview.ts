import type { CvContent } from '@/shared/api/types';

/**
 * Event-driven Harvard PDF preview engine (framework-agnostic so it can be unit-tested).
 *
 * The preview is regenerated only when explicitly requested (Update preview, or Next/Back
 * and Save when the content is stale) — never on keystrokes. A content *fingerprint* decides
 * staleness: it covers exactly the fields the backend Harvard renderer consumes and excludes
 * things that do not affect the PDF (item `id`s, the internal CV name, timestamps). Reverting
 * an edit restores the original fingerprint, so the preview is correctly considered up to date.
 */

/** Stable, value-based fingerprint of the PDF-relevant content (not reference equality). */
export function pdfFingerprint(content: CvContent): string {
  const c = content ?? ({} as CvContent);
  const shape = {
    fullName: c.fullName ?? '',
    email: c.email ?? '',
    phone: c.phone ?? '',
    location: c.location ?? '',
    links: c.links ?? [],
    summary: c.summary ?? '',
    // Order matters (it changes the PDF); `id` does not, so it is excluded.
    experience: (c.experience ?? []).map((e) => [
      e.title ?? '',
      e.company ?? '',
      e.location ?? '',
      e.start ?? '',
      e.end ?? '',
      e.bullets ?? [],
    ]),
    education: (c.education ?? []).map((e) => [
      e.school ?? '',
      e.degree ?? '',
      e.start ?? '',
      e.end ?? '',
      e.note ?? '',
    ]),
    projects: (c.projects ?? []).map((p) => [p.name ?? '', p.tech ?? '', p.description ?? '']),
    skills: c.skills ?? [],
    languages: c.languages ?? '',
  };
  return JSON.stringify(shape);
}

export type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface PreviewState {
  status: PreviewStatus;
  /** The last successfully generated PDF (kept visible while a newer one loads). */
  blob: Blob | null;
  /** Fingerprint of the content that produced `blob`; null until the first success. */
  renderedFingerprint: string | null;
  /** True when the most recent attempt failed (previous blob is retained). */
  error: boolean;
}

export type PreviewFetcher = (content: CvContent, signal: AbortSignal) => Promise<Blob>;

export interface PreviewEngine {
  /** Generate from `content`. No-op if it already matches the displayed PDF (unless force). */
  request(content: CvContent, opts?: { force?: boolean }): Promise<void>;
  /** Generate only if `content` differs from the displayed PDF. */
  requestIfStale(content: CvContent): Promise<void>;
  /** Whether `content` differs from the displayed PDF. */
  isStale(content: CvContent): boolean;
  getState(): PreviewState;
  /** Abort any in-flight request and release resources. */
  dispose(): void;
}

export function createPreviewEngine(
  fetcher: PreviewFetcher,
  onChange: (state: PreviewState) => void,
): PreviewEngine {
  const state: PreviewState = { status: 'idle', blob: null, renderedFingerprint: null, error: false };
  let token = 0; // monotonic; only the latest request may commit (race protection)
  let inFlightFp: string | null = null;
  let inFlightPromise: Promise<void> | null = null;
  let controller: AbortController | null = null;

  const emit = () => onChange({ ...state });
  const isStale = (content: CvContent) => pdfFingerprint(content) !== state.renderedFingerprint;

  function request(content: CvContent, opts: { force?: boolean } = {}): Promise<void> {
    const fp = pdfFingerprint(content);

    // Already displaying exactly this content — nothing to generate.
    if (!opts.force && fp === state.renderedFingerprint && state.status === 'ready') {
      return Promise.resolve();
    }
    // An identical request is already running — join it instead of duplicating work.
    if (inFlightFp === fp && inFlightPromise) return inFlightPromise;

    // A different request supersedes any older one.
    controller?.abort();
    const myToken = ++token;
    controller = new AbortController();
    const signal = controller.signal;
    inFlightFp = fp;
    state.status = 'loading';
    state.error = false; // keep state.blob visible while loading
    emit();

    const p = fetcher(content, signal)
      .then(
        (blob) => {
          if (myToken !== token) return; // a newer request already won
          state.blob = blob;
          state.renderedFingerprint = fp;
          state.status = 'ready';
          state.error = false;
          emit();
        },
        (err: unknown) => {
          if (myToken !== token) return; // superseded
          if (err instanceof DOMException && err.name === 'AbortError') return; // cancelled
          // Keep the previous PDF and its fingerprint; just flag the failure.
          state.status = state.blob ? 'ready' : 'error';
          state.error = true;
          emit();
        },
      )
      .finally(() => {
        if (inFlightPromise === p) {
          inFlightFp = null;
          inFlightPromise = null;
        }
      });

    inFlightPromise = p;
    return p;
  }

  return {
    request,
    requestIfStale: (content) => (isStale(content) ? request(content) : Promise.resolve()),
    isStale,
    getState: () => ({ ...state }),
    dispose: () => {
      ++token; // Ignore even a late response from a fetcher that did not honor abort.
      controller?.abort();
      inFlightFp = null;
      inFlightPromise = null;
    },
  };
}
