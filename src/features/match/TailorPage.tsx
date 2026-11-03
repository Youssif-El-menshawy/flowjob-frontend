import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreateCv, useCvs, useMatch, useTailor } from '@/shared/api/queries';
import type { CvContent, TailorDraft, TailorSuggestion } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, Note, PageHeader, Segmented } from '@/shared/ui/Display';
import { Input } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Overlay';
import { Skeleton } from '@/shared/ui/Spinner';
import { CvSheet } from '@/features/cv/CvSheet';

function apply(content: CvContent, s: TailorSuggestion[], kept: Record<string, boolean>): CvContent {
  const c = structuredClone(content);
  for (const x of s) {
    if (!kept[x.id]) continue;
    if (x.section === 'summary') c.summary = x.suggested;
    if (x.section === 'skills') c.skills = x.suggested.split(',').map((t) => t.trim());
    if (x.section === 'experience') {
      const e = c.experience.find((y) => y.id === x.experienceId);
      if (e && x.bulletIndex !== undefined) e.bullets[x.bulletIndex] = x.suggested;
    }
  }
  return c;
}

const SECTION = { summary: 'Summary', experience: 'Experience', skills: 'Skills order' };

export default function TailorPage() {
  useDocumentTitle('Tailor CV');
  const { matchId } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const match = useMatch(matchId);
  const cvs = useCvs();
  const tailor = useTailor();
  const create = useCreateCv();
  const [draft, setDraft] = useState<TailorDraft | null>(null);
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState('');
  const [view, setView] = useState<'Tailored' | 'Original'>('Tailored');
  const started = useRef(false);

  useEffect(() => {
    if (!matchId || started.current) return;
    started.current = true;
    tailor.mutate(matchId, {
      onSuccess: (d) => {
        setDraft(d);
        setKept(Object.fromEntries(d.suggestions.map((s) => [s.id, true])));
      },
    });
  }, [matchId, tailor]);

  const source = cvs.data?.find((c) => c.id === draft?.sourceCvId);
  useEffect(() => {
    if (!draft || !cvs.data || name) return;
    const n = cvs.data.filter((c) => c.company === draft.company).length + 1;
    setName(`${draft.company} v${n}`);
  }, [draft, cvs.data, name]);
  const result = useMemo(
    () => (source && draft ? apply(source.content, draft.suggestions, kept) : null),
    [source, draft, kept],
  );
  const keptCount = Object.values(kept).filter(Boolean).length;

  if (tailor.isError)
    return (
      <EmptyState
        title="Could not tailor this CV"
        text="Please go back to your match result and try again."
        action={<ButtonLink to={`/app/match/${matchId}`}>Back to match</ButtonLink>}
      />
    );

  const save = () => {
    if (!result || !draft) return;
    create.mutate(
      {
        kind: 'tailored',
        name: name || `${draft.company} v1`,
        jobTitle: draft.jobTitle,
        company: draft.company,
        matchId: draft.matchId,
        content: result,
      },
      {
        onSuccess: (cv) => {
          toast({ text: `${cv.name} saved to My CVs.` });
          nav('/app/cvs');
        },
      },
    );
  };

  return (
    <>
      <PageHeader
        back={{ to: `/app/match/${matchId}`, label: 'Back to match result' }}
        title={match.data ? `Tailor your CV for ${match.data.company}` : 'Tailor your CV'}
        subtitle={match.data ? `${match.data.jobTitle} · based on ${source?.name ?? 'your CV'}` : undefined}
        actions={
          <ol className="flex gap-1.5 text-[13px] font-medium" aria-label="Progress">
            <li className="rounded-full bg-primary px-3 py-1.5 text-on-primary">✓ Generate</li>
            <li aria-current="step" className="rounded-full bg-accent px-3 py-1.5 text-[#1c2b22]">
              Review
            </li>
            <li className="rounded-full bg-side px-3 py-1.5 text-soft">Save or export</li>
          </ol>
        }
      />

      {!draft || !result ? (
        <div className="grid gap-6 lg:grid-cols-2" aria-live="polite">
          <Card className="flex flex-col gap-4">
            <p className="font-medium">Writing focused suggestions for this job…</p>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </Card>
          <Skeleton className="h-[480px] rounded-md" />
        </div>
      ) : (
        <>
          <Note tone="accent" className="mb-6 flex flex-wrap justify-between gap-2 animate-in">
            <span>This is a draft. Your original CV will not change.</span>
            <span className="font-medium">
              {keptCount} of {draft.suggestions.length} suggestions kept
            </span>
          </Note>
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
            <div className="flex flex-col gap-3">
              {draft.suggestions.length === 0 && (
                <Card>
                  <p className="text-soft">
                    Your CV already fits this job well. There is nothing we would change.
                  </p>
                </Card>
              )}
              {draft.suggestions.map((s, i) => (
                <Card
                  as="article"
                  key={s.id}
                  className={cn('p-5 transition-colors animate-in', kept[s.id] ? 'border-st-offer' : '')}
                  style={{ animationDelay: `${i * 0.06}s` }}
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold tracking-wide text-soft uppercase">
                      {SECTION[s.section]}
                    </span>
                    <Segmented
                      label="Keep or undo"
                      options={['Keep', 'Undo'] as const}
                      value={kept[s.id] ? 'Keep' : 'Undo'}
                      onChange={(v) => setKept((k) => ({ ...k, [s.id]: v === 'Keep' }))}
                    />
                  </div>
                  <p className="text-sm text-soft line-through decoration-soft/50">
                    {s.original || '(empty)'}
                  </p>
                  <p
                    className={cn(
                      'mt-2 rounded-lg px-3 py-2 text-[15px] leading-relaxed transition-colors',
                      kept[s.id] ? 'bg-success-bg' : 'bg-side text-soft',
                    )}
                  >
                    {s.suggested}
                  </p>
                </Card>
              ))}
            </div>
            <div className="lg:sticky lg:top-8">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-soft">Preview</p>
                <Segmented
                  label="Preview"
                  options={['Tailored', 'Original'] as const}
                  value={view}
                  onChange={setView}
                />
              </div>
              <CvSheet
                key={view}
                cv={view === 'Tailored' ? result : source!.content}
                className={cn('animate-in', view === 'Tailored' && 'print-area')}
              />
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
            <Button variant="ghost" onClick={() => nav(`/app/match/${matchId}`)}>
              Discard
            </Button>
            <Button
              variant="secondary"
              disabled={!agree}
              onClick={() => {
                setView('Tailored');
                setTimeout(() => window.print(), 50);
              }}
            >
              Export PDF
            </Button>
            <Button disabled={!agree} loading={create.isPending} onClick={save}>
              Save as new version
            </Button>
          </div>
        </>
      )}
    </>
  );
}
