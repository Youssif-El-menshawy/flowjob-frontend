import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCvs, useDeleteCv } from '@/shared/api/queries';
import type { Cv } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, Note, PageHeader } from '@/shared/ui/Display';
import { ConfirmDialog, Modal, useToast } from '@/shared/ui/Overlay';
import { PageLoader } from '@/shared/ui/Spinner';
import { CvSheet } from './CvSheet';

export default function MyCvsPage() {
  useDocumentTitle('My CVs');
  const toast = useToast();
  const { data, isLoading } = useCvs();
  const del = useDeleteCv();
  const [viewing, setViewing] = useState<Cv | null>(null);
  const [removing, setRemoving] = useState<Cv | null>(null);
  if (isLoading) return <PageLoader />;
  const original = data?.find((c) => c.kind === 'original');
  const tailored = (data ?? [])
    .filter((c) => c.kind === 'tailored')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <>
      <PageHeader
        title="My CVs"
        subtitle="One original, plus a tailored version for each job you care about."
        actions={original && <ButtonLink to="/app/match">Tailor for a new job</ButtonLink>}
      />
      {!original ? (
        <EmptyState
          title="No CV yet"
          text="Create your original CV first. Tailored versions for each job will show up here."
          action={<ButtonLink to="/app/cv-builder">Create my CV</ButtonLink>}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[340px_1fr]">
          <Card className="flex flex-col gap-5 animate-in">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[17px] font-semibold">Original CV</h2>
              <span className="text-sm text-soft">Updated {fmtDate(original.updatedAt)}</span>
            </div>
            <button
              onClick={() => setViewing(original)}
              className="group relative mx-auto h-[300px] w-[230px] overflow-hidden rounded-md text-left"
              aria-label="Preview original CV"
            >
              <div className="pointer-events-none w-[600px] origin-top-left scale-[0.383] transition-transform duration-300 group-hover:-translate-y-2">
                <CvSheet cv={original.content} />
              </div>
            </button>
            <p className="text-sm leading-relaxed text-soft">
              Tailoring never changes this one. It is always your starting point.
            </p>
            <div className="flex gap-2.5">
              <ButtonLink to="/app/cv-builder" variant="secondary">
                Edit
              </ButtonLink>
              <Button variant="secondary" onClick={() => setViewing(original)}>
                Preview
              </Button>
            </div>
          </Card>

          <Card className="animate-in" style={{ animationDelay: '.08s' }}>
            <h2 className="mb-4 text-[17px] font-semibold">Tailored versions</h2>
            {tailored.length === 0 ? (
              <p className="py-8 text-center leading-relaxed text-soft">
                No tailored versions yet.{' '}
                <Link to="/app/match" className="font-medium text-primary hover:underline">
                  Check a job match
                </Link>{' '}
                and tailor your CV for it.
              </p>
            ) : (
              <ul className="-mx-2">
                {tailored.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-2 py-3 hover:bg-bg"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-soft">
                        {c.jobTitle} · {c.company} · saved {fmtDate(c.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(c)}>
                        Open
                      </Button>
                      <ButtonLink size="sm" variant="ghost" to={`/app/cv-builder/${c.id}`}>
                        Edit
                      </ButtonLink>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        onClick={() => setRemoving(c)}
                      >
                        Delete
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Note tone="accent" className="mt-4">
              Tip: link the CV you used when you add an application. Before an interview you will know exactly
              what they read.
            </Note>
          </Card>
        </div>
      )}

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name ?? ''}
        size="lg"
        footer={<Button onClick={() => window.print()}>Download PDF</Button>}
      >
        {viewing && (
          <CvSheet cv={viewing.content} className="print-area shadow-none ring-1 ring-line" compact />
        )}
      </Modal>
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={`Delete ${removing?.name}?`}
        text="This tailored version will be removed. Your original CV stays as it is."
        confirmLabel="Delete"
        danger
        loading={del.isPending}
        onConfirm={() =>
          removing &&
          del.mutate(removing.id, {
            onSuccess: () => {
              toast({ text: `${removing.name} deleted.` });
              setRemoving(null);
            },
          })
        }
      />
    </>
  );
}
