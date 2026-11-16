import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { fetchCvPreviewPdf, useCreateCv, useCv, useCvs, useMatch, useRunMatch, useTailor, useTailorDraft } from '@/shared/api/queries';
import { TAILORING_BACKEND_INCOMPATIBLE } from '@/shared/api/tailoring';
import type { Cv, CvContent, MatchResult, TailorDraft } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { jobPosts, tailorFromMatch } from '@/shared/lib/jobPosts';
import { TAILOR_REVIEW_PREFIX } from '@/shared/lib/sessionData';
import { cn, downloadBlob } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, PageHeader, Segmented } from '@/shared/ui/Display';
import { Input, Textarea } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Overlay';
import { Skeleton } from '@/shared/ui/Spinner';
import { HarvardPdfViewer } from '@/features/cv/HarvardPdfViewer';
import { createPreviewEngine, type PreviewState } from '@/features/cv/cvPreview';
import { applySuggestions, defaultText, isEditable, reviewSuggestion, type Decision, type ReviewedSuggestion } from './tailorReview';

const SECTION: Record<string, string> = {
  summary: 'Summary',
  experience: 'Experience',
  skills: 'Skills',
  project: 'Project',
};

const lines = (text: string) => text.split('\n').filter(Boolean);

function opLabel(s: ReviewedSuggestion) {
  switch (s.op) {
    case 'reorder': return s.section === 'skills' ? 'Reorder skills' : 'Reorder bullets';
    case 'delete': return s.section === 'skills' ? 'Remove skill' : 'Remove bullet';
    case 'add_skill': return 'Add skill';
    default: return s.section === 'summary' && s.original === '' ? 'New summary' : SECTION[s.section] ?? s.section;
  }
}

/** What a suggestion shows when expanded: wording to edit, an order change, a removal, or a skill with its evidence. */
function SuggestionBody({ suggestion, onEdit }: { suggestion: ReviewedSuggestion; onEdit: (text: string) => void }) {
  const op = suggestion.op ?? 'rewrite';
  if (op === 'reorder') {
    const bullets = suggestion.section !== 'skills';
    const before = bullets ? lines(suggestion.original) : suggestion.original.split(',').map((x) => x.trim());
    const after = bullets ? lines(suggestion.suggested) : suggestion.suggested.split(',').map((x) => x.trim());
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[['Current order', before], ['Suggested order', after]].map(([title, items]) => (
          <div key={title as string}>
            <p className="mb-1 text-sm font-medium">{title as string}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm break-words text-soft">
              {(items as string[]).map((item, i) => <li key={i}>{item}</li>)}
            </ol>
          </div>
        ))}
        <p className="text-sm text-soft sm:col-span-2">Nothing is added or removed, only the order changes.</p>
      </div>
    );
  }
  if (op === 'delete') {
    return (
      <div>
        <p className="mb-1 text-sm font-medium">{suggestion.section === 'skills' ? 'Skill to remove' : 'Bullet to remove'}</p>
        <p className="text-sm break-words whitespace-pre-wrap text-soft">{suggestion.section === 'skills' ? suggestion.skill : suggestion.original}</p>
      </div>
    );
  }
  if (op === 'add_skill') {
    return (
      <div className="grid gap-3">
        {suggestion.evidence && (
          <div>
            <p className="mb-1 text-sm font-medium">Where your CV already names it</p>
            <p className="text-sm break-words text-soft">“{suggestion.evidence.quote}”</p>
          </div>
        )}
        <Textarea label="Skill to add" rows={1} value={suggestion.text} disabled={suggestion.blocked} onChange={(event) => onEdit(event.target.value)} />
        <p className="text-sm text-accent-ink">Add it only if it is true. It is shown in your Skills section once you apply it.</p>
      </div>
    );
  }
  return (
    <>
      <div>
        <p className="mb-1 text-sm font-medium">Original wording</p>
        <p className="text-sm break-words whitespace-pre-wrap text-soft">{suggestion.original || '(empty)'}</p>
      </div>
      <Textarea
        label="Suggested wording"
        rows={3}
        value={suggestion.text}
        disabled={suggestion.blocked}
        onChange={(event) => onEdit(event.target.value)}
      />
      {suggestion.skillChanges && (
        <div className="rounded-xl bg-bg p-3 text-sm">
          <p className="mb-2 font-medium">Changes to the original skills list</p>
          <dl className="grid gap-1 break-words text-soft">
            <div><dt className="inline font-medium">Retained: </dt><dd className="inline">{suggestion.skillChanges.retained.join(', ') || 'None'}</dd></div>
            <div><dt className="inline font-medium">Added if applied: </dt><dd className="inline">{suggestion.skillChanges.added.join(', ') || 'None'}</dd></div>
            <div><dt className="inline font-medium">Removed if applied: </dt><dd className="inline">{suggestion.skillChanges.removed.join(', ') || 'None'}</dd></div>
          </dl>
          {suggestion.skillChanges.added.length > 0 && (
            <p className="mt-2 text-accent-ink">New to this list. Apply only skills your original CV supports.</p>
          )}
        </div>
      )}
    </>
  );
}

