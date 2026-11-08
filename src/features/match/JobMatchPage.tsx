import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useCvs, useMatches, useRunMatch } from '@/shared/api/queries';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { EmptyState, PageHeader } from '@/shared/ui/Display';
import { Input, Select, Textarea } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icons';
import { PageLoader, Spinner } from '@/shared/ui/Spinner';

const STEPS = ['Reading the job post…', 'Comparing it with your CV…', 'Writing your feedback…'];

/** Rotating status line shown while the (explicitly requested) analysis runs. */
function Progress() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-soft">
      <Spinner className="size-4" />
      <span key={i} className="animate-in">
        {STEPS[i]}
      </span>
    </div>
  );
}

interface FormError {
  message: string;
  /** Validation problems belong next to the field; provider/quota errors get an alert. */
  field: boolean;
}

/**
 * Step 1 of Job Match: a centered input form inside the normal app layout. The analysis is
 * only ever started by the explicit "Analyse job match" click — never while typing. On
 * success we navigate to the dedicated, full-width report at /app/match/:id.
 */
export default function JobMatchPage() {
  useDocumentTitle('Job match');
  const nav = useNavigate();
  const cvs = useCvs();
  const recent = useMatches();
  const run = useRunMatch();
  const [cvId, setCvId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [text, setText] = useState(() => pendingJob.get());
  const [error, setError] = useState<FormError | null>(null);

  useEffect(() => {
    if (!cvId && cvs.data?.length) setCvId(cvs.data.find((c) => c.kind === 'original')?.id ?? cvs.data[0].id);
  }, [cvs.data, cvId]);

  if (cvs.isLoading) return <PageLoader />;
  if (!cvs.data?.length)
    return (
      <>
        <PageHeader
          title="Job match"
          subtitle="Paste a job post and see how well your CV fits before you apply."
        />
        <EmptyState
          title="Create your CV first"
          text="We compare job posts against your CV, so you need one to start."
          action={<ButtonLink to="/app/cv-builder">Create my CV</ButtonLink>}
        />
      </>
    );

  const canSubmit = !!cvId && !!jobTitle.trim() && !!text.trim() && !run.isPending;

  const submit = () => {
    if (!canSubmit) return; // also guards against duplicate submissions while pending
    setError(null);
    run.mutate(
      {
        cvId,
        jobTitle: jobTitle.trim(),
        jobDescription: text,
        company: company.trim() || undefined,
        jobUrl: jobUrl.trim() || undefined,
      },
      {
        onSuccess: (m) => {
          pendingJob.clear();
          // A normal (push) navigation, so the browser Back button returns to this form.
          nav(`/app/match/${m.id}`);
        },
        onError: (e) => {
          if (e instanceof ApiError) {
            const fieldMsg = e.fieldErrors?.jobDescription;
            setError({ message: fieldMsg ?? e.message, field: !!fieldMsg || e.status === 422 });
          } else {
            setError({ message: 'Something went wrong. Please try again.', field: false });
          }
        },
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[800px]">
      <PageHeader
        title="Job match"
        subtitle="Paste a job post and get an explainable, AI-powered read on how your CV fits."
      />

      <fieldset disabled={run.isPending} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Job details</legend>
        <Select label="CV to compare" value={cvId} onChange={(e) => setCvId(e.target.value)}>
          {cvs.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.kind === 'original' ? `, updated ${fmtDate(c.updatedAt)}` : ''}
            </option>
          ))}
        </Select>
        <Input
          label="Job title"
          placeholder="Backend Engineer"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label="Company" optional value={company} onChange={(e) => setCompany(e.target.value)} />
          <Input
            label="Job URL"
            optional
            placeholder="company.com/careers/..."
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
          />
        </div>
        <Textarea
          label="Job description"
          rows={13}
          placeholder="Paste the full job post here, including the requirements."
          value={text}
          error={error?.field ? error.message : undefined}
          onChange={(e) => setText(e.target.value)}
        />
      </fieldset>

      {error && !error.field && (
        <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error.message}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button onClick={submit} loading={run.isPending} disabled={!canSubmit && !run.isPending}>
          {run.isPending ? 'Analysing…' : 'Analyse job match'}
        </Button>
        {run.isPending ? (
          <Progress />
        ) : (
          <p className="text-[13px] text-soft">
            Uses AI to compare the post with your CV. Only runs when you click Analyse.
          </p>
        )}
      </div>

      {!!recent.data?.length && (
        <section className="mt-12" aria-labelledby="recent-matches">
          <h2 id="recent-matches" className="mb-3 text-[17px] font-semibold">
            Recent matches
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {recent.data.slice(0, 5).map((m) => (
              <li key={m.id}>
                <Link
                  to={`/app/match/${m.id}`}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-bg"
                >
                  <span className="font-display w-12 shrink-0 text-lg font-semibold">
                    {m.scoreAvailable === false ? '—' : `${m.score}%`}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {m.jobTitle}
                    {m.company ? ` · ${m.company}` : ''}
                  </span>
                  <span className="shrink-0 text-sm text-soft">{fmtDate(m.createdAt)}</span>
                  <Icon.arrowRight />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
