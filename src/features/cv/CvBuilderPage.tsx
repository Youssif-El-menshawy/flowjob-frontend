import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { fetchCvPdfBlob, useCreateCv, useCvs, useProfile, useUpdateCv } from '@/shared/api/queries';
import type { Cv, CvContent } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { downloadBlob, fmtRelative } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { EmptyState, PageHeader } from '@/shared/ui/Display';
import { Modal, useToast } from '@/shared/ui/Overlay';
import { PageLoader } from '@/shared/ui/Spinner';
import { CvLivePreview, type CvPreviewHandle } from './CvLivePreview';
import { CvSelector } from './CvSelector';
import { useContactLinks } from '@/features/profile/ContactLinksFields';
import { usePhoneField } from '@/features/profile/PhoneFields';
import { CvSectionFields, CvSectionTabs, type Section, useSectionIds } from './CvForm';

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
  const { tabId, panelId } = useSectionIds();
  // Refresh on section changes only when the PDF no longer matches the form.
  const goToSection = (value: Section) => {
    if (value === section) return;
    setSection(value);
    previewRef.current?.updateIfStale();
  };
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
      <CvSectionTabs section={section} onSelect={goToSection} tabId={tabId} panelId={panelId} />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <CvSelector cvs={cvs} value={cv.id} onSelect={requestSwitch} disabled={update.isPending || !!pendingId} />
          <div id={panelId} role="tabpanel" aria-labelledby={tabId(section)}>
            <CvSectionFields
              section={section}
              content={c}
              set={set}
              contact={contact}
              phoneField={phoneField}
              name={name}
              onNameChange={setName}
            />
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
