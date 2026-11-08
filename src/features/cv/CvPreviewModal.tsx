import { useEffect, useState } from 'react';
import { fetchCvPdfBlob } from '@/shared/api/queries';
import type { Cv } from '@/shared/api/types';
import { downloadBlob } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Overlay';
import { HarvardPdfViewer } from './HarvardPdfViewer';

/**
 * Previews a saved CV as a clean Harvard PDF using the SAME canvas renderer as the CV
 * Builder (HarvardPdfViewer) — no native PDF toolbar. The single fetched blob backs both
 * the preview and the Download button, so they never diverge. Read-only; no DB writes.
 */
export function CvPreviewModal({ cv, onClose }: { cv: Cv | null; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!cv) return;
    const controller = new AbortController();
    setStatus('loading');
    setBlob(null);
    fetchCvPdfBlob(cv.id, controller.signal)
      .then((b) => {
        setBlob(b);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus('error');
      });
    return () => controller.abort(); // cancel the fetch if the modal closes / CV changes
  }, [cv]);

  const filename = `${(cv?.name || 'CV').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'CV'}.pdf`;
  const download = () => blob && downloadBlob(blob, filename);

  return (
    <Modal
      open={!!cv}
      onClose={onClose}
      title={cv?.name ?? ''}
      size="lg"
      footer={
        <Button onClick={download} disabled={!blob}>
          Download PDF
        </Button>
      }
    >
      <div className="h-[70vh] overflow-hidden rounded-md">
        <HarvardPdfViewer
          blob={blob}
          status={status}
          errorText="Could not generate the PDF. Please try again."
        />
      </div>
    </Modal>
  );
}
