import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useCvs, useMatch, useMatches, useRunMatch } from '@/shared/api/queries';
import type { MatchResult } from '@/shared/api/types';
import { useCountUp, useDocumentTitle } from '@/shared/lib/hooks';
import { pendingJob } from '@/shared/lib/pendingJob';
import { fmtDate } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, PageHeader, ProgressBar } from '@/shared/ui/Display';
import { Select, Textarea } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icons';
import { PageLoader, Skeleton } from '@/shared/ui/Spinner';

const STEPS = ['Reading the job post…', 'Comparing it with your CV…', 'Writing your summary…'];

function Loading() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, STEPS.length - 1)), 600);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="flex flex-col gap-4" aria-live="polite">
      <p key={i} className="font-medium animate-in">
        {STEPS[i]}
      </p>
      <Skeleton className="h-16" />
      <Skeleton className="w-4/5" />
      <Skeleton className="w-3/5" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    </Card>
  );
}

function Result({ m }: { m: MatchResult }) {
  const score = useCountUp(m.score, 1000, 100);
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center gap-6 animate-in">
        <div className="min-w-[140px]">
          <p className="font-display text-[64px] leading-none font-semibold tracking-tight">{score}%</p>
          <p className="mt-1 text-sm font-medium text-accent-ink">{m.verdict}</p>
        </div>
        <div className="min-w-[240px] flex-1">
          <p className="font-medium">
            {m.jobTitle} · {m.company}
          </p>
          <ProgressBar value={m.score} className="mt-3" label="Match score" />
          <p className="mt-3 text-[15px] leading-relaxed text-soft">{m.summary}</p>
        </div>
      </Card>
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          {
            t: 'Already matches',
            items: m.strengths.map((s) => ({ a: s.skill, b: s.evidence })),
            dot: 'bg-st-offer',
            empty: 'Nothing from this post shows in your CV yet.',
          },
          {
            t: 'Worth working on',
            items: m.gaps.map((g) => ({ a: g.skill, b: g.tip })),
            dot: 'bg-accent',
            empty: 'No gaps. Your CV covers everything asked for.',
          },
        ].map((col, ci) => (
          <Card key={col.t} className="animate-in" style={{ animationDelay: `${0.1 + ci * 0.08}s` }}>
            <h2 className="mb-4 text-[17px] font-semibold">{col.t}</h2>
            {col.items.length ? (
              <ul className="flex flex-col gap-3.5">
                {col.items.map((x) => (
                  <li key={x.a} className="flex gap-3">
                    <span className={`mt-2 size-2 shrink-0 rounded-full ${col.dot}`} />
                    <div>
                      <p className="font-medium">{x.a}</p>
                      <p className="text-sm text-soft">{x.b}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-soft">{col.empty}</p>
            )}
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 animate-in" style={{ animationDelay: '.25s' }}>
        <ButtonLink to={`/app/match/${m.id}/tailor`}>Tailor my CV for this job</ButtonLink>
        <ButtonLink
          to={`/app/applications/new?company=${encodeURIComponent(m.company)}&jobTitle=${encodeURIComponent(m.jobTitle)}`}
          variant="secondary"
        >
          Track this application
        </ButtonLink>
        <p className="text-[13px] text-soft">FlowJob never adds skills you do not have.</p>
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
  const [text, setText] = useState(() => (matchId ? '' : pendingJob.get()));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cvId && cvs.data?.length) setCvId(cvs.data.find((c) => c.kind === 'original')?.id ?? cvs.data[0].id);
  }, [cvs.data, cvId]);
  useEffect(() => {
    if (existing.data) {
      setText(existing.data.jobText);
      setCvId(existing.data.cvId);
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
      { cvId, jobText: text },
      {
        onSuccess: (m) => {
          pendingJob.clear();
          nav(`/app/match/${m.id}`, { replace: true });
        },
        onError: (e) =>
          setError(
            e instanceof ApiError
              ? (e.fieldErrors?.jobText ?? e.message)
              : 'Something went wrong. Please try again.',
          ),
      },
    );
  };
  const shown = run.isPending ? null : matchId ? existing.data : null;

  return (
    <>
      <PageHeader
        title="Job match"
        subtitle="Paste a job post and see how well your CV fits before you apply."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[400px_1fr]">
        <Card className="flex flex-col gap-5 lg:sticky lg:top-8 animate-in">
          <Select label="CV to compare" value={cvId} onChange={(e) => setCvId(e.target.value)}>
            {cvs.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.kind === 'original' ? `, updated ${fmtDate(c.updatedAt)}` : ''}
              </option>
            ))}
          </Select>
          <Textarea
            label="Job description"
            rows={11}
            placeholder="Paste the full job post here, including the requirements."
            value={text}
            error={error}
            onChange={(e) => setText(e.target.value)}
          />
          <Button full onClick={submit} loading={run.isPending} disabled={!text.trim()}>
            {run.isPending ? 'Analysing…' : shown ? 'Analyse again' : 'Analyse match'}
          </Button>
          <p className="text-[13px] text-soft">
            Takes about 10 seconds. The text is only used for this match.
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
                  A score, what already matches and what is worth working on. Nothing is sent to employers.
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
                          <span className="font-display w-12 text-lg font-semibold">{m.score}%</span>
                          <span className="min-w-0 flex-1 truncate">
                            {m.jobTitle} · {m.company}
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
