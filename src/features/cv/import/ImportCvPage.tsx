import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { importCvPdf, useCreateCv } from '@/shared/api/queries';
import type { CvContent, CvImportResult } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, Note, PageHeader } from '@/shared/ui/Display';
import { ConfirmDialog, useToast } from '@/shared/ui/Overlay';
import { Spinner } from '@/shared/ui/Spinner';
import { useContactLinks } from '@/features/profile/ContactLinksFields';
import { usePhoneField } from '@/features/profile/PhoneFields';
import { CvLivePreview } from '../CvLivePreview';
import { CvSectionFields, CvSectionTabs, SECTION_LABELS, type Section, useSectionIds } from '../CvForm';
import {
  checkCvPdf,
  countBySection,
  describeImportError,
  describeWarning,
  type ImportFailure,
  MISSING_LABEL,
} from './importHelpers';

// Smart CV Import. Everything stays in this page's memory: the chosen file, the backend's result and the user's
// edits are never written to browser storage, and leaving the page drops them. Only "Save as new CV" (after the
// user confirms the information) sends anything to be stored, through the existing POST /cvs.

type Stage =
  | { name: 'choose' }
  | { name: 'importing'; controller: AbortController }
  | { name: 'failed'; failure: ImportFailure }
  | { name: 'review'; result: CvImportResult };

export default function ImportCvPage() {
  useDocumentTitle('Import CV');
  const [stage, setStage] = useState<Stage>({ name: 'choose' });
  const [notice, setNotice] = useState('');

  const start = async (file: File) => {
    const controller = new AbortController();
    setNotice('');
    setStage({ name: 'importing', controller });
    try {
      const result = await importCvPdf(file, controller.signal);
      setStage({ name: 'review', result });
    } catch (error) {
      if (controller.signal.aborted) return;
      setStage({ name: 'failed', failure: describeImportError(error) });
    }
  };

  if (stage.name === 'review') return <Review result={stage.result} />;
  return (
    <>
      <PageHeader
        title="Import your CV"
        subtitle="Upload your CV as a PDF. You review everything before a new CV is saved."
      />
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        {stage.name === 'importing' ? (
          <Card className="flex flex-col items-center gap-4 py-10 text-center" aria-busy="true">
            <Spinner className="size-7 text-primary" />
            <div role="status">
              <p className="font-medium">Reading your PDF and organizing it…</p>
              <p className="mt-1 text-sm text-soft">This usually takes 20 to 60 seconds.</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                stage.controller.abort();
                setNotice('Import cancelled. If the CV was already being organized, it still counts toward today’s imports.');
                setStage({ name: 'choose' });
              }}
            >
              Cancel
            </Button>
          </Card>
        ) : (
          <>
            {stage.name === 'failed' && (
              <div role="alert" className="rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4">
                <p className="font-semibold text-danger">{stage.failure.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-ink">{stage.failure.message}</p>
                <p className="mt-2 text-sm">
                  <Link to="/app/cv-builder" className="font-medium text-primary hover:underline">
                    Create your CV manually instead
                  </Link>
                </p>
              </div>
            )}
            {notice && <p role="status" className="text-sm text-soft">{notice}</p>}
            <Upload onImport={start} />
          </>
        )}
      </div>
    </>
  );
}

function Upload({ onImport }: { onImport: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [consent, setConsent] = useState(false);
  const [checking, setChecking] = useState(false);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  const choose = async (chosen: File | undefined) => {
    setFile(null);
    setFileError('');
    if (!chosen) return;
    setChecking(true);
    const problem = await checkCvPdf(chosen);
    setChecking(false);
    if (problem) {
      setFileError(problem);
      if (input.current) input.current.value = '';
      return;
    }
    setFile(chosen);
  };

  return (
    <>
      <Card className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">1. Choose your CV</h2>
        <label
          htmlFor={inputId}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-8 text-center hover:bg-tint"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void choose(event.dataTransfer.files[0]);
          }}
        >
          <span className="font-medium">{file ? file.name : 'Choose a PDF or drop it here'}</span>
          <span className="text-sm text-soft">PDF only, up to 5 MB. Scanned (image-only) CVs are not supported.</span>
        </label>
        <input
          ref={input}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="CV PDF file"
          onChange={(event) => void choose(event.target.files?.[0])}
        />
        {checking && <p role="status" className="text-sm text-soft">Checking the file…</p>}
        {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">2. How your CV is used</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-soft">
          <li>FlowJob reads the text of your PDF on its server.</li>
          <li>
            <strong className="font-medium text-ink">The extracted text is sent to OpenAI</strong> to sort it into
            CV sections.
          </li>
          <li>FlowJob does not keep your PDF or its text. Nothing is saved until you review the result and choose
            Save.</li>
          <li>Every value is checked against your PDF. Anything that cannot be confirmed is left out and shown to you,
            and nothing missing is filled in for you.</li>
          <li>You can import up to 5 CVs per day.</li>
        </ul>
        <label className="mt-1 flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-[18px] shrink-0 accent-primary"
          />
          I agree that the text of this CV is sent to OpenAI to organize it.
        </label>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/app/cv-builder" className="text-sm font-medium text-primary hover:underline">
          Create my CV manually instead
        </Link>
        <div className="flex gap-2.5">
          <ButtonLink to="/app/cvs" variant="secondary">Cancel</ButtonLink>
          <Button disabled={!file || !consent || checking} onClick={() => file && onImport(file)}>
            Import CV
          </Button>
        </div>
      </div>
    </>
  );
}

