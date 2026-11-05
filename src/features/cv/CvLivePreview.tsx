import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { fetchCvPreviewPdf } from '@/shared/api/queries';
import type { CvContent } from '@/shared/api/types';
import { useDebouncedValue } from '@/shared/lib/hooks';
import { Button } from '@/shared/ui/Button';
import { Spinner } from '@/shared/ui/Spinner';

// Render PDF pages ourselves (as canvases) so the browser's native PDF toolbar never
// appears. The worker is bundled locally by Vite — no CDN, no paid service.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2];
const DEFAULT_ZOOM = 2; // index of 1.0 (fit-to-width)

/**
 * Live Harvard CV preview for the builder. Fetches the backend-rendered PDF for the
 * current (unsaved) content and paints its pages onto canvases — a clean A4 document
 * with no PDF-viewer chrome. Read-only; same renderer as the saved preview and download.
 *
 * Debounced (~700ms), race-safe (stale responses are dropped), and never writes to MongoDB.
 */
export function CvLivePreview({ content }: { content: CvContent }) {
  const json = JSON.stringify(content);
  const debounced = useDebouncedValue(json, 700);

  const [blob, setBlob] = useState<Blob | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [fullscreen, setFullscreen] = useState(false);
  const [baseWidth, setBaseWidth] = useState(560);

  const reqId = useRef(0);
  const frameRef = useRef<HTMLDivElement>(null);

  // Fetch a fresh PDF whenever the (debounced) content changes; only the latest wins.
  useEffect(() => {
    const myId = ++reqId.current;
    setRefreshing(true);
    setStatus((s) => (s === 'ready' ? 'ready' : 'loading'));
    let cancelled = false;
    fetchCvPreviewPdf(JSON.parse(debounced))
      .then((next) => {
        if (cancelled || myId !== reqId.current) return; // a newer request already won
        setBlob(next);
      })
      .catch(() => {
        if (!cancelled && myId === reqId.current) setStatus('error');
      })
      .finally(() => {
        if (!cancelled && myId === reqId.current) setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // Track the panel width so pages render fit-to-width and never clip (responsive).
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setBaseWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  const scale = ZOOMS[zoom];
  const pageWidth = Math.max(220, Math.round((baseWidth - 32) * scale));

  // react-pdf needs a stable `file` reference, or it reloads the document every render.
  const file = useMemo(() => blob, [blob]);

  const viewer = (
    <div ref={frameRef} className="relative h-full w-full overflow-auto overscroll-contain bg-[#e9ebef]">
      <div className="flex min-h-full flex-col items-center gap-4 p-4">
        {file && (
          <Document
            file={file}
            loading={null}
            error={null}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setStatus('ready');
            }}
            onLoadError={() => setStatus('error')}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div key={i} className="mb-4 shadow-[0_6px_24px_rgb(0_0_0/0.18)] last:mb-0">
                <Page
                  pageNumber={i + 1}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={null}
                />
              </div>
            ))}
          </Document>
        )}
      </div>

      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center">
          <Spinner />
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="px-6 text-center text-sm text-soft">
            Could not render the preview. It will retry when you next edit a field.
          </p>
        </div>
      )}
      {refreshing && status === 'ready' && (
        <span className="absolute top-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
          Updating…
        </span>
      )}
    </div>
  );

  const zoomControls = (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        aria-label="Zoom out"
        disabled={zoom === 0}
        onClick={() => setZoom((z) => Math.max(0, z - 1))}
      >
        −
      </Button>
      <span className="w-10 text-center text-xs tabular-nums text-soft">{Math.round(scale * 100)}%</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Zoom in"
        disabled={zoom === ZOOMS.length - 1}
        onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
      >
        +
      </Button>
    </div>
  );

  return (
    <>
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-soft">Live preview · Harvard template</p>
          <div className="flex items-center gap-1">
            {zoomControls}
            <Button size="sm" variant="ghost" onClick={() => setFullscreen(true)}>
              Full screen
            </Button>
          </div>
        </div>
        <div className="h-[clamp(420px,70vh,900px)] overflow-hidden rounded-md ring-1 ring-line">
          {!fullscreen && viewer}
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4 sm:p-8" role="dialog" aria-modal="true">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2 pb-3 text-white">
            <p className="text-sm font-medium">Live preview · Harvard template</p>
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-white/10 px-1">{zoomControls}</div>
              <button
                onClick={() => setFullscreen(false)}
                className="rounded-md px-3 py-1.5 text-sm hover:bg-white/10"
              >
                Close
              </button>
            </div>
          </div>
          <div className="mx-auto w-full max-w-4xl flex-1 overflow-hidden rounded-md">{viewer}</div>
        </div>
      )}
    </>
  );
}
