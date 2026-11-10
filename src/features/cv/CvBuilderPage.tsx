import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { fetchCvPdfBlob, useCreateCv, useCvs, useProfile, useUpdateCv } from '@/shared/api/queries';
import type { Cv, CvContent, Education, Experience, Project } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn, downloadBlob, fmtRelative } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Card, EmptyState, PageHeader } from '@/shared/ui/Display';
import { Input, Textarea } from '@/shared/ui/Field';
import { Modal, useToast } from '@/shared/ui/Overlay';
import { PageLoader } from '@/shared/ui/Spinner';
import { blank, ItemEditor, SkillsEditor, type Kind } from '@/features/profile/profileParts';
import { CvLivePreview, type CvPreviewHandle } from './CvLivePreview';
import { CvSelector } from './CvSelector';
import { ContactLinksInputs, useContactLinks } from '@/features/profile/ContactLinksFields';
import { LanguagesEditor } from '@/features/profile/LanguagesEditor';
import { LocationFields } from '@/features/profile/LocationFields';
import { PhoneInputs, usePhoneField } from '@/features/profile/PhoneFields';

const SECTION_LABELS = {
  personal: 'Personal',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  skills: 'Skills',
} as const;
type Section = keyof typeof SECTION_LABELS;
const SECTIONS = Object.keys(SECTION_LABELS) as Section[];

/** Subtitle text from real metadata only. */
function versionLabel(cv: Cv) {
  if (cv.kind === 'original') return 'Original CV';
  const target = cv.company || cv.jobTitle;
  return target ? `${cv.name}, tailored for ${target}` : `${cv.name}, tailored CV`;
}

/**
 * One editor per saved CV (the page keys it by CV id), so form state, the unsaved-changes
 * snapshot and the Harvard preview engine always belong to exactly one CV. Switching CVs
 * navigates to /app/cv-builder/:id, which remounts this component with the new CV's data.
 */