function Review({ result }: { result: CvImportResult }) {
  const toast = useToast();
  const nav = useNavigate();
  const create = useCreateCv();
  const [c, setC] = useState<CvContent>(() => structuredClone(result.content));
  const [name, setName] = useState(() => (result.content.fullName ? `${result.content.fullName} – imported CV` : 'Imported CV'));
  const [section, setSection] = useState<Section>('personal');
  const [confirmed, setConfirmed] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const { tabId, panelId } = useSectionIds();
  const set = <K extends keyof CvContent>(k: K, v: CvContent[K]) => setC((x) => ({ ...x, [k]: v }));
  const contact = useContactLinks(c.links, (l) => set('links', l));
  const phoneField = usePhoneField(c.phone, (v) => set('phone', v));

  const notes = useMemo(() => result.warnings.map(describeWarning), [result.warnings]);
  const counts = useMemo(() => countBySection(result), [result]);
  const missing = useMemo(() => new Set<string>(result.missing), [result.missing]);
  const sectionNotes = notes.filter((note) => note.section === section);

  // Leaving or reloading the page drops the import; ask the browser to warn first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const save = () => {
    const links = contact.validate();
    const phone = phoneField.validate();
    if (!links || phone === null) {
      setSection('personal');
      toast({ text: 'Please fix the highlighted field first.', tone: 'error' });
      return;
    }
    create.mutate(
      { name: name.trim() || 'Imported CV', kind: 'original', content: { ...c, links, phone } },
      {
        onSuccess: (cv) => {
          toast({ text: 'Your imported CV was saved.' });
          nav(`/app/cv-builder/${cv.id}`, { replace: true });
        },
        onError: (error) => toast({
          text: error instanceof ApiError ? error.message : 'Could not save your CV. Please try again.',
          tone: 'error',
        }),
      },
    );
  };

  const found = [
    [c.experience.length, 'job', 'jobs'],
    [c.education.length, 'education entry', 'education entries'],
    [c.projects.length, 'project', 'projects'],
    [c.skills.length, 'skill', 'skills'],
  ] as const;

  return (
    <>
      <PageHeader
        title="Review your imported CV"
        subtitle="Nothing is saved yet. Check every section against your CV, then save it as a new CV."
      />
      <Note tone="accent" className="mb-5 p-5">
        <p className="font-medium">
          Found {found.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(', ')}.
        </p>
        {notes.length > 0 && (
          <p className="mt-1.5 text-soft">
            {notes.length} {notes.length === 1 ? 'item was' : 'items were'} left out because {notes.length === 1 ? 'it' : 'they'}
            {' '}could not be confirmed in your PDF. The numbered sections show where.
          </p>
        )}
        {result.missing.length > 0 && (
          <p className="mt-1.5 text-soft">
            Not found in your CV: {result.missing.map((field) => MISSING_LABEL[field]).join(', ')}. Add them only if
            they are true.
          </p>
        )}
      </Note>

      <CvSectionTabs section={section} onSelect={setSection} tabId={tabId} panelId={panelId} counts={counts} />

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <div id={panelId} role="tabpanel" aria-labelledby={tabId(section)}>
            <CvSectionFields
              section={section}
              content={c}
              set={set}
              contact={contact}
              phoneField={phoneField}
              name={name}
              onNameChange={setName}
              nameHint="The name of the new CV. Only you see this."
              missing={missing}
              notes={sectionNotes.length > 0 && (
                <div className="rounded-xl bg-[#fbebc6]/60 px-4 py-3 text-sm" data-testid="import-notes">
                  <p className="font-medium">Left out of {SECTION_LABELS[section]}</p>
                  <ul className="mt-1.5 space-y-1.5">
                    {sectionNotes.map((note, index) => (
                      <li key={index}>
                        <span className="font-medium">{note.label}</span>
                        {note.value && <>: “{note.value}”</>}
                        <span className="block text-soft">
                          {note.unsure ? 'Found in your CV, but not where it belongs. ' : ''}{note.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-soft">Add anything here yourself only if it is correct.</p>
                </div>
              )}
              itemNote={(kind, item) =>
                kind !== 'projects' && !(item as { start?: string }).start ? (
                  <p className="text-xs text-[#7a4f00]">Start date not found in your CV</p>
                ) : null}
            />
          </div>
        </div>
        <div className="min-w-0 xl:sticky xl:top-8">
          <CvLivePreview content={c} />
        </div>
      </div>

      <Card className="mt-6 flex flex-col gap-4">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 size-[18px] shrink-0 accent-primary"
          />
          I have reviewed this information and it is accurate.
        </label>
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button variant="danger" onClick={() => setDiscarding(true)} disabled={create.isPending}>
            Discard import
          </Button>
          <Button onClick={save} disabled={!confirmed} loading={create.isPending}>
            Save as new CV
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        onConfirm={() => nav('/app/cvs', { replace: true })}
        title="Discard this import?"
        text="Nothing has been saved. The information read from your PDF will be removed."
        confirmLabel="Discard import"
        danger
      />
    </>
  );
}