function SuggestionCard({ suggestion, onEdit, onDecide }: {
  suggestion: ReviewedSuggestion;
  onEdit: (text: string) => void;
  onDecide: (decision: Decision) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const op = suggestion.op ?? 'rewrite';
  // The new wording is readable on the closed card, so a decision does not need the details open.
  const preview = op === 'rewrite' && suggestion.text.trim()
    ? { label: 'Suggested', text: suggestion.text }
    : op === 'add_skill' && suggestion.evidence
      ? { label: 'Your CV already says', text: `“${suggestion.evidence.quote}”` }
      : null;
  return (
    <Card as="article" className={cn('!p-0', suggestion.applied && 'border-st-offer')}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full flex-col gap-1.5 rounded-2xl px-4 py-3.5 text-left hover:bg-tint/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      >
        <span className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="min-w-0 font-semibold break-words">
            {[opLabel(suggestion), suggestion.target.title].filter(Boolean).join(' · ')}
          </span>
          <span className="flex items-center gap-2">
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              suggestion.applied ? 'bg-tint text-primary' :
                suggestion.status === 'Needs review' ? 'bg-accent/15 text-accent-ink' : 'bg-side text-soft',
            )}>
              {suggestion.status}
            </span>
            <span aria-hidden className="text-soft">{expanded ? '▴' : '▾'}</span>
          </span>
        </span>
        {suggestion.target.excerpt && (
          <span className="line-clamp-1 text-[13px] break-words text-soft italic">“{suggestion.target.excerpt}”</span>
        )}
        <span className="line-clamp-2 text-sm break-words text-soft">
          {suggestion.explanation || 'Compare the suggested wording with your original CV.'}
        </span>
        {suggestion.blocked && (
          <span className="text-xs font-semibold text-accent-ink">This suggestion cannot be matched to the verified source.</span>
        )}
      </button>
      {!expanded && preview && (
        <p className="px-4 pb-1 text-sm break-words">
          <span className="font-medium">{preview.label}: </span>
          <span className="line-clamp-3 whitespace-pre-wrap">{preview.text}</span>
        </p>
      )}
      {!!suggestion.newTerms?.length && suggestion.text === suggestion.suggested && (
        <p className="px-4 pb-1 text-[13px] break-words text-accent-ink">
          <span className="font-semibold">Not in your CV: </span>
          {suggestion.newTerms.join(', ')}. Apply only if this is true for you.
        </p>
      )}
      <div id={detailsId} hidden={!expanded}>
        {expanded && (
          <div className="grid gap-3 border-t border-line px-4 py-4">
            <SuggestionBody suggestion={suggestion} onEdit={onEdit} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 px-4 pt-2 pb-3.5" role="group" aria-label="Suggestion decision">
              {suggestion.auto ? (
                suggestion.applied ? (
                  <Button size="sm" variant="secondary" onClick={() => onDecide('original')}>
                    Undo
                  </Button>
                ) : (
                  <Button size="sm" variant="primary" onClick={() => onDecide({ acceptedText: suggestion.text })}>
                    Redo
                  </Button>
                )
              ) : (
                <>
                  <Button
                    size="sm"
                    variant={suggestion.applied ? 'primary' : 'secondary'}
                    aria-pressed={suggestion.applied}
                    disabled={suggestion.blocked || (isEditable(suggestion) && !suggestion.text.trim())}
                    onClick={() => onDecide({ acceptedText: suggestion.text })}
                  >
                    Apply suggestion
                  </Button>
                  <Button
                    size="sm"
                    variant={suggestion.status === 'Original kept' ? 'primary' : 'secondary'}
                    aria-pressed={suggestion.status === 'Original kept'}
                    disabled={suggestion.blocked}
                    onClick={() => onDecide('original')}
                  >
                    Keep original
                  </Button>
                </>
              )}
      </div>
    </Card>
  );
}

/** Each preview mode has its own lifetime. Edits only mark its rendered PDF as stale. */
function TailorPreview({ content, draftId, cvId, onSourceRejected }: {
  content: CvContent;
  draftId?: string;
  cvId?: string;
  onSourceRejected: () => void;
}) {
  const [state, setState] = useState<PreviewState>({
    status: 'idle', blob: null, renderedFingerprint: null, error: false,
  });
  const [engine] = useState(() => createPreviewEngine(async (value, signal) => {
    try {
      return cvId
        ? await fetchCvPreviewPdf(value, signal, draftId, cvId)
        : await fetchCvPreviewPdf(value, signal, draftId);
    } catch (error) {
      if (!signal.aborted && draftId && error instanceof ApiError && error.status === 409) onSourceRejected();
      throw error;
    }
  }, setState));
  const initialContent = useRef(content);
  useEffect(() => {
    void engine.request(initialContent.current);
    return () => engine.dispose();
  }, [engine]);

  // Live preview: re-render shortly after the last decision. A newer request aborts an older one, so at most one
  // render is in flight; the manual button below stays as a fallback.
  useEffect(() => {
    const timer = setTimeout(() => void engine.request(content), 700);
    return () => clearTimeout(timer);
  }, [engine, content]);

  const stale = engine.isStale(content);
  const loading = state.status === 'loading' || state.status === 'idle';
  return (
    <>
      <div className="order-1 flex min-h-11 items-center">
        <Button
          size="sm"
          variant="secondary"
          disabled={!stale && !state.error}
          loading={loading}
          onClick={() => void engine.request(content, { force: state.error })}
        >
          {loading ? 'Updating preview…' : state.error ? 'Retry preview' : 'Update preview'}
        </Button>
        {loading && <span role="status" className="sr-only">Rendering Harvard PDF preview</span>}
      </div>
      <div className="relative order-3 h-[min(62dvh,640px)] min-h-[300px] w-full overflow-hidden rounded-md ring-1 ring-line lg:h-[clamp(300px,calc(100dvh-17rem),760px)]">
        <HarvardPdfViewer blob={state.blob} status={state.status} errorText={state.errorMessage ?? 'Could not render the preview.'} />
        {state.error && state.blob && (
          <p role="alert" className="absolute inset-x-2 bottom-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.errorMessage ?? 'Could not render the preview. Try again.'}
          </p>
        )}
      </div>
    </>
  );
}

const REQUIREMENT_GROUPS = [
  { key: 'matched', label: 'Shown in your CV', mark: '✓', tone: 'bg-tint text-primary' },
  { key: 'partiallyMatched', label: 'Partly shown', mark: '~', tone: 'bg-accent/15 text-accent-ink' },
  { key: 'missing', label: 'Not shown yet', mark: '–', tone: 'bg-side text-soft' },
] as const;

/** What the job asks for, grouped by whether the match report found it in the source CV. */
function JobRequirements({ match }: { match: MatchResult }) {
  const groups = REQUIREMENT_GROUPS.map((group) => ({ ...group, items: match[group.key] ?? [] }));
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  if (!total) return null;
  return (
    <section aria-label="What this job asks for" className="rounded-2xl border border-line bg-surface p-6">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold">What this job asks for</h3>
        <p className="text-sm text-soft">{groups[0].items.length} of {total} shown in your CV</p>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {groups.flatMap((group) => group.items.map((item, index) => (
          <li key={`${group.key}-${index}`} className={cn('rounded-full px-2.5 py-1 text-[13px] break-words', group.tone)}>
            <span aria-hidden>{group.mark} </span>
            <span className="sr-only">{group.label}: </span>
            {item.requirement}
          </li>
        )))}
      </ul>
      <p className="mt-2 text-[13px] text-soft">
        ✓ shown in your CV · ~ partly shown · – not shown yet. Based on your original CV.
      </p>
    </section>
  );
}

interface Back {
  to: string;
  label: string;
}

function TailorLoading({ message = 'Writing truthful, focused suggestions for this job…' }: { message?: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-live="polite">
      <Card className="flex flex-col gap-4">
        <p className="font-medium">{message}</p>
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </Card>
      <Skeleton className="h-[480px] rounded-md" />
    </div>
  );
}

function TailorError({ error, back, missing, title = 'Could not tailor this CV', retry }: {
  error: unknown; back: Back; missing?: boolean; title?: string; retry?: ReactNode;
}) {
  // Backend messages (quota, provider unavailable…) are already user-safe; anything else is generic.
  const text = missing
    ? 'This draft was not found. It may have expired or been removed — start again from the job form.'
    : error instanceof ApiError
      ? error.message
      : 'Please check your connection and try again.';
  return (
    <EmptyState
      title={missing ? 'Draft not found' : title}
      text={text}
      action={
        <div className="flex flex-wrap justify-center gap-2.5">
          {retry}
          <ButtonLink to={back.to} variant={retry ? 'secondary' : 'primary'}>{back.label}</ButtonLink>
        </div>
      }
    />
  );
}

/** The old match-tailor link stays usable. Opening or refreshing it never starts AI work. */
function MatchTailor({ matchId }: { matchId: string }) {
  const nav = useNavigate();
  const tailor = useTailor();
  const back = { to: `/app/match/${matchId}`, label: 'Back to match' };

  const start = () => tailor.mutate(tailorFromMatch({ matchId }), {
    onSuccess: (draft) => nav(`/app/tailor/${draft.id}`, { replace: true }),
  });
  if (tailor.isError) {
    return <TailorError error={tailor.error} back={back}
      retry={<Button onClick={start}>Retry tailoring</Button>} />;
  }
  return (
    <>
      <PageHeader back={back} title="Tailor your CV" />
      {tailor.isPending ? <TailorLoading /> : <Button onClick={start}>Start tailoring</Button>}
    </>
  );
}

/** A persisted draft is read by id, whether it came from a match or the job form. */
function DraftTailor({ draftId }: { draftId: string }) {
  const q = useTailorDraft(draftId);
  const matchId = q.data?.matchId;
  const back = matchId
    ? { to: `/app/match/${matchId}`, label: 'Back to match result' }
    : { to: '/app/match', label: 'Back to Job Match' };
  const checkingDraft = !q.isFetchedAfterMount && q.isFetching;
  if (q.isPending || checkingDraft) {
    return <><PageHeader back={back} title="Tailor your CV" /><TailorLoading message="Loading your saved draft…" /></>;
  }
  if (q.isError || !q.data) {
    const missing = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 410);
    return <TailorError error={q.error} back={back} missing={missing} title="Could not load this draft"
      retry={!missing && <Button loading={q.isFetching} onClick={() => void q.refetch()}>Try again</Button>} />;
  }
  // The focused layout's top bar already offers "Back to Job Match", so don't repeat it here.
  return <TailorReview key={q.data.id} draft={q.data} back={back} hideHeaderBack={!matchId} />;
}

