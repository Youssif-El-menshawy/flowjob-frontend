import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { fetchCvPreviewPdf } from '@/shared/api/queries';
import type { CvContent } from '@/shared/api/types';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { HarvardPdfViewer } from './HarvardPdfViewer';
import { createPreviewEngine, type PreviewEngine, type PreviewState } from './cvPreview';

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2];
const DEFAULT_ZOOM = 2; // index of 1.0 (fit-to-width)

export interface CvPreviewHandle {
  /** Regenerate only if the form content differs from the displayed PDF. */
  updateIfStale: () => void;
  /** Regenerate from the current content (used by the Update preview button). */
  update: () => void;
}

/**
 * Event-driven Harvard CV preview. The PDF is generated on mount and then ONLY when
 * explicitly requested (Update preview button, or Next/Back and Save when stale) — never
 * on keystrokes. Renders via the shared HarvardPdfViewer (PDF.js canvases, no viewer chrome).
 * Read-only; same renderer as the saved preview and download. Never writes to MongoDB.
 */
export const CvLivePreview = forwardRef<CvPreviewHandle, { content: CvContent; cvId?: string }>(
  function CvLivePreview({ content, cvId }, ref) {
    const [engineState, setEngineState] = useState<PreviewState>({
      status: 'idle',
      blob: null,
      renderedFingerprint: null,
      error: false,
    });
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [fullscreen, setFullscreen] = useState(false);

    const contentRef = useRef(content);
    contentRef.current = content; // always the latest form content for imperative calls

    // One engine per mounted CV (the parent remounts via key={cv.id} for a different CV).
    const engineRef = useRef<PreviewEngine | null>(null);
    if (!engineRef.current) {
      engineRef.current = createPreviewEngine(
        (c, signal) => fetchCvPreviewPdf(c, signal, undefined, cvId),
        setEngineState,
      );
    }
    const engine = engineRef.current;

    // Initial preview, generated exactly once; abort/cleanup on unmount.
    useEffect(() => {
      engine.request(contentRef.current);
      return () => engine.dispose();
    }, [engine]);

    useImperativeHandle(
      ref,
      () => ({
        updateIfStale: () => void engine.requestIfStale(contentRef.current),
        update: () => void engine.request(contentRef.current),
      }),
      [engine],
    );

    useEffect(() => {
      if (!fullscreen) return;
      const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [fullscreen]);

    const scale = ZOOMS[zoom];
    const { status, blob, error, errorMessage } = engineState;
    const loading = status === 'loading';
    // Derived from current form content vs the displayed PDF — recomputed every render, so
    // the button reacts to typing instantly without any network request.
    const stale = engine.isStale(content);

    // No status dot/text — just the Update preview button. Enabled only when the form content
    // differs from the displayed PDF (stale), or the last attempt failed.
    const actionLabel = loading ? 'Updating…' : error ? 'Retry' : 'Update preview';
    const actionDisabled = loading || (!stale && !error);
    const runUpdate = () => engine.request(contentRef.current, { force: error });

    const zoomControls = (
      <div className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          aria-label="Zoom out"
          className="px-2.5"
          disabled={zoom === 0}
          onClick={() => setZoom((z) => Math.max(0, z - 1))}
        >
          −
        </Button>
        <span className="w-9 text-center text-xs tabular-nums text-soft">
          {Math.round(scale * 100)}%
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Zoom in"
          className="px-2.5"
          disabled={zoom === ZOOMS.length - 1}
          onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
        >
          +
        </Button>
      </div>
    );

    const header = (
      <div className="mb-2.5 flex min-h-10 flex-wrap items-center justify-between gap-x-2 gap-y-1 xl:flex-nowrap" data-testid="preview-toolbar">
        <p className={cn('shrink-0 text-sm font-medium', fullscreen ? 'text-white/80' : 'text-soft')}>CV preview</p>
        <div className="flex flex-wrap items-center justify-end gap-0.5 xl:flex-nowrap">
        <Button
          size="sm"
          variant="secondary"
          className="px-3"
          onClick={runUpdate}
          disabled={actionDisabled}
          aria-label={error ? 'Retry preview generation' : 'Update preview'}
        >
          {actionLabel}
        </Button>
        <div className={cn(fullscreen && 'rounded-md bg-white/10 px-1')}>{zoomControls}</div>
        {fullscreen ? (
          <button
            onClick={() => setFullscreen(false)}
            className="rounded-md px-3 py-1.5 text-sm text-white hover:bg-white/10"
          >
            Close
          </button>
        ) : (
          <Button size="sm" variant="ghost" className="px-3" onClick={() => setFullscreen(true)}>
            Full screen
          </Button>
        )}
        </div>
      </div>
    );

    // One persistent tree: fullscreen is a CSS state change, so the viewer is never
    // remounted (no PDF.js re-parse) when toggling fullscreen or switching form steps.
    return (
      <div className={cn(fullscreen && 'fixed inset-0 z-50 flex flex-col bg-black/80 p-4 sm:p-8')}>
        <div className={cn(fullscreen && 'mx-auto flex w-full max-w-4xl flex-col overflow-hidden')}>
          {header}
        </div>
        <div
          className={cn(
            'relative overflow-hidden rounded-md',
            fullscreen
              ? 'mx-auto w-full max-w-4xl flex-1'
              : 'h-[clamp(420px,70vh,900px)] ring-1 ring-line',
          )}
        >
          <HarvardPdfViewer
            blob={blob}
            status={status}
            scale={scale}
            errorText={errorMessage ?? 'Could not generate the preview. Use “Retry” above.'}
          />
          {errorMessage && blob && <p role="alert" className="absolute inset-x-2 bottom-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{errorMessage}</p>}
        </div>
      </div>
    );
  },
);
