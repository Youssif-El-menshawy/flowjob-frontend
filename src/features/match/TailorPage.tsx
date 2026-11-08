import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { fetchCvPreviewPdf, useCreateCv, useCvs, useTailor, useTailorDraft } from '@/shared/api/queries';
import type { CvContent, TailorDraft, TailorSuggestion } from '@/shared/api/types';
import { useDebouncedValue, useDocumentTitle } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, Note, PageHeader, Segmented } from '@/shared/ui/Display';
import { Input, Textarea } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Overlay';
import { Skeleton } from '@/shared/ui/Spinner';
import { HarvardPdfViewer } from '@/features/cv/HarvardPdfViewer';

const SECTION: Record<string, string> = {
  summary: 'Summary',
  experience: 'Experience',
  skills: 'Skills',
  project: 'Project',
};

/** Apply only the accepted suggestions (with any user edits) to a CLONE — never the original. */
function apply(
  content: CvContent,
  suggestions: TailorSuggestion[],
  kept: Record<string, boolean>,
  edits: Record<string, string>,
): CvContent {
  const c = structuredClone(content);
  for (const s of suggestions) {
    if (!kept[s.id]) continue;
    const text = edits[s.id] ?? s.suggested;
    if (s.section === 'summary') c.summary = text;
    else if (s.section === 'skills') c.skills = text.split(',').map((t) => t.trim()).filter(Boolean);
    else if (s.section === 'experience') {
      const e = c.experience.find((y) => y.id === s.experienceId);
      if (e && s.bulletIndex !== undefined && s.bulletIndex < e.bullets.length) e.bullets[s.bulletIndex] = text;
    } else if (s.section === 'project') {
      const p = c.projects.find((y) => y.id === s.projectId);
      if (p) p.description = text;
    }
  }
  return c;
}

/** Non-persistent Harvard PDF preview of arbitrary CV content (reuses the preview endpoint). */
function TailorPreview({ content }: { content: CvContent }) {
  const key = useDebouncedValue(JSON.stringify(content), 500);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const reqId = useRef(0);
  useEffect(() => {
    const mine = ++reqId.current;
    setStatus((s) => (s === 'ready' ? 'ready' : 'loading'));
    fetchCvPreviewPdf(JSON.parse(key))
      .then((b) => {
        if (mine === reqId.current) {
          setBlob(b);
          setStatus('ready');
        }
      })
      .catch(() => mine === reqId.current && setStatus('error'));
  }, [key]);
  return (
    <div className="h-[clamp(420px,70vh,900px)] overflow-hidden rounded-md ring-1 ring-line">
      <HarvardPdfViewer blob={blob} status={status} errorText="Could not render the preview." />
    </div>
  );
}

interface Back {
  to: string;
  label: string;
}

function TailorLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-live="polite">
      <Card className="flex flex-col gap-4">
        <p className="font-medium">Writing truthful, focused suggestions for this job…</p>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </Card>
      <Skeleton className="h-[480px] rounded-md" />
    </div>
  );
}

function TailorError({ error, back, missing }: { error: unknown; back: Back; missing?: boolean }) {
  // Backend messages (quota, provider unavailable…) are already user-safe; anything else is generic.
  const text = missing
    ? 'This draft was not found. It may have expired or been removed — start again from the job form.'
    : error instanceof ApiError
      ? error.message
      : 'Please check your connection and try again.';
  return (
    <EmptyState
      title={missing ? 'Draft not found' : 'Could not tailor this CV'}
      text={text}
      action={<ButtonLink to={back.to}>{back.label}</ButtonLink>}
    />
  );
}

/**
 * Entry path A: /app/match/:matchId/tailor. Creates (or reuses the cached) draft for an existing
 * match — the match is never re-analysed.
 */
function MatchTailor({ matchId }: { matchId: string }) {
  const tailor = useTailor();
  const [draft, setDraft] = useState<TailorDraft | null>(null);
  const started = useRef(false);
  const back = { to: `/app/match/${matchId}`, label: 'Back to match' };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    tailor.mutate(matchId, { onSuccess: setDraft });
  }, [matchId, tailor]);

  if (tailor.isError) return <TailorError error={tailor.error} back={back} />;
  if (!draft) return <><PageHeader back={{ ...back, label: 'Back to match result' }} title="Tailor your CV" /><TailorLoading /></>;
  return <TailorReview key={draft.id} draft={draft} back={{ ...back, label: 'Back to match result' }} />;
}

/**
 * Entry path B: /app/tailor/:draftId — a direct-tailoring draft (no match). GET only, so
 * opening or refreshing never starts new AI work.
 */
function DraftTailor({ draftId }: { draftId: string }) {
  const q = useTailorDraft(draftId);
  const back = { to: '/app/match', label: 'Back to Job Match' };
  if (q.isError) return <TailorError error={q.error} back={back} missing={q.error instanceof ApiError && q.error.status === 404} />;
  if (!q.data) return <><PageHeader back={back} title="Tailor your CV" /><TailorLoading /></>;
  return <TailorReview key={q.data.id} draft={q.data} back={back} />;
}

export default function TailorPage() {
  useDocumentTitle('Tailor CV');
  const { matchId, draftId } = useParams();
  if (matchId) return <MatchTailor matchId={matchId} />;
  return <DraftTailor draftId={draftId ?? ''} />;
}