export default function TailorPage() {
  useDocumentTitle('Tailor CV');
  const { matchId, draftId } = useParams();
  if (matchId) return <MatchTailor key={matchId} matchId={matchId} />;
  if (draftId) return <DraftTailor key={draftId} draftId={draftId} />;
  return <TailorError error={null} back={{ to: '/app/match', label: 'Back to Job Match' }} missing />;
}

function DraftRecovery({ draft, incompatible }: { draft: TailorDraft; incompatible: boolean }) {
  const nav = useNavigate();
  const regenerate = useTailor();
  const { matchId, sourceCvId, jobTitle, company, jobUrl } = draft;
  const recoveryState = { freshTailoringDraft: { sourceCvId, jobTitle, company, jobUrl } };

  return (
    <div className="mb-4 rounded-xl bg-accent/15 p-3 text-sm text-accent-ink">
      <p role="alert">
        {incompatible
          ? TAILORING_BACKEND_INCOMPATIBLE
          : draft.sourceCvRevision === null
            ? 'This older draft has no verified source revision.'
            : 'The source CV changed after this draft was generated.'}
      </p>
      {!incompatible && (matchId ? (
        <Button size="sm" variant="secondary" className="mt-2" loading={regenerate.isPending}
          onClick={() => regenerate.mutate(tailorFromMatch({ matchId, cvId: sourceCvId, fresh: true }), {
            onSuccess: (freshDraft) => nav(`/app/tailor/${freshDraft.id}`, { replace: true }),
          })}
        >
          Create fresh draft
        </Button>
      ) : (
        <>
          <p className="mt-1">Paste the job description again to create a fresh draft.</p>
          <ButtonLink to="/app/match" state={recoveryState} size="sm" variant="secondary" className="mt-2">
            Start a fresh draft
          </ButtonLink>
        </>
      ))}
      {regenerate.isError && (
        <p role="alert" className="mt-2">
          {regenerate.error instanceof ApiError ? regenerate.error.message : 'Could not create a fresh draft. Please try again.'}
        </p>
      )}
    </div>
  );
}

