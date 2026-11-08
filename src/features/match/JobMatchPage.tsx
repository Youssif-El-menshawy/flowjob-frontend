import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useCvs, useMatch, useMatches, useRunMatch } from '@/shared/api/queries';
import type { MatchResult, RequirementMatch } from '@/shared/api/types';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, PageHeader, ProgressBar } from '@/shared/ui/Display';
import { Input, Select, Textarea } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icons';
import { PageLoader, Skeleton } from '@/shared/ui/Spinner';

const STEPS = ['Reading the job post…', 'Comparing it with your CV…', 'Writing your feedback…'];

function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 700);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="flex flex-col gap-4" aria-live="polite">
      <p key={i} className="font-medium animate-in">
        {STEPS[i]}
      </p>
      <Skeleton className="h-16" />
      <Skeleton className="w-4/5" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </Card>
  );
}

function ReqList({ items, dot, empty }: { items: RequirementMatch[]; dot: string; empty: string }) {
  if (!items.length) return <p className="text-sm text-soft">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((x, i) => (
        <li key={`${x.requirement}-${i}`} className="flex gap-3">
          <span className={`mt-2 size-2 shrink-0 rounded-full ${dot}`} />
          <div className="min-w-0">
            <p className="font-medium">
              {x.requirement}
              {x.importance === 'required' && (
                <span className="ml-2 rounded-full bg-tint px-2 py-0.5 align-middle text-[11px] font-medium text-soft">
                  required
                </span>
              )}
            </p>
            <p className="text-sm text-soft">{x.evidence}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Result({ m }: { m: MatchResult }) {
  const scoreAvailable = m.scoreAvailable ?? true;
  const score = useCountUp(scoreAvailable ? m.score : 0, 1000, 100);
  const matched =
    m.matched ??
    m.strengths.map((s) => ({ requirement: s.skill, importance: 'required' as const, evidence: s.evidence }));
  const partial = m.partiallyMatched ?? [];
  const missing =
    m.missing ?? m.gaps.map((g) => ({ requirement: g.skill, importance: 'required' as const, evidence: g.tip }));
  const assessment = m.overallAssessment ?? m.summary;
  const appQuery = new URLSearchParams({
    company: m.company,
    jobTitle: m.jobTitle,
    ...(m.jobUrl ? { jobUrl: m.jobUrl } : {}),
    ...(m.cvId ? { cvId: m.cvId } : {}),
  }).toString();

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center gap-6 animate-in">
        <div className="min-w-[140px]">
          {scoreAvailable ? (
            <p className="font-display text-[64px] leading-none font-semibold tracking-tight">{score}%</p>
          ) : (
            <p className="font-display text-[34px] leading-tight font-semibold">Score unavailable</p>
          )}
          <p className="mt-1 text-sm font-medium text-accent-ink">{m.verdict}</p>
        </div>
        <div className="min-w-[240px] flex-1">
          <p className="font-medium">
            {m.jobTitle}
            {m.company ? ` · ${m.company}` : ''}
          </p>
          {scoreAvailable && <ProgressBar value={m.score} className="mt-3" label="Match score" />}
          <p className="mt-3 text-[15px] leading-relaxed text-soft">{assessment}</p>
          {m.scoreExplanation && <p className="mt-2 text-[13px] text-soft">{m.scoreExplanation}</p>}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="animate-in">
          <h2 className="mb-4 text-[17px] font-semibold">Clearly matched</h2>
          <ReqList items={matched} dot="bg-st-offer" empty="Nothing from this post shows clearly in your CV yet." />
        </Card>
        <Card className="animate-in" style={{ animationDelay: '.06s' }}>
          <h2 className="mb-4 text-[17px] font-semibold">Partially matched</h2>
          <ReqList items={partial} dot="bg-st-review" empty="No partial matches." />
        </Card>
        <Card className="animate-in" style={{ animationDelay: '.12s' }}>
          <h2 className="mb-4 text-[17px] font-semibold">Missing or unverified</h2>
          <ReqList items={missing} dot="bg-accent" empty="Nothing obvious is missing." />
        </Card>
      </div>

      {!!m.recommendations?.length && (
        <Card className="animate-in">
          <h2 className="mb-3 text-[17px] font-semibold">How to improve your CV for this job</h2>
          <ul className="flex flex-col gap-2.5">
            {m.recommendations.map((r, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <p className="text-[15px] leading-relaxed">{r}</p>
              </li>
            ))}
          </ul>
          {!!m.suggestedWording?.length && (
            <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4">
              <p className="text-sm font-medium text-soft">Stronger wording (based on your CV)</p>
              {m.suggestedWording.map((s, i) => (
                <div key={i} className="rounded-xl bg-bg p-3">
                  <p className="text-[13px] font-medium text-soft capitalize">{s.section}</p>
                  <p className="text-[15px] leading-relaxed">{s.suggestion}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!!m.questions?.length && (
        <Card className="animate-in">
          <h2 className="mb-3 text-[17px] font-semibold">A few things to confirm</h2>
          <ul className="flex flex-col gap-2 text-[15px] text-soft">
            {m.questions.map((q, i) => (
              <li key={i}>• {q}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 animate-in">
        <ButtonLink to={`/app/match/${m.id}/tailor`}>Tailor my CV for this job</ButtonLink>
        <ButtonLink to={`/app/applications/new?${appQuery}`} variant="secondary">
          Add to Applications
        </ButtonLink>
        <p className="text-[13px] text-soft">
          A heuristic estimate of CV-to-job alignment — not an employer ATS score. FlowJob never adds skills
          you do not have.
        </p>
      </div>
    </div>
  );
}

export default function JobMatchPage() {
  useDocumentTitle('Job match');
  const { matchId } = useParams();
  const nav = useNavigate();
  const cvs = useCvs();
  const recent = useMatches();
  const existing = useMatch(matchId);
  const run = useRunMatch();
  const [cvId, setCvId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [text, setText] = useState(() => (matchId ? '' : pendingJob.get()));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cvId && cvs.data?.length) setCvId(cvs.data.find((c) => c.kind === 'original')?.id ?? cvs.data[0].id);
  }, [cvs.data, cvId]);
  useEffect(() => {
    if (existing.data) {
      setCvId(existing.data.cvId);
      setJobTitle(existing.data.jobTitle);
      setCompany(existing.data.company ?? '');
    }
  }, [existing.data]);

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

  const submit = () => {
    setError('');
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
          nav(`/app/match/${m.id}`, { replace: true });
        },
        onError: (e) =>
          setError(
            e instanceof ApiError
              ? (e.fieldErrors?.jobDescription ?? e.message)
              : 'Something went wrong. Please try again.',
          ),
      },
    );
  };
  const shown = run.isPending ? null : matchId ? existing.data : null;
  const canSubmit = !!jobTitle.trim() && !!text.trim() && !run.isPending;

  return (
    <>
      <PageHeader
        title="Job match"
        subtitle="Paste a job post and get an explainable, AI-powered read on how your CV fits."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[400px_1fr]">
        <Card className="flex flex-col gap-4 lg:sticky lg:top-8 animate-in">
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
          <div className="grid gap-4 sm:grid-cols-2">
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
            rows={9}
            placeholder="Paste the full job post here, including the requirements."
            value={text}
            error={error}
            onChange={(e) => setText(e.target.value)}
          />
          <Button full onClick={submit} loading={run.isPending} disabled={!canSubmit}>
            {run.isPending ? 'Analysing…' : shown ? 'Analyse again' : 'Analyse job'}
          </Button>
          <p className="text-[13px] text-soft">
            Uses AI to compare the post with your CV evidence. Only this analysis — no skills are invented.
          </p>
          {matchId && (
            <Link
              to="/app/match"
              onClick={() => setText('')}
              className="text-sm font-medium text-primary hover:underline"
            >
              Start a new match
            </Link>
          )}
        </Card>

        <div className="min-w-0">
          {run.isPending ? (
            <Loading />
          ) : shown ? (
            <Result key={shown.id} m={shown} />
          ) : matchId && existing.isLoading ? (
            <Loading />
          ) : (
            <div className="flex flex-col gap-5 animate-in">
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-line p-8 text-center">
                <h2 className="text-xl font-semibold">Your result will show here</h2>
                <p className="mt-2 max-w-sm leading-relaxed text-soft">
                  An explainable score, what already matches, what is missing, and specific ways to improve
                  your CV. Nothing is sent to employers.
                </p>
              </div>
              {!!recent.data?.length && (
                <Card>
                  <h2 className="mb-3 text-[17px] font-semibold">Recent matches</h2>
                  <ul className="-mx-2">
                    {recent.data.slice(0, 4).map((m) => (
                      <li key={m.id}>
                        <Link
                          to={`/app/match/${m.id}`}
                          className="flex items-center gap-4 rounded-xl px-2 py-2.5 hover:bg-bg"
                        >
                          <span className="font-display w-12 text-lg font-semibold">
                            {m.scoreAvailable === false ? '—' : `${m.score}%`}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {m.jobTitle}
                            {m.company ? ` · ${m.company}` : ''}
                          </span>
                          <span className="text-sm text-soft">{fmtDate(m.createdAt)}</span>
                          <Icon.arrowRight />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
