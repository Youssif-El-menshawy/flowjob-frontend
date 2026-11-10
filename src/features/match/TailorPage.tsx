import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { fetchCvPreviewPdf, useCreateCv, useCv, useCvs, useTailor, useTailorDraft } from '@/shared/api/queries';
import { TAILORING_BACKEND_INCOMPATIBLE } from '@/shared/api/tailoring';
import type { CvContent, TailorDraft } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn, downloadBlob } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, PageHeader, Segmented } from '@/shared/ui/Display';
import { Input, Textarea } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Overlay';
import { Skeleton } from '@/shared/ui/Spinner';
import { HarvardPdfViewer } from '@/features/cv/HarvardPdfViewer';
import { createPreviewEngine, type PreviewState } from '@/features/cv/cvPreview';
import { applySuggestions, reviewSuggestion, type Decision, type ReviewedSuggestion } from './tailorReview';

const SECTION: Record<string, string> = {
  summary: 'Summary',
  experience: 'Experience',
  skills: 'Skills',
  project: 'Project',
};

function SuggestionCard({ suggestion, onEdit, onDecide }: {
  suggestion: ReviewedSuggestion;
  onEdit: (text: string) => void;
  onDecide: (decision: Decision) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
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
          <span className="font-semibold">{SECTION[suggestion.section] ?? suggestion.section}</span>
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
        <span className="line-clamp-2 text-sm break-words text-soft">
          {suggestion.explanation || 'Compare the suggested wording with your original CV.'}
        </span>
        {suggestion.needsReview && (
          <span className="text-xs font-semibold text-accent-ink">{suggestion.blocked ? 'This suggestion cannot be matched to the verified source.' : 'Verify against your original CV before applying.'}</span>
        )}
      </button>
      <div id={detailsId} hidden={!expanded}>
        {expanded && (
          <div className="grid gap-3 border-t border-line px-4 py-4">
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
            <div className="flex flex-wrap gap-2" role="group" aria-label="Suggestion decision">
              <Button
                size="sm"
                variant={suggestion.applied ? 'primary' : 'secondary'}
                aria-pressed={suggestion.applied}
                disabled={suggestion.blocked || !suggestion.text.trim()}
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
            </div>
          </div>
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

  const start = () => tailor.mutate({ matchId }, {
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
          onClick={() => regenerate.mutate({ matchId, cvId: sourceCvId, fresh: true }, {
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

/** The single review UI for both entry paths. Never assumes a match exists. */
function TailorReview({ draft, back, hideHeaderBack }: { draft: TailorDraft; back: Back; hideHeaderBack?: boolean }) {
  const nav = useNavigate();
  const toast = useToast();
  const cvs = useCvs();
  const sourceQuery = useCv(draft.sourceCvId);
  const create = useCreateCv();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<CvContent | null>(null);
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
    setConfirmed(null);
    void refetchSource();
  }, [refetchSource]);
  const defaultName = `${draft.company || draft.jobTitle} v${(cvs.data?.filter((cv) => cv.company === draft.company).length ?? 0) + 1}`;
  const versionName = name?.trim() || defaultName;
  const suggestions = useMemo(
    () => source ? draft.suggestions.map((suggestion) =>
      reviewSuggestion(suggestion, source.content, sourceIsCurrent, edits[suggestion.id] ?? suggestion.suggested, decisions[suggestion.id]),
    ) : [],
    [source, sourceIsCurrent, draft.suggestions, edits, decisions],
  );
  const result = useMemo(
    () => sourceIsCurrent && source ? applySuggestions(source.content, suggestions) : null,
    [sourceIsCurrent, source, suggestions],
  );
  const tailoredPreview = view === 'Tailored' ? result : null;
  const appliedCount = suggestions.filter((suggestion) => suggestion.applied).length;
  // Confirm the exact reviewed version, so an edit never inherits an earlier confirmation.
  const agree = !!result && result === confirmed;

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
          nav('/app/cvs');
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

      {!source ? (
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
              </header>
              <div className="flex min-w-0 flex-col gap-3">
                {suggestions.length === 0 && (
                  <Card>
                    <p className="text-soft">There are no suggested changes for this draft.</p>
                  </Card>
                )}
                {suggestions.map((suggestion) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onEdit={(text) => setEdits((current) => ({ ...current, [suggestion.id]: text }))}
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
                onChange={(event) => setConfirmed(event.target.checked ? result : null)}
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
