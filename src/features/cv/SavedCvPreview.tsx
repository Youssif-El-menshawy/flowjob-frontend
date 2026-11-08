import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchCvPdfBlob } from '@/shared/api/queries';
import type { Cv } from '@/shared/api/types';
import { cn, downloadBlob, fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Overlay';
import { CvActions, type CvAction } from './CvLibraryActions';
import { HarvardPdfViewer } from './HarvardPdfViewer';

const SCALES = [0.6, 0.8, 1, 1.25, 1.5, 2];
const PDF_ERROR = 'Could not load this saved CV’s PDF. Check your connection or try again.';

export function SavedCvPreview({ cv, mobile, mobileOpen, onBack, onAction }: {
  cv: Cv;
  mobile: boolean;
  mobileOpen: boolean;
  onBack: () => void;
  onAction: (action: CvAction) => void;
}) {
  const [zoom, setZoom] = useState(2);
  const [full, setFull] = useState(false);
  const [failedBlob, setFailedBlob] = useState<Blob | null>(null);
  const exitFull = useCallback(() => setFull(false), []);
  const pdf = useQuery({
    queryKey: ['saved-cv-pdf', cv.id, cv.updatedAt],
    queryFn: ({ signal }) => fetchCvPdfBlob(cv.id, signal),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const failed = pdf.isError || (!!pdf.data && pdf.data === failedBlob);
  const blob = pdf.isFetching || failed ? null : pdf.data ?? null;
  const status = pdf.isFetching ? 'loading' : failed ? 'error' : blob ? 'ready' : 'loading';

  const download = () => {
    if (!blob) return;
    const name = cv.name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'CV';
    downloadBlob(blob, `${name}.pdf`);
  };
  const retry = () => {
    setFailedBlob(null);
    void pdf.refetch();
  };

  const controls = (showFull: boolean) => (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Preview controls">
      <Button size="sm" variant="ghost" aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>−</Button>
      <span className="min-w-10 text-center text-xs tabular-nums text-soft">{Math.round(SCALES[zoom] * 100)}%</span>
      <Button size="sm" variant="ghost" aria-label="Zoom in" disabled={zoom === SCALES.length - 1} onClick={() => setZoom(zoom + 1)}>+</Button>
      {showFull && <Button size="sm" variant="ghost" onClick={() => setFull(true)}>Full screen</Button>}
    </div>
  );

  const document = (expanded: boolean) => (
    <div className={cn('relative min-w-0 overflow-hidden rounded-xl border border-line', expanded ? 'min-h-36 flex-1' : 'h-[clamp(360px,66vh,850px)]')}>
      <HarvardPdfViewer
        key={cv.updatedAt}
        blob={blob}
        status={status}
        scale={SCALES[zoom]}
        errorText={PDF_ERROR}
        onDocumentError={blob ? () => setFailedBlob(blob) : undefined}
      />
      {status === 'loading' && <span role="status" className="sr-only">Loading PDF for {cv.name}</span>}
    </div>
  );

  const metadata = [cv.kind === 'original' ? 'Original CV' : 'Tailored CV', cv.jobTitle, cv.company, `Updated ${fmtDate(cv.updatedAt, true)}`]
    .filter(Boolean).join(' · ');
  const toolbar = (showFull: boolean, showActions: boolean) => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {controls(showFull)}
      <div className="flex flex-wrap items-center gap-2">
        {status === 'error' && <Button size="sm" variant="secondary" onClick={retry}>Retry PDF</Button>}
        {showActions && <ButtonLink size="sm" variant="secondary" to={`/app/cv-builder/${cv.id}`}>Edit CV</ButtonLink>}
        <Button size="sm" disabled={!blob} onClick={download}>Download PDF</Button>
        {showActions && <CvActions cv={cv} onAction={onAction} />}
      </div>
    </div>
  );

  if (mobile || full) {
    return (
      <Modal
        open={!mobile || mobileOpen}
        onClose={mobile ? onBack : exitFull}
        title={cv.name}
        size="fullscreen"
        closeLabel={mobile ? 'Back to library' : 'Exit full screen'}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="text-sm break-words text-soft">{metadata}</p>
          {toolbar(false, mobile)}
          {document(true)}
        </div>
      </Modal>
    );
  }

  return (
    <section aria-label="Selected CV preview" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div>
        <h2 className="text-lg font-semibold break-words">{cv.name}</h2>
        <p className="mt-0.5 text-sm break-words text-soft">{metadata}</p>
      </div>
      {toolbar(true, true)}
      {document(false)}
    </section>
  );
}
