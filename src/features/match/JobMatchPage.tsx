import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useCvs, useMatches, useRunMatch, useTailorDirect } from '@/shared/api/queries';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { EmptyState, PageHeader } from '@/shared/ui/Display';
import { Input, Select, Textarea } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icons';
import { PageLoader, Spinner } from '@/shared/ui/Spinner';

const MATCH_STEPS = ['Reading the job post…', 'Comparing it with your CV…', 'Writing your feedback…'];
const TAILOR_STEPS = ['Reading the job post…', 'Finding what to emphasise in your CV…', 'Drafting your suggestions…'];

/** Same minimum the backend enforces for a job description (it also caps at 12,000). */
const MIN_JOB_CHARS = 80;
const MAX_JOB_CHARS = 12000;

type Action = 'match' | 'tailor';

/** Rotating status line shown while an (explicitly requested) AI request runs. */
function Progress({ steps: STEPS }: { steps: string[] }) {
  const [i, setI] = useState(0);
  const last = STEPS.length - 1;
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, last)), 700);
    return () => clearInterval(t);
  }, [last]);
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
 * Shared job-input form for two independent AI workflows: "Check my match" (POST /matches →
 * /app/match/:id) and "Tailor my CV" (POST /tailor with the CV + job, no match record →
 * /app/tailor/:draftId). Nothing runs while typing — only an explicit click on one action.
 */
export default function JobMatchPage() {
  useDocumentTitle('Job match');
  const nav = useNavigate();
  const cvs = useCvs();
  const recent = useMatches();
  const run = useRunMatch();
  const tailor = useTailorDirect();
  const [action, setAction] = useState<Action | null>(null);
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

  const busy = run.isPending || tailor.isPending;
  const jobLen = text.trim().length;
  const textOk = jobLen >= MIN_JOB_CHARS && jobLen <= MAX_JOB_CHARS;
  const canSubmit = !!cvId && !!jobTitle.trim() && textOk && !busy;
  const textHint =
    jobLen > 0 && jobLen < MIN_JOB_CHARS
      ? `Add a bit more — at least ${MIN_JOB_CHARS} characters of the job post (${jobLen} so far).`
      : jobLen > MAX_JOB_CHARS
        ? `The job post is too long — please keep it under ${MAX_JOB_CHARS.toLocaleString()} characters.`
        : undefined;

  const onError = (e: unknown, descriptionIs422: boolean) => {
    if (e instanceof ApiError) {
      const fieldMsg = e.fieldErrors?.jobDescription;
      setError({ message: fieldMsg ?? e.message, field: !!fieldMsg || (descriptionIs422 && e.status === 422) });
    } else {
      setError({ message: 'Something went wrong. Please check your connection and try again.', field: false });
    }
  };

  const tailorSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    setAction('tailor');
    tailor.mutate(
      {
        cvId,
        jobTitle: jobTitle.trim(),
        jobDescription: text.trim(),
        company: company.trim() || undefined,
      },
      {
        onSuccess: (d) => {
          pendingJob.clear();
          nav(`/app/tailor/${d.id}`);
        },
        // Tailoring 422s can be about the CV itself (e.g. empty), so show them as an alert.
        onError: (e) => onError(e, false),
      },
    );
  };

  const submit = () => {
    if (!canSubmit) return; // also guards against duplicate submissions while pending
    setError(null);
    setAction('match');
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
        onError: (e) => onError(e, true),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[800px]">
      <PageHeader
        title="Match or tailor your CV"
        subtitle="Select a CV and paste a job posting to see how well you match or tailor your CV for the role."
      />

      <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Job details</legend>
        <Select label="CV to use" value={cvId} onChange={(e) => setCvId(e.target.value)}>
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
          error={error?.field ? error.message : textHint}
          onChange={(e) => setText(e.target.value)}
        />
      </fieldset>

      {error && !error.field && (
        <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error.message}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Button
          className="w-full"
          onClick={submit}
          loading={run.isPending}
          disabled={!canSubmit && !run.isPending}
        >
          {run.isPending ? 'Checking match…' : 'Check my match'}
        </Button>
        <Button
          className="w-full"
          onClick={tailorSubmit}
          loading={tailor.isPending}
          disabled={!canSubmit && !tailor.isPending}
        >
          {tailor.isPending ? 'Tailoring…' : 'Tailor my CV'}
        </Button>
      </div>
      {busy && (
        <div className="mt-4">
          <Progress key={action} steps={tailor.isPending ? TAILOR_STEPS : MATCH_STEPS} />
        </div>
      )}

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
