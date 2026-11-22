import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/api/client';
import {
  fetchProfileImportStatus,
  importCvPdf,
  qk,
  useProfileImportStatus,
  useSaveImportedProfile,
} from '@/shared/api/queries';
import type { CvImportResult, Profile, ProfileImportStatus } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/utils';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, Note, PageHeader } from '@/shared/ui/Display';
import { useLeaveControl, useLeaveGuard } from '@/shared/ui/LeaveGuard';
import { ConfirmDialog, useToast } from '@/shared/ui/Overlay';
import { PageLoader } from '@/shared/ui/Spinner';
import { useContactLinks } from '@/features/profile/ContactLinksFields';
import { usePhoneField } from '@/features/profile/PhoneFields';
import { CvLivePreview } from '@/features/cv/CvLivePreview';
import { CvSectionFields, CvSectionTabs, SECTION_LABELS, type Section, useSectionIds } from '@/features/cv/CvForm';
import {
  CHOICE_LABEL,
  CHOICE_SECTION,
  type ChoiceKey,
  type Choices,
  checkCvPdf,
  combine,
  conflicts,
  countBySection,
  describeImportError,
  describeValue,
  describeWarning,
  type ImportFailure,
  isEmptyValue,
  MISSING_LABEL,
  pick,
  type Source,
} from './importHelpers';

// Smart CV Import into the main Profile, once per account. Everything stays in this page's memory: the chosen file,
// the backend's result and the user's edits are never written to browser storage, and leaving the page drops them.
// Only "Save to my Profile" (after the user confirms the information) stores anything, through POST /profile/import,
// which also uses up the import. A failed or cancelled extraction or a discarded review leaves the import available.

type Stage =
  | { name: 'choose' }
  | { name: 'importing'; controller: AbortController }
  | { name: 'failed'; failure: ImportFailure }
  | { name: 'review'; result: CvImportResult; base: ProfileImportStatus; attempt: number };

export default function ImportProfilePage() {
  useDocumentTitle('Import CV into Profile');
  const qc = useQueryClient();
  const status = useProfileImportStatus();
  const [stage, setStage] = useState<Stage>({ name: 'choose' });
  const [notice, setNotice] = useState('');

  // The server keeps organizing the CV even if this page goes away, and the result is never stored, so leaving now
  // loses it while the attempt may still count. Leave only stops this tab from waiting for the answer.
  useLeaveGuard({
    when: stage.name === 'importing',
    title: 'Leave while your CV is being read?',
    message: 'FlowJob is still organizing your CV on the server. If you leave now, the result is lost, and this '
      + 'attempt may still count toward today’s tries. Your Profile will not change.',
    onLeave: () => {
      if (stage.name === 'importing') stage.controller.abort();
    },
  });

  // The review always starts from the Profile as it is now (and its revision), never from an older copy.
  const freshStatus = () => qc.fetchQuery({ queryKey: qk.profileImport, queryFn: fetchProfileImportStatus, staleTime: 0 });

  const start = async (file: File) => {
    if (stage.name === 'importing') return; // one extraction at a time
    const controller = new AbortController();
    setNotice('');
    setStage({ name: 'importing', controller });
    try {
      const result = await importCvPdf(file, controller.signal);
      const base = await freshStatus();
      if (controller.signal.aborted) return;
      setStage(base.available ? { name: 'review', result, base, attempt: 0 } : { name: 'choose' });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 409) void qc.invalidateQueries({ queryKey: qk.profileImport });
      setStage({ name: 'failed', failure: describeImportError(error) });
    }
  };

  const restart = async (result: CvImportResult, attempt: number) => {
    const base = await freshStatus();
    setStage(base.available ? { name: 'review', result, base, attempt: attempt + 1 } : { name: 'choose' });
  };

  if (stage.name === 'review') {
    return (
      <Review
        key={stage.attempt}
        result={stage.result}
        base={stage.base}
        onRestart={() => restart(stage.result, stage.attempt)}
      />
    );
  }
  if (status.isLoading) return <PageLoader />;
  if (status.isError && !status.data) {
    return (
      <>
        <PageHeader title="Import your CV" />
        <EmptyState
          title="Could not check your Profile"
          text="Please check your connection and try again."
          action={<Button loading={status.isFetching} onClick={() => void status.refetch()}>Try again</Button>}
        />
      </>
    );
  }
  if (status.data && !status.data.available) return <AlreadyImported importedAt={status.data.importedAt} />;

  return (
    <>
      <PageHeader
        title="Import your CV"
        subtitle="Upload your CV as a PDF. FlowJob fills in your Profile, and you review everything before it is saved."
      />
      {/* The form stays on screen while the CV is processed, so the chosen file survives a failure or a cancel. */}
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        {stage.name === 'failed' && (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-danger-soft px-5 py-4">
            <p className="font-semibold text-danger">{stage.failure.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink">{stage.failure.message}</p>
            <p className="mt-2 text-sm">
              <Link to="/app/profile" className="font-medium text-primary hover:underline">
                Fill in your Profile manually instead
              </Link>
            </p>
          </div>
        )}
        {notice && <p role="status" className="text-sm text-soft">{notice}</p>}
        <Upload
          busy={stage.name === 'importing'}
          onImport={start}
          onCancel={() => {
            if (stage.name !== 'importing') return;
            stage.controller.abort();
            setNotice(
              'Import cancelled. Your Profile was not changed, and you can still import your CV. If it was already '
              + 'being organized, it counts toward today’s tries.',
            );
            setStage({ name: 'choose' });
          }}
        />
      </div>
    </>
  );
}