function Editor({
  cv,
  cvs,
  section,
  setSection,
}: {
  cv: Cv;
  cvs: Cv[];
  section: Section;
  setSection: (section: Section) => void;
}) {
  const toast = useToast();
  const nav = useNavigate();
  const update = useUpdateCv();
  const [c, setC] = useState<CvContent>(() => structuredClone(cv.content));
  const [name, setName] = useState(cv.name);
  // Target CV id while the unsaved-changes dialog is open.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const previewRef = useRef<CvPreviewHandle>(null);
  const tabsId = useId();
  const tabId = (value: Section) => `${tabsId}-${value}`;
  const panelId = `${tabsId}-panel`;
  // Refresh on section changes only when the PDF no longer matches the form.
  const goToSection = (value: Section) => {
    if (value === section) return;
    setSection(value);
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
  const contact = useContactLinks(c.links, (l) => set('links', l));
  const phoneField = usePhoneField(c.phone, (v) => set('phone', v));

  // Validates/normalises the contact links first. On a bad link, jump to the Personal section (where the
  // inline error is) instead of saving; nothing is sent.
  const prepareContent = (): CvContent | null => {
    const links = contact.validate();
    const phone = phoneField.validate();
    if (!links || phone === null) {
      setSection('personal');
      toast({ text: 'Please fix the highlighted field first.', tone: 'error' });
      return null;
    }
    return { ...c, links, phone };
  };

  const saveCv = () => {
    const content = prepareContent();
    if (!content) return;
    update.mutate(
      { id: cv.id, name, content },
      {
        onSuccess: () => {
          toast({ text: 'CV saved.' });
          // Refresh the preview only if it no longer matches what was saved (deduped).
          previewRef.current?.updateIfStale();
        },
        onError: (error) => toast({
          text: error instanceof ApiError ? error.message : 'Could not save your CV.',
          tone: 'error',
        }),
      },
    );
  };

  const goToCv = (id: string) => nav(`/app/cv-builder/${id}`);

  const requestSwitch = (id: string) => {
    if (id === cv.id || update.isPending) return;
    if (!dirty) return goToCv(id); // nothing to lose: switch straight away
    setSwitchError(null);
    setPendingId(id);
  };
  const targetCv = pendingId ? cvs.find((x) => x.id === pendingId) : undefined;
  const closeDialog = () => {
    if (update.isPending) return; // never abandon a save that is still running
    setPendingId(null);
    setSwitchError(null);
  };
  const discardAndSwitch = () => {
    // Drops only the local edits; nothing is sent to the backend.
    const id = pendingId;
    setPendingId(null);
    if (id) goToCv(id);
  };
  const saveAndSwitch = async () => {
    const id = pendingId;
    if (!id || update.isPending) return;
    setSwitchError(null);
    const content = prepareContent();
    if (!content) {
      setPendingId(null); // close the dialog so the link error is visible; nothing was saved or switched
      return;
    }
    try {
      // Always this CV's own id; the target's data is never involved until after the save succeeds.
      await update.mutateAsync({ id: cv.id, name, content });
    } catch (error) {
      setSwitchError(error instanceof ApiError
        ? error.message
        : 'Could not save your CV, so nothing was switched. Your changes are still here.');
      // Stay on this CV with every edit intact.
      return;
    }
    toast({ text: 'CV saved.' });
    setPendingId(null);
    goToCv(id);
  };

  // Download the real backend Harvard PDF. Save first so the file matches what's on screen.
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      if (dirty) {
        const content = prepareContent();
        if (!content) return;
        await update.mutateAsync({ id: cv.id, name, content });
      }
      const blob = await fetchCvPdfBlob(cv.id);
      downloadBlob(blob, `${name.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '') || 'CV'}.pdf`);
    } catch (error) {
      toast({ text: error instanceof ApiError ? error.message : 'Could not generate the PDF.', tone: 'error' });
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
            {versionLabel(cv)} ·{' '}
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
      <div role="tablist" aria-label="CV sections" className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((value, index) => {
          const active = value === section;
          return (
            <button
              key={value}
              id={tabId(value)}
              type="button"
              role="tab"
              aria-controls={panelId}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => goToSection(value)}
              onKeyDown={(event) => {
                let next: number;
                switch (event.key) {
                  case 'ArrowRight': next = (index + 1) % SECTIONS.length; break;
                  case 'ArrowLeft': next = (index - 1 + SECTIONS.length) % SECTIONS.length; break;
                  case 'Home': next = 0; break;
                  case 'End': next = SECTIONS.length - 1; break;
                  default: return;
                }
                event.preventDefault();
                goToSection(SECTIONS[next]);
                document.getElementById(tabId(SECTIONS[next]))?.focus();
              }}
              className={cn(
                'min-w-[110px] flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                active ? 'bg-accent text-[#1c2b22]' : 'bg-side text-soft hover:text-ink',
              )}
            >
              {SECTION_LABELS[value]}
            </button>
          );
        })}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <CvSelector cvs={cvs} value={cv.id} onSelect={requestSwitch} disabled={update.isPending || !!pendingId} />
          <div id={panelId} role="tabpanel" aria-labelledby={tabId(section)}>
            <Card key={section} className="flex flex-col gap-5 animate-in">
              <h2 className="text-xl font-semibold">{SECTION_LABELS[section]}</h2>
              {section === 'personal' && (
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
                    <PhoneInputs state={phoneField} className="sm:col-span-2" />
                    <LocationFields value={c.location} onChange={(v) => set('location', v)} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ContactLinksInputs state={contact} />
                  </div>
                </>
              )}
              {section === 'summary' && (
                <Textarea
                  label="Summary"
                  rows={5}
                  hint="Two or three sentences. Say what you do and what you want next."
                  value={c.summary}
                  onChange={(e) => set('summary', e.target.value)}
                />
              )}
              {section === 'experience' && items('experience')}
              {section === 'education' && items('education')}
              {section === 'projects' && items('projects')}
              {section === 'skills' && (
                <>
                  <SkillsEditor skills={c.skills} onChange={(s) => set('skills', s)} />
                  <LanguagesEditor value={c.languages} onChange={(v) => set('languages', v)} />
                </>
              )}
            </Card>
          </div>
        </div>
        <div className="min-w-0 xl:sticky xl:top-8">
          <CvLivePreview ref={previewRef} content={c} cvId={cv.id} />
        </div>
      </div>
      <Modal
        open={!!pendingId}
        onClose={closeDialog}
        title="Unsaved changes"
        size="confirm"
        iconClose
        stackFooter
        dismissOnBackdrop={false}
        icon={
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#fbebc6] text-[#7a4f00]" aria-hidden>
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3.5 2.5 20h19L12 3.5Z" />
              <path d="M12 10v4.5M12 17.5v.01" />
            </svg>
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={update.isPending} data-autofocus>
              Keep editing
            </Button>
            <Button variant="danger" onClick={discardAndSwitch} disabled={update.isPending}>
              Discard &amp; switch
            </Button>
            <Button onClick={saveAndSwitch} loading={update.isPending}>
              Save &amp; switch
            </Button>
          </>
        }
      >
        <p className="leading-relaxed break-words text-soft">
          You have unsaved changes to <strong className="font-semibold text-ink">“{name || cv.name}”</strong>.
          {targetCv && (
            <>
              {' '}
              Switching to <strong className="font-semibold text-ink">“{targetCv.name}”</strong> will discard them
              unless you save first.
            </>
          )}
        </p>
        {switchError && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {switchError}
          </p>
        )}
      </Modal>
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
  // Keep the selected section when switching to another saved CV.
  const [section, setSection] = useState<Section>('personal');
  const cv = cvId ? cvs.data?.find((x) => x.id === cvId) : cvs.data?.find((x) => x.kind === 'original');

  useEffect(() => {
    if (cvId && cvs.data && !cv) nav('/app/cvs', { replace: true });
  }, [cvId, cvs.data, cv, nav]);

  if (cvs.isLoading || profile.isLoading) return <PageLoader />;
  if (cvs.isError)
    return (
      <>
        <PageHeader title="CV builder" />
        <EmptyState
          title="Could not load your CVs"
          text="Please check your connection and try again."
          action={<Button onClick={() => cvs.refetch()}>Try again</Button>}
        />
      </>
    );
  if (cv) return <Editor key={cv.id} cv={cv} cvs={cvs.data ?? []} section={section} setSection={setSection} />;

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
      {create.isError && (
        <p role="alert" className="mt-3 text-center text-sm text-danger">
          {create.error instanceof ApiError ? create.error.message : 'Could not create your CV. Please try again.'}
        </p>
      )}
    </>
  );
}
