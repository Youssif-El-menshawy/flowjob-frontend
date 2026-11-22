import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { PageHeader } from '@/shared/ui/Display';

/** Shown once after registration. Every choice is optional; nothing happens until the user picks one. */
export default function GetStartedPage() {
  useDocumentTitle('Get started');
  const { user } = useAuth();
  const first = user?.name.trim().split(/\s+/)[0];
  const options = [
    {
      to: '/app/cvs/import',
      title: 'Import my existing CV',
      text: 'Upload a PDF. FlowJob sorts it into sections and you review everything before it is saved.',
    },
    { to: '/app/cv-builder', title: 'Create my CV manually', text: 'A guided form, section by section.' },
    { to: '/app', title: 'Skip for now', text: 'Go to your dashboard. You can add a CV any time.' },
  ];
  return (
    <>
      <PageHeader
        title={first ? `Welcome to FlowJob, ${first}` : 'Welcome to FlowJob'}
        subtitle="How would you like to start your CV?"
      />
      <ul className="grid max-w-4xl gap-4 md:grid-cols-3">
        {options.map((option) => (
          <li key={option.to}>
            <Link
              to={option.to}
              replace
              className="flex h-full flex-col gap-2 rounded-3xl border border-line bg-surface p-6 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="text-lg font-semibold">{option.title}</span>
              <span className="text-sm leading-relaxed text-soft">{option.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      {pendingJob.get() && (
        <p className="mt-5 text-sm text-soft">The job post you saved is waiting for you on the dashboard.</p>
      )}
    </>
  );
}