function AlreadyImported({ importedAt }: { importedAt: string | null }) {
  const when = importedAt ? new Date(importedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : '';
  return (
    <>
      <PageHeader title="Import your CV" />
      <EmptyState
        title="Your CV is already imported"
        text={`You imported your CV into your Profile${when ? ` on ${when}` : ''}. Each account can do this once, and you can keep editing your Profile at any time.`}
        action={
          <div className="flex flex-wrap justify-center gap-2.5">
            <ButtonLink to="/app/profile">Go to my Profile</ButtonLink>
            <ButtonLink to="/app" variant="secondary">Dashboard</ButtonLink>
          </div>
        }
      />
    </>
  );
}

// What the Import CV button says while the CV is processed. These only reassure the user; they do not report the
// backend's actual progress, so they advance on a timer and stay on the last one until the request finishes.
const IMPORT_MESSAGES = ['Reading your CV…', 'Organizing your information…', 'Preparing your review…'];
const IMPORT_MESSAGE_MS = 5000;

function useImportMessage(active: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(
      () => setIndex((i) => Math.min(i + 1, IMPORT_MESSAGES.length - 1)),
      IMPORT_MESSAGE_MS,
    );
    return () => {
      window.clearInterval(timer);
      setIndex(0); // the next import starts from the first message again
    };
  }, [active]);
  return IMPORT_MESSAGES[index];
}