// Review progress is kept for this browser tab, so a refresh or a wrong click does not throw the work away.
// It only ever holds the user's own decisions; what may be applied is still re-checked against the source CV.
interface ReviewProgress {
  decisions: Record<string, Decision>;
  edits: Record<string, string>;
  confirmed: boolean;
}
const progressKey = (draftId: string) => `${TAILOR_REVIEW_PREFIX}${draftId}`;

function loadProgress(draftId: string): ReviewProgress {
  const empty: ReviewProgress = { decisions: {}, edits: {}, confirmed: false };
  try {
    const saved = JSON.parse(sessionStorage.getItem(progressKey(draftId)) ?? 'null') as Partial<ReviewProgress> | null;
    const isRecord = (v: unknown): v is Record<string, never> => !!v && typeof v === 'object' && !Array.isArray(v);
    return saved && isRecord(saved.decisions) && isRecord(saved.edits)
      ? { decisions: saved.decisions, edits: saved.edits, confirmed: saved.confirmed === true }
      : empty;
  } catch {
    return empty;
  }
}

function storeProgress(draftId: string, progress: ReviewProgress | null) {
  try {
    if (progress) sessionStorage.setItem(progressKey(draftId), JSON.stringify(progress));
    else sessionStorage.removeItem(progressKey(draftId));
  } catch {
    /* storage unavailable: the review simply is not remembered */
  }
}

