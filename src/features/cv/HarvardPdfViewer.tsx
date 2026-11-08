import { useLayoutEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { cn } from '@/shared/lib/utils';
import { Spinner } from '@/shared/ui/Spinner';

// Render PDF pages ourselves (as canvases) so the browser's native PDF toolbar never
// appears. The worker is bundled locally by Vite — no CDN, no paid service. Declared once
// here and shared by every viewer (CV Builder live preview and My CVs preview modal).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export type HarvardPdfStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Presentational, read-only Harvard PDF viewer: paints the given PDF `blob` onto canvases
 * as clean white A4 pages on a neutral background — no native PDF controls. Responsive
 * fit-to-width (× optional `scale`), multi-page vertical scrolling, loading/error overlays.
 *
 * It only *displays* a blob; fetching/caching/race-safety belong to the caller. The caller
 * should change `blob` only on a successful generation, so the previous page stays visible
 * while a new one loads. react-pdf tears the document down on unmount (resource cleanup).
 */
export function HarvardPdfViewer({
  blob,
  status,
  scale = 1,
  errorText = 'Could not generate the preview. Please try again.',
  className,
}: {
  blob: Blob | null;
  status: HarvardPdfStatus;
  scale?: number;
  errorText?: string;
  className?: string;
}) {
  const [numPages, setNumPages] = useState(0);
  const [baseWidth, setBaseWidth] = useState(560);
  const frameRef = useRef<HTMLDivElement>(null);

  // Fit pages to the container width (responsive, never clipped). Observing width changes
  // re-rasterizes pages but does NOT reload the document (no PDF.js re-parse).
  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setBaseWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.max(220, Math.round((baseWidth - 32) * scale));

  return (
    <div
      ref={frameRef}
      className={cn('relative h-full w-full overflow-auto overscroll-contain bg-[#e9ebef]', className)}
    >
      <div className="flex min-h-full flex-col items-center gap-4 p-4">
        {blob && (
          <Document
            file={blob}
            loading={null}
            error={null}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
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

      {/* Overlay only when there is nothing to show yet; once a blob exists it stays
          visible (the caller keeps the previous blob while a newer one loads). */}
      {!blob && (
        <div className="absolute inset-0 grid place-items-center">
          {status === 'error' ? (
            <p className="px-6 text-center text-sm text-soft">{errorText}</p>
          ) : (
            <Spinner />
          )}
        </div>
      )}
    </div>
  );
}
