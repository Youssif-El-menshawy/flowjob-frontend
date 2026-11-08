import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchCvPdfBlob, useCreateCv, useCvs, useProfile, useUpdateCv } from '@/shared/api/queries';
import type { Cv, CvContent, Education, Experience, Project } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn, downloadBlob, fmtRelative } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Card, EmptyState, Note, PageHeader } from '@/shared/ui/Display';
import { Input, Textarea } from '@/shared/ui/Field';
import { useToast } from '@/shared/ui/Overlay';
import { PageLoader } from '@/shared/ui/Spinner';
import { blank, ItemEditor, SkillsEditor, type Kind } from '@/features/profile/profileParts';
import { CvLivePreview, type CvPreviewHandle } from './CvLivePreview';

const STEPS = [
  { id: 'personal', label: 'Personal' },
  { id: 'summary', label: 'Summary' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
] as const;

function Editor({ cv }: { cv: Cv }) {
  const toast = useToast();
  const update = useUpdateCv();
  const [c, setC] = useState<CvContent>(() => structuredClone(cv.content));
  const [name, setName] = useState(cv.name);
  const [step, setStep] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const previewRef = useRef<CvPreviewHandle>(null);
  // Navigation refreshes the Harvard preview only when the content is actually stale,
  // so rapid Next/Back (or jumping steps) without edits makes zero PDF requests.
  const goToStep = (i: number) => {
    setStep(i);
    previewRef.current?.updateIfStale();
  };
  const [editing, setEditing] = useState<{
    kind: Kind;
    item: Experience | Education | Project;
    isNew: boolean;
  } | null>(null);
  const dirty = useMemo(
    () => JSON.stringify(c) !== JSON.stringify(cv.content) || name !== cv.name,
    [c, cv, name],
  );
  const set = <K extends keyof CvContent>(k: K, v: CvContent[K]) => setC((x) => ({ ...x, [k]: v }));
  const cur = STEPS[step].id;

  const saveCv = () =>
    update.mutate(
      { id: cv.id, name, content: c },
      {
        onSuccess: () => {
          toast({ text: 'CV saved.' });
          // Refresh the preview only if it no longer matches what was saved (deduped).
          previewRef.current?.updateIfStale();
        },
        onError: () => toast({ text: 'Could not save your CV.', tone: 'error' }),
      },
    );

  // Download the real backend Harvard PDF. Save first so the file matches what's on screen.
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      if (dirty) await update.mutateAsync({ id: cv.id, name, content: c });
      const blob = await fetchCvPdfBlob(cv.id);
      downloadBlob(blob, `${name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'CV'}.pdf`);
    } catch {
      toast({ text: 'Could not generate the PDF.', tone: 'error' });
    } finally {
      setPdfBusy(false);
    }
  };

  const items = (kind: Kind) => {
    const list = c[kind] as Array<Experience & Education & Project>;
    return (
      <div className="flex flex-col gap-2.5">
        {list.map((it) => (
          <div
            key={it.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{it.title || it.degree || it.name}</p>
              <p className="truncate text-sm text-soft">{it.company || it.school || it.tech}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing({ kind, item: it, isNew: false })}>
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                onClick={() => set(kind, list.filter((x) => x.id !== it.id) as never)}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
        <Button variant="secondary" onClick={() => setEditing({ kind, item: blank[kind](), isNew: true })}>
          + Add {kind === 'projects' ? 'project' : kind}
        </Button>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="CV builder"
        subtitle={
          <>
            {cv.kind === 'original' ? 'Original CV' : `${cv.name}, tailored for ${cv.company}`} ·{' '}
            {dirty ? 'unsaved changes' : `saved ${fmtRelative(cv.updatedAt)}`}
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={downloadPdf} loading={pdfBusy}>
              Download PDF
            </Button>
            <Button onClick={saveCv} loading={update.isPending} disabled={!dirty}>
              Save CV
            </Button>
          </>
        }
      />
      <ol className="mb-6 flex gap-1.5 overflow-x-auto pb-1" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className="min-w-[110px] flex-1">
            <button
              onClick={() => goToStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={cn(
                'w-full rounded-full px-4 py-2.5 text-left text-sm font-medium transition-colors',
                i === step
                  ? 'bg-accent text-[#1c2b22]'
                  : i < step
                    ? 'bg-primary text-on-primary'
                    : 'bg-side text-soft hover:text-ink',
              )}
            >
              {i < step ? '✓ ' : `${i + 1}. `}
              {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Card key={cur} className="flex flex-col gap-5 animate-in">
          <h2 className="text-xl font-semibold">{STEPS[step].label}</h2>
          {cur === 'personal' && (
            <>
              <Input
                label="CV name"
                hint="Only you see this."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Full name"
                  value={c.fullName}
                  onChange={(e) => set('fullName', e.target.value)}
                />
                <Input label="Email" value={c.email} onChange={(e) => set('email', e.target.value)} />
                <Input
                  label="Phone"
                  optional
                  value={c.phone}
                  onChange={(e) => set('phone', e.target.value)}
                />
                <Input label="City" value={c.location} onChange={(e) => set('location', e.target.value)} />
              </div>
              <Input
                label="Links"
                optional
                value={c.links.join(', ')}
                onChange={(e) =>
                  set(
                    'links',
                    e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
              />
            </>
          )}
          {cur === 'summary' && (
            <Textarea
              label="Summary"
              rows={5}
              hint="Two or three sentences. Say what you do and what you want next."
              value={c.summary}
              onChange={(e) => set('summary', e.target.value)}
            />
          )}
          {cur === 'experience' && items('experience')}
          {cur === 'education' && items('education')}
          {cur === 'projects' && items('projects')}
          {cur === 'skills' && (
            <>
              <SkillsEditor skills={c.skills} onChange={(s) => set('skills', s)} />
              <Input
                label="Languages"
                optional
                value={c.languages}
                onChange={(e) => set('languages', e.target.value)}
              />
            </>
          )}
          <Note>Changes here only affect this CV, not your profile.</Note>
          <div className="flex justify-between gap-3">
            <Button variant="secondary" disabled={step === 0} onClick={() => goToStep(step - 1)}>
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => goToStep(step + 1)}>Next: {STEPS[step + 1].label}</Button>
            ) : (
              <Button onClick={saveCv} loading={update.isPending} disabled={!dirty}>
                Save CV
              </Button>
            )}
          </div>
        </Card>
        <div className="xl:sticky xl:top-8">
          <CvLivePreview ref={previewRef} content={c} />
        </div>
      </div>
      {editing && (
        <ItemEditor
          kind={editing.kind}
          item={editing.item}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            const list = c[editing.kind] as Array<{ id: string }>;
            set(
              editing.kind,
              (list.some((x) => x.id === item.id)
                ? list.map((x) => (x.id === item.id ? item : x))
                : [...list, item]) as never,
            );
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

export default function CvBuilderPage() {
  useDocumentTitle('CV builder');
  const { cvId } = useParams();
  const nav = useNavigate();
  const cvs = useCvs();
  const profile = useProfile();
  const create = useCreateCv();
  const cv = cvId ? cvs.data?.find((x) => x.id === cvId) : cvs.data?.find((x) => x.kind === 'original');

  useEffect(() => {
    if (cvId && cvs.data && !cv) nav('/app/cvs', { replace: true });
  }, [cvId, cvs.data, cv, nav]);

  if (cvs.isLoading || profile.isLoading) return <PageLoader />;
  if (cv) return <Editor key={cv.id} cv={cv} />;

  const hasProfile =
    !!profile.data && (profile.data.experience.length > 0 || profile.data.summary.length > 0);
  return (
    <>
      <PageHeader
        title="CV builder"
        subtitle="Build one strong CV. You can tailor copies of it for each job later."
      />
      <EmptyState
        title="Let’s make your first CV"
        text={
          hasProfile
            ? 'We can start from your profile so most of it is already filled in.'
            : 'We will guide you section by section. It takes about ten minutes.'
        }
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <Button
              loading={create.isPending}
              onClick={() => create.mutate({ kind: 'original', name: 'Original CV' })}
            >
              {hasProfile ? 'Start from my profile' : 'Start my CV'}
            </Button>
            {!hasProfile && (
              <Link
                to="/app/profile"
                className="inline-flex min-h-11 items-center px-3 font-medium text-primary hover:underline"
              >
                Fill in my profile first
              </Link>
            )}
          </div>
        }
      />
    </>
  );
}
