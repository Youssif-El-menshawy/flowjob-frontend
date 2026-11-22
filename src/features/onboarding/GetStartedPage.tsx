import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfileImportStatus } from '@/shared/api/queries';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { PageHeader } from '@/shared/ui/Display';

/**
 * Shown once after registration. Profile first: every choice is optional and nothing happens until the user picks
 * one. Skipping keeps the CV import available (from the Profile page and the Dashboard).
 */
export default function GetStartedPage() {
  useDocumentTitle('Get started');
  const { user } = useAuth();
  const status = useProfileImportStatus();
  const first = user?.name.trim().split(/\s+/)[0];
  // Offered unless the server says this account has already imported.
  const canImport = status.data?.available !== false;
  const options = [
    ...(canImport
      ? [{
          to: '/app/profile/import',
          title: 'Import my existing CV',
          text: 'Upload a PDF. FlowJob fills in your Profile, and you review everything before it is saved.',
        }]
      : []),
    {
      to: '/app/profile',
      title: 'Complete my Profile manually',
      text: 'Add your experience, education and skills, section by section.',
    },
    {
      to: '/app',
      title: 'Skip for now',
      text: 'Go to your dashboard. You can import your CV or fill in your Profile any time.',
    },
  ];
  return (
    <>
      <PageHeader
        title={first ? `Welcome to FlowJob, ${first}` : 'Welcome to FlowJob'}
        subtitle="Start with your Profile. Your CVs and job matches are made from it."
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