/** The single review UI for both entry paths. Never assumes a match exists. */
function TailorReview({ draft, back }: { draft: TailorDraft; back: Back }) {
  const nav = useNavigate();
  const toast = useToast();
  const cvs = useCvs();
  const create = useCreateCv();
  // Grounded suggestions are kept by default; review-required ones start unchecked.
  const [kept, setKept] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(draft.suggestions.map((s) => [s.id, !s.reviewRequired])),
  );
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState('');
  const [view, setView] = useState<'Tailored' | 'Original'>('Tailored');

  const source = cvs.data?.find((c) => c.id === draft.sourceCvId);
  useEffect(() => {
    if (!cvs.data || name) return;
    const n = cvs.data.filter((c) => c.company === draft.company).length + 1;
    setName(`${draft.company || draft.jobTitle} v${n}`);
  }, [draft, cvs.data, name]);

  const result = useMemo(
    () => (source ? apply(source.content, draft.suggestions, kept, edits) : null),
    [source, draft, kept, edits],
  );
  const keptCount = Object.values(kept).filter(Boolean).length;

  const save = () => {
    if (!result) return;
    create.mutate(
      {
        kind: 'tailored',
        name: name || `${draft.company || draft.jobTitle} v1`,
        jobTitle: draft.jobTitle,
        company: draft.company,
        matchId: draft.matchId,
        sourceCvId: draft.sourceCvId,
        content: result,
      },
      {
        onSuccess: (cv) => {
          toast({ text: `${cv.name} saved to My CVs.` });
          nav('/app/cvs');
        },
        onError: () => toast({ text: 'Could not save your CV.', tone: 'error' }),
      },
    );
  };

  return (
    <>
      <PageHeader
        back={back}
        title={`Tailor your CV for ${draft.company || draft.jobTitle}`}
        subtitle={`${draft.jobTitle} · based on ${source?.name ?? 'your CV'}`}
      />

      {!result ? (
        cvs.isLoading || !cvs.data ? (
          <TailorLoading />
        ) : (
          <EmptyState
            title="Original CV not found"
            text="The CV this draft was based on is no longer available."
            action={<ButtonLink to="/app/cvs">Go to My CVs</ButtonLink>}
          />
        )
      ) : (
        <>
          <Note tone="accent" className="mb-6 flex flex-wrap justify-between gap-2 animate-in">
            <span>This is a draft. Your original CV will not change. Nothing is saved until you choose to.</span>
            <span className="font-medium">
              {keptCount} of {draft.suggestions.length} suggestions kept
            </span>
          </Note>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="flex flex-col gap-3">
              {draft.suggestions.length === 0 && (
                <Card>
                  <p className="text-soft">Your CV already fits this job well. There is nothing we would change.</p>
                </Card>
              )}
              {draft.suggestions.map((s, i) => (
                <Card
                  as="article"
                  key={s.id}
                  className={cn('p-5 transition-colors animate-in', kept[s.id] && 'border-st-offer')}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-semibold tracking-wide text-soft uppercase">
                      {SECTION[s.section] ?? s.section}
                      {s.reviewRequired && (
                        <span className="ml-2 rounded-full bg-[#fbebc6] px-2 py-0.5 text-[11px] text-[#7a4f00] normal-case">
                          review — confirm it is true
                        </span>
                      )}
                    </span>
                    <Segmented
                      label="Keep or undo"
                      options={['Keep', 'Undo'] as const}
                      value={kept[s.id] ? 'Keep' : 'Undo'}
                      onChange={(v) => setKept((k) => ({ ...k, [s.id]: v === 'Keep' }))}
                    />
                  </div>
                  {s.explanation && <p className="mb-2 text-[13px] text-soft">{s.explanation}</p>}
                  <p className="text-sm text-soft line-through decoration-soft/50">{s.original || '(empty)'}</p>
                  <Textarea
                    label="Suggested wording"
                    className="mt-2 [&_label]:sr-only"
                    rows={2}
                    value={edits[s.id] ?? s.suggested}
                    onChange={(e) => setEdits((m) => ({ ...m, [s.id]: e.target.value }))}
                  />
                </Card>
              ))}

              {(draft.missingQualifications?.length || draft.questions?.length) && (
                <Card className="animate-in">
                  {!!draft.missingQualifications?.length && (
                    <>
                      <h3 className="mb-2 text-sm font-semibold">Gaps this job asks for (not added)</h3>
                      <ul className="mb-3 flex flex-col gap-1 text-sm text-soft">
                        {draft.missingQualifications.map((m, i) => (
                          <li key={i}>• {m}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {!!draft.questions?.length && (
                    <ul className="flex flex-col gap-1 text-sm text-soft">
                      {draft.questions.map((q, i) => (
                        <li key={i}>❓ {q}</li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
            </div>

            <div className="lg:sticky lg:top-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-soft">Preview · Harvard template</p>
                <Segmented
                  label="Preview"
                  options={['Tailored', 'Original'] as const}
                  value={view}
                  onChange={setView}
                />
              </div>
              <TailorPreview content={view === 'Tailored' ? result : source!.content} />
            </div>
          </div>

          <div className="sticky bottom-4 z-10 mt-8 flex flex-wrap items-center gap-3 rounded-3xl border border-line bg-surface p-4 shadow-lg">
            <label className="flex min-w-[260px] flex-1 cursor-pointer items-center gap-3 text-[15px]">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="size-[18px] accent-primary"
              />
              I checked this CV and everything in it is true
            </label>
            <div className="w-40">
              <Input
                label="Version name"
                className="[&_label]:sr-only"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button variant="ghost" onClick={() => nav(back.to)}>
              Discard
            </Button>
            <Button disabled={!agree} loading={create.isPending} onClick={save}>
              Save as new CV
            </Button>
          </div>
        </>
      )}
    </>
  );
}
