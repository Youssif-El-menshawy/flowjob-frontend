import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useCvs, useRunMatch, useTailorDirect } from '@/shared/api/queries';
import type { TailorDraft } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { jobPosts } from '@/shared/lib/jobPosts';
import { pendingJob } from '@/shared/lib/pendingJob';
import { fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { EmptyState, PageHeader } from '@/shared/ui/Display';
import { Input, Select, Textarea } from '@/shared/ui/Field';
import { PageLoader } from '@/shared/ui/Spinner';
import { RecentMatches } from './RecentMatches';


/** Same minimum the backend enforces for a job description (it also caps at 12,000). */
const MIN_JOB_CHARS = 80;
const MAX_JOB_CHARS = 12000;

const MATCH_STEPS = ['Reading the job post…', 'Comparing it with your CV…', 'Writing your feedback…'];
const TAILOR_STEPS = ['Reading the job post…', 'Finding what to emphasise in your CV…', 'Drafting your suggestions…'];

/**
 * The running button's label: the existing status messages, advanced every 700 ms while the request runs and
 * held on the last one (the requests report no real progress). Restarts from the first message each run.
 */
function useStepLabel(steps: string[], active: boolean): string {
  const [i, setI] = useState(0);
  const last = steps.length - 1;
  useEffect(() => {
    setI(0);
    if (!active) return;
    const t = setInterval(() => setI((x) => Math.min(x + 1, last)), 700);
    return () => clearInterval(t);
  }, [active, last]);
  return steps[i];
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
type Recovery = Pick<TailorDraft, 'sourceCvId' | 'jobTitle' | 'company' | 'jobUrl'>;

export default function JobMatchPage() {
  useDocumentTitle('Job match');
  const location = useLocation();
  const recovery = (location.state as { freshTailoringDraft?: Recovery } | null)?.freshTailoringDraft;
  return <JobMatchForm key={recovery ? location.key : 'job-form'} recovery={recovery} />;
}

function JobMatchForm({ recovery }: { recovery?: Recovery }) {
  const nav = useNavigate();
  const cvs = useCvs();
  const run = useRunMatch();
  const tailor = useTailorDirect();
  const submitting = useRef(false);
  const [cvId, setCvId] = useState(recovery?.sourceCvId ?? '');
  const [jobTitle, setJobTitle] = useState(recovery?.jobTitle ?? '');
  const [company, setCompany] = useState(recovery?.company ?? '');
  const [jobUrl, setJobUrl] = useState(recovery?.jobUrl ?? '');
  const [text, setText] = useState(() => recovery ? '' : pendingJob.get());
  const [error, setError] = useState<FormError | null>(null);
  const matchLabel = useStepLabel(MATCH_STEPS, run.isPending);
  const tailorLabel = useStepLabel(TAILOR_STEPS, tailor.isPending);

  useEffect(() => {
    if (!cvId && cvs.data?.length) setCvId(cvs.data.find((c) => c.kind === 'original')?.id ?? cvs.data[0].id);
  }, [cvs.data, cvId]);

  if (cvs.isPending || cvs.isLoading) return <PageLoader />;
  if (cvs.isError && !cvs.data?.length)
    return (
      <EmptyState
        title="Could not load your CVs"
        text="Check your connection and try again."
        action={<Button loading={cvs.isFetching} onClick={() => void cvs.refetch()}>Try again</Button>}
      />
    );
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
  const cvAvailable = cvs.data.some((cv) => cv.id === cvId);
  const canSubmit = cvAvailable && !!jobTitle.trim() && textOk && !busy;
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
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
    setError(null);
    tailor.mutate(
      {
        cvId,
        jobTitle: jobTitle.trim(),
        jobDescription: text.trim(),
        company: company.trim() || undefined,
        jobUrl: jobUrl.trim() || undefined,
        ...(recovery && { fresh: true }),
      },
      {
        onSuccess: (d) => {
          pendingJob.clear();
          nav(`/app/tailor/${d.id}`);
        },
        // Tailoring 422s can be about the CV itself (e.g. empty), so show them as an alert.
        onError: (e) => {
          submitting.current = false;
          onError(e, false);
        },
      },
    );
  };

  const submit = () => {
    if (!canSubmit || submitting.current) return;
    submitting.current = true;
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
          jobPosts.remember(m.id, text);
          // A normal (push) navigation, so the browser Back button returns to this form.
          nav(`/app/match/${m.id}`);
        },
        onError: (e) => {
          submitting.current = false;
          onError(e, true);
        },
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[800px]">
      <PageHeader
        title="Match or tailor your CV"
        subtitle="Select a CV and paste a job posting to see how well you match or tailor your CV for the role."
      />

      {recovery && <p className="mb-4 text-sm text-soft">Paste the job description and select Tailor my CV to create a fresh draft.</p>}

      <fieldset disabled={busy} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
        <legend className="sr-only">Job details</legend>
        <Select label="CV to use" value={cvAvailable ? cvId : ''} onChange={(e) => setCvId(e.target.value)}>
          {!cvAvailable && <option value="" disabled>Choose a CV</option>}
          {/* Originals first: a version tailored for one job is rarely the right start for another. */}
          {(['original', 'tailored'] as const).map((kind) => {
            const group = cvs.data.filter((c) => (c.kind === 'tailored') === (kind === 'tailored'));
            return group.length ? (
              <optgroup key={kind} label={kind === 'original' ? 'Your CVs' : 'Tailored versions'}>
                {group.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.kind === 'original' ? `, updated ${fmtDate(c.updatedAt)}` : ''}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
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

      {/* The running action's button carries the only spinner and the pending label; the other one is just
          disabled. Fixed-height, full-width, single-line buttons keep the layout still while the label changes. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Button
          id="check-match"
          className="w-full min-w-0"
          onClick={submit}
          loading={run.isPending}
          disabled={!canSubmit && !run.isPending}
        >
          <span className="truncate">{run.isPending ? matchLabel : 'Check my match'}</span>
        </Button>
        <Button
          id="tailor-cv"
          variant="secondary"
          className="w-full min-w-0"
          onClick={tailorSubmit}
          loading={tailor.isPending}
          disabled={!canSubmit && !tailor.isPending}
        >
          <span className="truncate">{tailor.isPending ? tailorLabel : 'Tailor my CV'}</span>
        </Button>
      </div>
      <p className="mt-3 text-[13px] text-soft">
        Not sure which? Check your match first. The report shows what the job asks for, and you can tailor from there.
      </p>
      {/* Announces the running request to screen readers (a disabled button's label change is not announced). */}
      <p role="status" aria-live="polite" className="sr-only">
        {run.isPending ? matchLabel : tailor.isPending ? tailorLabel : ''}
      </p>

      <RecentMatches />
    </div>
  );
}