/** After saving: the three things a person does next with a tailored CV, in one place. */
function TailoredSaved({ cv, draft, previousScore, canDownload, downloading, onDownload }: {
  cv: Pick<Cv, 'id' | 'name'>;
  draft: TailorDraft;
  previousScore?: number;
  canDownload: boolean;
  downloading: boolean;
  onDownload: () => void;
}) {
  const nav = useNavigate();
  const run = useRunMatch();
  const post = jobPosts.get(draft.matchId ?? undefined);
  const application = new URLSearchParams({
    company: draft.company ?? '',
    jobTitle: draft.jobTitle,
    ...(draft.jobUrl ? { jobUrl: draft.jobUrl } : {}),
    cvId: cv.id,
  }).toString();
  const recheck = () => {
    if (!post || run.isPending) return;
    run.mutate(
      { cvId: cv.id, jobTitle: draft.jobTitle, jobDescription: post, company: draft.company || undefined, jobUrl: draft.jobUrl || undefined },
      {
        onSuccess: (m) => {
          jobPosts.remember(m.id, post);
          nav(`/app/match/${m.id}`, { state: { previousScore } });
        },
      },
    );
  };
  return (
    <section aria-labelledby="saved-h" className="mx-auto max-w-[640px] rounded-3xl border border-st-offer bg-surface p-6 sm:p-8">
      <h2 id="saved-h" className="font-display text-2xl font-semibold break-words">{cv.name} is saved</h2>
      <p className="mt-2 text-soft">
        It is in My CVs as a new version. Your original CV has not changed.
      </p>
      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <ButtonLink to={`/app/applications/new?${application}`}>Add to Applications</ButtonLink>
        <Button variant="secondary" disabled={!canDownload} loading={downloading} onClick={onDownload}>
          {downloading ? 'Preparing PDF…' : 'Download PDF'}
        </Button>
        {post && (
          <Button variant="secondary" loading={run.isPending} onClick={recheck}>
            {run.isPending ? 'Checking…' : 'Re-check my match'}
          </Button>
        )}
        <ButtonLink to="/app/cvs" variant="ghost">Go to My CVs</ButtonLink>
      </div>
      {post && (
        <p className="mt-3 text-[13px] text-soft">
          Re-check compares this new version with the same job post{typeof previousScore === 'number' ? ` (it was ${previousScore}% before)` : ''}.
        </p>
      )}
      {run.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {run.error instanceof ApiError ? run.error.message : 'Could not check the match. Please try again.'}
        </p>
      )}
    </section>
  );
}

