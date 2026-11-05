import { useEffect, useRef, useState } from 'react';
import { fetchCvPdfBlob } from '@/shared/api/queries';
import type { Cv } from '@/shared/api/types';
import { downloadBlob } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Overlay';
import { Spinner } from '@/shared/ui/Spinner';

/**
 * Previews a saved CV using the backend-rendered Harvard PDF, and downloads the
 * exact same document. Preview and Download never diverge: both come from the
 * single blob fetched here.
 */
export function CvPreviewModal({ cv, onClose }: { cv: Cv | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    if (!cv) return;
    let active = true;
    let objectUrl: string | null = null;
    setState('loading');
    setUrl(null);
    blobRef.current = null;
    fetchCvPdfBlob(cv.id)
      .then((blob) => {
        if (!active) return;
        blobRef.current = blob;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cv]);

  const filename = `${(cv?.name || 'CV').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'CV'}.pdf`;
  const download = () => blobRef.current && downloadBlob(blobRef.current, filename);

  return (
    <Modal
      open={!!cv}
      onClose={onClose}
      title={cv?.name ?? ''}
      size="lg"
      footer={
        <Button onClick={download} disabled={state !== 'ready'}>
          Download PDF
        </Button>
      }
    >
      <div className="flex h-[70vh] items-center justify-center overflow-hidden rounded-md bg-[#525659]">
        {state === 'loading' && <Spinner className="text-white" />}
        {state === 'error' && (
          <p className="px-6 text-center text-sm text-white">
            Could not generate the PDF. Please try again.
          </p>
        )}
        {state === 'ready' && url && (
          <iframe title={`${cv?.name ?? 'CV'} preview`} src={url} className="h-full w-full border-0" />
        )}
      </div>
    </Modal>
  );
}
