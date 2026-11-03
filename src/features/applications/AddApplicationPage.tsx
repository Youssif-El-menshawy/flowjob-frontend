import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCreateApplication } from '@/shared/api/queries';
import type { Application } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { Card, Note, PageHeader } from '@/shared/ui/Display';
import { useToast } from '@/shared/ui/Overlay';
import { ApplicationForm } from './ApplicationForm';

export default function AddApplicationPage() {
  useDocumentTitle('Add application');
  const nav = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const create = useCreateApplication();

  return (
    <>
      <PageHeader
        back={{ to: '/app/applications', label: 'Back to applications' }}
        title="Add an application"
        subtitle="Only company, job title and date are needed. You can add the rest later."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <Card className="animate-in">
          <ApplicationForm
            defaults={{ company: params.get('company') ?? '', jobTitle: params.get('jobTitle') ?? '' }}
            submitLabel="Save application"
            onCancel={() => nav(-1)}
            onSubmit={(v) =>
              create.mutateAsync(v).then((res) => {
                const a = res as Application;
                toast({ text: `${a.company} added.` });
                nav(`/app/applications/${a.id}`, { replace: true });
              })
            }
          />
        </Card>
        <aside className="flex flex-col gap-4 animate-in" style={{ animationDelay: '.1s' }}>
          <Note className="p-5">
            <p className="font-medium">How Gmail helps</p>
            <p className="mt-1.5 text-soft">
              Once this is saved, replies from the company can update its status. Gmail never adds
              applications by itself.
            </p>
          </Note>
          <Note tone="accent" className="p-5">
            <p className="font-medium">Link the CV you used</p>
            <p className="mt-1.5 text-soft">Before an interview you can open exactly what they read.</p>
          </Note>
        </aside>
      </div>
    </>
  );
}