/** The single review UI for both entry paths. Never assumes a match exists. */
function TailorReview({ draft, back, hideHeaderBack }: { draft: TailorDraft; back: Back; hideHeaderBack?: boolean }) {
  const nav = useNavigate();
  const toast = useToast();
  const cvs = useCvs();
  const sourceQuery = useCv(draft.sourceCvId);
  // The match report already knows what the job asks for and what the CV shows: no extra AI call.
  const match = useMatch(draft.matchId ?? undefined);
  const create = useCreateCv();
  const [initial] = useState(() => loadProgress(draft.id));
  const [decisions, setDecisions] = useState<Record<string, Decision>>(initial.decisions);
  const [edits, setEdits] = useState<Record<string, string>>(initial.edits);
  const [confirmed, setConfirmed] = useState(initial.confirmed);
  const [saved, setSaved] = useState<Pick<Cv, 'id' | 'name'> | null>(null);
  useEffect(() => {
    storeProgress(draft.id, saved ? null : { decisions, edits, confirmed });
  }, [draft.id, saved, decisions, edits, confirmed]);
  const [sourceRejected, setSourceRejected] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [view, setView] = useState<'Tailored' | 'Original'>('Tailored');
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [downloadError, setDownloadError] = useState('');
  const downloadRequest = useRef<AbortController | null>(null);
  const saving = useRef(false);

  // The detail query refreshes on mount. Don't apply against cached CV data before it returns.
  const checkingSource = !sourceQuery.isFetchedAfterMount && sourceQuery.isFetching;
  const source = !checkingSource && sourceQuery.data?.id === draft.sourceCvId && !sourceQuery.isError
    ? sourceQuery.data
    : undefined;
  const incompatible = (draft.sourceCvRevision !== null
    && (typeof draft.sourceCvRevision !== 'string' || !draft.sourceCvRevision.trim()))
    || (!!source && !source.contentRevision);
  const sourceIsCurrent = !incompatible && !sourceRejected && !!draft.sourceCvRevision && source?.contentRevision === draft.sourceCvRevision;
  const refetchSource = sourceQuery.refetch;
  const rejectSource = useCallback(() => {
    setSourceRejected(true);
    setConfirmed(false);
    void refetchSource();
  }, [refetchSource]);
  const defaultName = `${draft.company || draft.jobTitle} v${(cvs.data?.filter((cv) => cv.company === draft.company).length ?? 0) + 1}`;
  const versionName = name?.trim() || defaultName;
  const suggestions = useMemo(
    () => source ? draft.suggestions.map((suggestion) =>
      reviewSuggestion(suggestion, source.content, sourceIsCurrent, edits[suggestion.id] ?? defaultText(suggestion), decisions[suggestion.id]),
    ) : [],
    [source, sourceIsCurrent, draft.suggestions, edits, decisions],
  );
  const result = useMemo(
    () => sourceIsCurrent && source ? applySuggestions(source.content, suggestions) : null,
    [sourceIsCurrent, source, suggestions],
  );
  const tailoredPreview = view === 'Tailored' ? result : null;
  const appliedCount = suggestions.filter((suggestion) => suggestion.applied).length;
  const skippedCount = Object.values(draft.proposalStats?.rejected ?? {}).reduce((sum, n) => sum + n, 0);
  // One confirmation covers the review session: it is given by the user, for wording the user approves, and is
  // withdrawn only when the source CV stops being verifiable (result becomes null, or the server rejects it).
  const agree = !!result && confirmed;
  const pending = suggestions.filter((s) => !s.blocked && !s.applied && s.status === 'Needs review'
    && (!isEditable(s) || !!s.text.trim()));
  const applyAll = () => setDecisions((current) => ({
    ...current, ...Object.fromEntries(pending.map((s) => [s.id, { acceptedText: s.text }])),
  }));
  const edit = (id: string, text: string) => {
    setEdits((current) => ({ ...current, [id]: text }));
    // Wording the user already approved stays approved while they refine it: they are the author of the edit.
    setDecisions((current) => (typeof current[id] === 'object' ? { ...current, [id]: { acceptedText: text } } : current));
  };

  useEffect(() => {
    if (!sourceIsCurrent) setDownloadStatus('idle');
    return () => downloadRequest.current?.abort();
  }, [sourceIsCurrent]);

  const download = async () => {
    if (!agree || !result || downloadRequest.current) return;
    const controller = new AbortController();
    downloadRequest.current = controller;
    setDownloadStatus('loading');
    try {
      // Render the content reviewed at click time, independently of the visible preview.
      const blob = await fetchCvPreviewPdf(result, controller.signal, draft.id);
      if (controller.signal.aborted) return;
      const filename = versionName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'Tailored_CV';
      downloadBlob(blob, `${filename}.pdf`);
      setDownloadStatus('idle');
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error instanceof ApiError && error.status === 409) rejectSource();
        else {
          setDownloadError(error instanceof ApiError ? error.message : 'Could not download the tailored PDF. Try again.');
          setDownloadStatus('error');
        }
      }
    } finally {
      downloadRequest.current = null;
    }
  };

  const save = () => {
    if (!agree || !result || saving.current || create.isPending) return;
    saving.current = true;
    create.mutate(
      {
        kind: 'tailored',
        name: versionName,
        jobTitle: draft.jobTitle,
        company: draft.company,
        matchId: draft.matchId,
        sourceCvId: draft.sourceCvId,
        tailorDraftId: draft.id,
        content: result,
      },
      {
        onSuccess: (cv) => {
          toast({ text: `${cv.name} saved to My CVs.` });
          setSaved({ id: cv.id, name: cv.name });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409) rejectSource();
          else toast({ text: error instanceof ApiError ? error.message : 'Could not save your CV.', tone: 'error' });
        },
        onSettled: () => { saving.current = false; },
      },
    );
  };

  return (
    <>
      <PageHeader
        back={hideHeaderBack ? undefined : back}
        title={`Tailor your CV for ${draft.company || draft.jobTitle}`}
        subtitle={`${draft.jobTitle} · based on ${source?.name ?? 'your CV'}`}
      />

      {saved ? (
        <TailoredSaved
          cv={saved}
          draft={draft}
          previousScore={match.data && (match.data.scoreAvailable ?? true) ? match.data.score : undefined}
          canDownload={agree}
          downloading={downloadStatus === 'loading'}
          onDownload={() => void download()}
        />
      ) : !source ? (
        sourceQuery.isLoading || checkingSource ? (
          <TailorLoading message="Checking the original CV…" />
        ) : (
          <EmptyState
            title={sourceQuery.error instanceof ApiError && sourceQuery.error.status === 404
              ? 'Original CV not found' : 'Could not verify the source CV'}
            text="Return to My CVs to check that the source is available."
            action={<ButtonLink to="/app/cvs">Go to My CVs</ButtonLink>}
          />
        )
      ) : (
        <>
          {!sourceIsCurrent && <DraftRecovery draft={draft} incompatible={incompatible} />}
          <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="min-w-0">
              <header className="mb-3 flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h2 className="text-base font-semibold">AI suggestions</h2>
                <p className="ml-auto text-sm text-soft" aria-live="polite">
                  {appliedCount} of {suggestions.length} suggestions applied
                </p>
                {pending.length > 1 && (
                  <Button size="sm" variant="secondary" onClick={applyAll}>Apply all {pending.length}</Button>
                )}
              </header>
              <div className="flex min-w-0 flex-col gap-3">
                {match.data && <JobRequirements match={match.data} />}
                {suggestions.length === 0 && (
                  <Card>
                    <p role="status" className="font-medium">No meaningful improvements found.</p>
                    <p className="mt-1 text-sm text-soft">
                      Your CV already reads well for this job. You can still preview, download or save it below.
                    </p>
                  </Card>
                )}
                {skippedCount > 0 && (
                  <p className="text-[13px] text-soft">
                    Some proposed changes couldn’t be verified against your CV and were skipped.
                  </p>
                )}
                {suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onEdit={(text) => edit(suggestion.id, text)}
                    onDecide={(decision) => setDecisions((current) => ({ ...current, [suggestion.id]: decision }))}
                  />
                ))}

                {!!draft.missingQualifications?.length && (
                  <Card>
                    <h3 className="mb-2 text-sm font-semibold">Requirements not evidenced in your CV</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm break-words text-soft">
                      {draft.missingQualifications.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  </Card>
                )}
                {!!draft.questions?.length && (
                  <Card>
                    <h3 className="mb-2 text-sm font-semibold">Questions that could strengthen this CV</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm break-words text-soft">
                      {draft.questions.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                    <p className="mt-2 text-[13px] text-soft">
                      If an answer is yes, add it to your original CV in your own words, then tailor again. FlowJob never
                      adds experience you have not written yourself.
                    </p>
                  </Card>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-3 lg:sticky lg:top-20">
              <div className="order-2 ml-auto shrink-0">
                <Segmented
                  label="Preview"
                  options={sourceIsCurrent ? ['Tailored', 'Original'] : ['Original']}
                  value={sourceIsCurrent ? view : 'Original'}
                  onChange={setView}
                />
              </div>
              <TailorPreview
                key={tailoredPreview ? draft.id : `original:${source.contentRevision}`}
                content={tailoredPreview ?? source.content}
                draftId={tailoredPreview ? draft.id : undefined}
                cvId={tailoredPreview ? undefined : source.id}
                onSourceRejected={rejectSource}
              />
            </div>
          </div>

          <div className="mt-8 grid gap-3 rounded-3xl border border-line bg-surface p-4 shadow-lg">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="New CV name"
                className="min-w-0 flex-[1_1_14rem]"
                value={name ?? defaultName}
                onChange={(event) => setName(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="ghost" disabled={create.isPending} onClick={() => nav(back.to)}>
                  Discard
                </Button>
                <Button
                  variant="secondary"
                  disabled={!agree}
                  loading={sourceIsCurrent && downloadStatus === 'loading'}
                  onClick={() => void download()}
                >
                  {sourceIsCurrent && downloadStatus === 'loading' ? 'Preparing PDF…' : 'Download tailored PDF'}
                </Button>
                <Button disabled={!agree} loading={create.isPending} onClick={save}>
                  Save as new CV
                </Button>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={agree}
                disabled={!result}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 size-[18px] shrink-0 accent-primary"
              />
              I checked this CV and everything in it is true
            </label>
            {sourceIsCurrent && downloadStatus === 'loading' && <p role="status" className="sr-only">Preparing tailored PDF</p>}
            {sourceIsCurrent && downloadStatus === 'error' && <p role="alert" className="text-sm text-danger">{downloadError}</p>}
          </div>
        </>
      )}
    </>
  );
}