function Upload({ busy, onImport, onCancel }: {
  busy: boolean;
  onImport: (file: File) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [consent, setConsent] = useState(false);
  const [checking, setChecking] = useState(false);
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const message = useImportMessage(busy);

  const choose = async (chosen: File | undefined) => {
    if (busy) return;
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
      <Card className="flex flex-col gap-4" aria-busy={busy || undefined}>
        <h2 className="text-lg font-semibold">1. Choose your CV</h2>
        <label
          htmlFor={inputId}
          aria-disabled={busy || undefined}
          className={cn(
            'flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line px-6 py-8 text-center',
            busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-tint',
          )}
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
          disabled={busy}
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
            Profile sections.
          </li>
          <li>FlowJob does not keep your PDF or its text. Nothing is saved until you review the result and choose
            Save to my Profile. No CV is created.</li>
          <li>Every value is checked against your PDF. Anything that cannot be confirmed is left out and shown to you,
            and nothing missing is filled in for you.</li>
          <li>Anything already in your Profile is kept unless you choose your CV’s version. Your name and email stay as
            in your account.</li>
          <li>Each account can import a CV into its Profile once. Failed, cancelled or discarded imports don’t count
            (up to 5 tries a day).</li>
        </ul>
        <label className={cn('mt-1 flex items-start gap-2 text-sm', busy ? 'cursor-not-allowed' : 'cursor-pointer')}>
          <input
            type="checkbox"
            checked={consent}
            disabled={busy}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 size-[18px] shrink-0 accent-primary"
          />
          I agree that the text of this CV is sent to OpenAI to organize it.
        </label>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/app/profile" className="text-sm font-medium text-primary hover:underline">
          Fill in my Profile manually instead
        </Link>
        <div className="flex gap-2.5">
          {busy ? (
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          ) : (
            <ButtonLink to="/app/profile" variant="secondary">Cancel</ButtonLink>
          )}
          <Button
            loading={busy}
            disabled={!file || !consent || checking}
            onClick={() => !busy && file && consent && onImport(file)}
          >
            {busy ? message : 'Import CV'}
          </Button>
        </div>
      </div>
      {busy && (
        <p role="status" className="sr-only">
          {message}
        </p>
      )}
    </>
  );
}

type SaveError = { kind: 'used' | 'changed' | 'other'; message: string };

function Review({ result, base, onRestart }: {
  result: CvImportResult;
  base: ProfileImportStatus;
  onRestart: () => Promise<void>;
}) {
  const toast = useToast();
  const nav = useNavigate();
  const save = useSaveImportedProfile();
  const [requestId] = useState(() => crypto.randomUUID()); // the same for every retry of this save
  const mine = base.profile;
  const clashes = useMemo(() => conflicts(mine, result.content), [mine, result.content]);
  const [choices, setChoices] = useState<Choices>({});
  const [c, setC] = useState<Profile>(() => combine(mine, result.content));
  // Phone and links editors read their value once, so they restart when the user switches which version to keep.
  const [formKey, setFormKey] = useState(0);
  const [section, setSection] = useState<Section>('personal');
  const [confirmed, setConfirmed] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);

  const choose = (key: ChoiceKey, source: Source) => {
    setChoices((x) => ({ ...x, [key]: source }));
    setC((x) => ({ ...x, [key]: pick(key, mine, result.content, source) }));
    if (key === 'phone' || key === 'links') setFormKey((k) => k + 1);
  };

  // Nothing is stored until Save to my Profile, so leaving (a link, Back, refresh, closing the tab) drops the result.
  const leave = useLeaveControl();
  useLeaveGuard({
    when: true,
    busy: save.isPending,
    title: 'Leave without saving?',
    message: 'Your imported CV has not been saved to your Profile. If you leave, the result is lost. You can import '
      + 'again later, which uses another of today’s tries.',
  });

  const onSave = (profile: Profile) => {
    setSaveError(null);
    save.mutate(
      { profile, revision: base.revision, requestId },
      {
        onSuccess: () => {
          toast({ text: 'Your Profile is saved.' });
          leave.bypass(() => nav('/app', { replace: true, state: { profileImported: true } }));
        },
        onError: (error) => {
          if (error instanceof ApiError && error.status === 409) setSaveError({ kind: 'used', message: error.message });
          else if (error instanceof ApiError && error.status === 412) setSaveError({ kind: 'changed', message: error.message });
          else setSaveError({
            kind: 'other',
            message: error instanceof ApiError ? error.message : 'Could not save your Profile. Please try again.',
          });
        },
      },
    );
  };

  const notes = useMemo(() => result.warnings.map(describeWarning), [result.warnings]);
  // Not found in the CV, and not in the Profile (or the account) either.
  const missing = useMemo(
    () => new Set<string>(result.missing.filter((field) => isEmptyValue(c[field] as Profile[ChoiceKey]))),
    [result.missing, c],
  );
  const counts = useMemo(() => {
    const bySection = countBySection({ ...result, missing: result.missing.filter((field) => missing.has(field)) });
    for (const key of clashes) bySection[CHOICE_SECTION[key]] = (bySection[CHOICE_SECTION[key]] ?? 0) + 1;
    return bySection;
  }, [result, missing, clashes]);
  const identityDiffers =
    (!!result.content.fullName && result.content.fullName.trim() !== mine.fullName.trim())
    || (!!result.content.email && result.content.email.trim().toLowerCase() !== mine.email.trim().toLowerCase());

  const found = [
    [result.content.experience.length, 'job', 'jobs'],
    [result.content.education.length, 'education entry', 'education entries'],
    [result.content.projects.length, 'project', 'projects'],
    [result.content.skills.length, 'skill', 'skills'],
  ] as const;

  const sectionNotes = (value: Section): ReactNode => {
    const left = notes.filter((note) => note.section === value);
    const keys = clashes.filter((key) => CHOICE_SECTION[key] === value);
    if (!left.length && !keys.length && !(value === 'personal' && identityDiffers)) return null;
    return (
      <div className="flex flex-col gap-3">
        {value === 'personal' && identityDiffers && (
          <p className="rounded-xl bg-tint px-4 py-3 text-sm text-soft">
            Your CV shows {[
              result.content.fullName && `the name “${result.content.fullName}”`,
              result.content.email && `the email “${result.content.email}”`,
            ].filter(Boolean).join(' and ')}. Your account’s name and email are kept. You can change them in Settings.
          </p>
        )}
        {keys.map((key) => (
          <ConflictChoice
            key={key}
            label={CHOICE_LABEL[key]}
            profileValue={describeValue(key, mine[key])}
            cvValue={describeValue(key, result.content[key])}
            value={choices[key] ?? 'profile'}
            onChange={(source) => choose(key, source)}
          />
        ))}
        {left.length > 0 && (
          <div className="rounded-xl bg-[#fbebc6]/60 px-4 py-3 text-sm" data-testid="import-notes">
            <p className="font-medium">Left out of {SECTION_LABELS[value]}</p>
            <ul className="mt-1.5 space-y-1.5">
              {left.map((note, index) => (
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
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Review your Profile"
        subtitle="Nothing is saved yet. Check every section against your CV, then save it to your Profile."
      />
      <Note tone="accent" className="mb-5 p-5">
        <p className="font-medium">
          Found {found.map(([n, one, many]) => `${n} ${n === 1 ? one : many}`).join(', ')}.
        </p>
        {clashes.length > 0 && (
          <p className="mt-1.5 text-soft">
            Your Profile already has a different {clashes.map((key) => CHOICE_LABEL[key].toLowerCase()).join(', ')}.
            {' '}Your Profile’s version is kept unless you choose your CV’s in that section.
          </p>
        )}
        {notes.length > 0 && (
          <p className="mt-1.5 text-soft">
            {notes.length} {notes.length === 1 ? 'item was' : 'items were'} left out because {notes.length === 1 ? 'it' : 'they'}
            {' '}could not be confirmed in your PDF. The numbered sections show where.
          </p>
        )}
        {missing.size > 0 && (
          <p className="mt-1.5 text-soft">
            Not found in your CV: {result.missing.filter((field) => missing.has(field)).map((field) => MISSING_LABEL[field]).join(', ')}.
            {' '}Add them only if they are true.
          </p>
        )}
      </Note>

      <ReviewForm
        key={formKey}
        content={c}
        setContent={setC}
        section={section}
        setSection={setSection}
        counts={counts}
        missing={missing}
        notes={sectionNotes(section)}
        confirmed={confirmed}
        setConfirmed={setConfirmed}
        saving={save.isPending}
        onSave={onSave}
        onDiscard={() => setDiscarding(true)}
        error={saveError && (
          <SaveProblem error={saveError} onRestart={onRestart} />
        )}
      />

      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        onConfirm={() => leave.bypass(() => nav('/app/profile', { replace: true }))}
        title="Discard this import?"
        text="Nothing has been saved and your Profile stays as it is. You can still import your CV later."
        confirmLabel="Discard import"
        danger
      />
    </>
  );
}

function ConflictChoice({ label, profileValue, cvValue, value, onChange }: {
  label: string;
  profileValue: string;
  cvValue: string;
  value: Source;
  onChange: (source: Source) => void;
}) {
  const name = useId();
  const options: Array<[Source, string, string]> = [
    ['profile', 'Keep my Profile’s', profileValue],
    ['cv', 'Use my CV’s', cvValue],
  ];
  return (
    <fieldset className="rounded-xl border border-line px-4 py-3 text-sm" data-testid="conflict">
      <legend className="px-1 font-medium">{label}: your Profile and your CV differ</legend>
      <div className="mt-1 flex flex-col gap-2">
        {options.map(([source, title, text]) => (
          <label key={source} className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name={name}
              checked={value === source}
              onChange={() => onChange(source)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span>
              <span className="font-medium">{title}</span>
              <span className="block break-words text-soft">{text}</span>
            </span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-soft">Switching replaces what is shown below, including changes you made to it.</p>
    </fieldset>
  );
}

function SaveProblem({ error, onRestart }: { error: SaveError; onRestart: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const title = {
    used: 'Your CV was already imported',
    changed: 'Your Profile changed while you were reviewing',
    other: 'Your Profile was not saved',
  }[error.kind];
  return (
    <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm">
      <p className="font-semibold text-danger">{title}</p>
      <p className="mt-1 text-ink">{error.message}</p>
      {error.kind === 'other' && <p className="mt-1 text-soft">Your review is still here. You can try again.</p>}
      {error.kind === 'used' && (
        <p className="mt-2"><Link to="/app/profile" className="font-medium text-primary hover:underline">Go to my Profile</Link></p>
      )}
      {error.kind === 'changed' && (
        <>
          <p className="mt-1 text-soft">Reviewing again starts from your latest Profile. Your choices and edits here will be reset.</p>
          <Button
            className="mt-2"
            size="sm"
            variant="secondary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onRestart();
              } finally {
                setBusy(false);
              }
            }}
          >
            Review again
          </Button>
        </>
      )}
    </div>
  );
}

function ReviewForm({
  content: c,
  setContent,
  section,
  setSection,
  counts,
  missing,
  notes,
  confirmed,
  setConfirmed,
  saving,
  onSave,
  onDiscard,
  error,
}: {
  content: Profile;
  setContent: (update: (content: Profile) => Profile) => void;
  section: Section;
  setSection: (section: Section) => void;
  counts: Partial<Record<Section, number>>;
  missing: ReadonlySet<string>;
  notes: ReactNode;
  confirmed: boolean;
  setConfirmed: (confirmed: boolean) => void;
  saving: boolean;
  onSave: (profile: Profile) => void;
  onDiscard: () => void;
  error: ReactNode;
}) {
  const toast = useToast();
  const { tabId, panelId } = useSectionIds();
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setContent((x) => ({ ...x, [k]: v }));
  const contact = useContactLinks(c.links, (l) => set('links', l));
  const phoneField = usePhoneField(c.phone, (v) => set('phone', v));

  const save = () => {
    const links = contact.validate();
    const phone = phoneField.validate();
    if (!links || phone === null) {
      setSection('personal');
      toast({ text: 'Please fix the highlighted field first.', tone: 'error' });
      return;
    }
    onSave({ ...c, links, phone });
  };

  return (
    <>
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
              identityHint="From your account. Change it in Settings."
              missing={missing}
              notes={notes}
              itemNote={(kind, item) => {
                const { start, end } = item as { start?: string; end?: string };
                // A school with one date (its completion or graduation date) has it as the end date: nothing missing.
                const note = kind === 'experience' && !start ? 'Start date not found in your CV'
                  : kind === 'education' && !start && !end ? 'Dates not found in your CV' : '';
                return note ? <p className="text-xs text-[#7a4f00]">{note}</p> : null;
              }}
            />
          </div>
        </div>
        {/* The same card as the form beside it. Each column keeps its own height (the grid aligns them to the top). */}
        <Card className="min-w-0 xl:sticky xl:top-8">
          <CvLivePreview content={c} />
        </Card>
      </div>

      {/* One row from md up: the confirmation on the left, the actions on the right. Stacked below that, with the
          save button first and both buttons full width. */}
      <section className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4">
        {error}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
          <label className="flex min-w-0 cursor-pointer items-start gap-2.5 text-sm leading-snug">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-px size-[18px] shrink-0 accent-primary"
            />
            I have reviewed this information and it is accurate. Save it to my Profile.
          </label>
          <div className="flex shrink-0 flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <Button variant="danger" onClick={onDiscard} disabled={saving}>
              Discard import
            </Button>
            <Button onClick={save} disabled={!confirmed} loading={saving}>
              Save to my Profile
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
