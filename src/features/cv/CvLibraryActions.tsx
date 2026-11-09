import { useCallback, useRef, useState } from 'react';
import { useApplications, useDeleteCv, useUpdateCv } from '@/shared/api/queries';
import type { Cv } from '@/shared/api/types';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Modal, useToast } from '@/shared/ui/Overlay';

export type CvAction = 'rename' | 'delete';

export function CvActions({ cv, onAction }: { cv: Cv; onAction: (action: CvAction) => void }) {
  const details = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const close = () => {
    if (details.current) details.current.open = false;
  };
  const choose = (action: CvAction) => {
    close();
    trigger.current?.focus();
    onAction(action);
  };

  return (
    <details
      ref={details}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !details.current?.open) return;
        event.stopPropagation();
        close();
        trigger.current?.focus();
      }}
    >
      <summary
        ref={trigger}
        aria-label="More CV actions"
        className="grid size-9 cursor-pointer list-none place-items-center rounded-full border border-line text-lg text-soft hover:bg-tint focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden>⋯</span>
      </summary>
      <div className="absolute right-0 z-20 mt-1 flex min-w-36 flex-col rounded-xl border border-line bg-surface p-1 shadow-lg">
        <Button size="sm" variant="ghost" onClick={() => choose('rename')}>Rename</Button>
        {cv.kind === 'tailored' && <Button size="sm" variant="danger" onClick={() => choose('delete')}>Delete</Button>}
      </div>
    </details>
  );
}

interface DialogProps {
  cv: Cv;
  onClose: () => void;
}

function RenameDialog({ cv, onClose }: DialogProps) {
  const update = useUpdateCv();
  const toast = useToast();
  const [name, setName] = useState(cv.name);
  const [error, setError] = useState(false);
  const nextName = name.trim();
  const close = useCallback(() => {
    if (!update.isPending) onClose();
  }, [update.isPending, onClose]);
  const rename = () => {
    if (!nextName || nextName === cv.name || update.isPending) return;
    setError(false);
    update.mutate({ id: cv.id, name: nextName }, {
      onSuccess: () => {
        toast({ text: 'CV renamed.' });
        onClose();
      },
      onError: () => setError(true),
    });
  };
  return (
    <Modal
      open
      onClose={close}
      title="Rename CV"
      footer={
        <>
          <Button variant="secondary" disabled={update.isPending} onClick={close}>Cancel</Button>
          <Button loading={update.isPending} disabled={!nextName || nextName === cv.name} onClick={rename}>Save name</Button>
        </>
      }
    >
      <Input
        label="CV name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') rename(); }}
      />
      {error && <p role="alert" className="mt-3 text-sm text-danger">Could not rename this CV. Please try again.</p>}
    </Modal>
  );
}

function DeleteDialog({ cv, onClose, onDeleted }: DialogProps & { onDeleted: () => void }) {
  const del = useDeleteCv();
  const applications = useApplications();
  const toast = useToast();
  const [error, setError] = useState(false);
  const count = applications.data?.filter((application) => application.cvId === cv.id).length ?? 0;
  const close = useCallback(() => {
    if (!del.isPending) onClose();
  }, [del.isPending, onClose]);

  return (
    <Modal
      open
      onClose={close}
      title={`Delete ${cv.name}?`}
      footer={
        <>
          <Button variant="secondary" disabled={del.isPending} onClick={close}>Cancel</Button>
          <Button
            variant="danger"
            loading={del.isPending}
            onClick={() => {
              if (del.isPending) return;
              setError(false);
              del.mutate(cv.id, {
                onSuccess: () => {
                  toast({ text: `${cv.name} deleted.` });
                  onDeleted();
                  onClose();
                },
                onError: () => setError(true),
              });
            }}
          >
            Delete
          </Button>
        </>
      }
    >
      <p className="leading-relaxed text-soft">
        This tailored version will be removed. Your original CV stays as it is.
        {count > 0 && ` ${(applications.data?.length ?? 0) >= 200 ? 'At least ' : ''}${count} ${count === 1 ? 'application uses' : 'applications use'} this CV.`}
        {' '}Applications are kept, but any links to this PDF will stop working.
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">Could not delete this CV. Please try again.</p>}
    </Modal>
  );
}

export function CvActionDialog({ action, cv, onClose, onDeleted }: DialogProps & {
  action: CvAction;
  onDeleted: () => void;
}) {
  if (action === 'rename') return <RenameDialog cv={cv} onClose={onClose} />;
  return cv.kind === 'tailored' ? <DeleteDialog cv={cv} onClose={onClose} onDeleted={onDeleted} /> : null;
}
