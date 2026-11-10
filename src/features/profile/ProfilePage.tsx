import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useProfile, useSaveProfile } from '@/shared/api/queries';
import type { Education, Experience, Profile, Project } from '@/shared/api/types';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { profileStrength } from '@/shared/lib/profile';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Card, EmptyState, Note, PageHeader, ProgressBar, Tabs } from '@/shared/ui/Display';
import { Input, Textarea } from '@/shared/ui/Field';
import { ConfirmDialog, useToast } from '@/shared/ui/Overlay';
import { PageLoader } from '@/shared/ui/Spinner';
import { ContactLinksInputs, useContactLinks } from './ContactLinksFields';
import { LanguagesEditor } from './LanguagesEditor';
import { LocationInputs, useLocationField } from './LocationFields';
import { PhoneInputs, usePhoneField } from './PhoneFields';
import { appendSkills, blank, ItemEditor, SkillsEditor, type Kind } from './profileParts';

const TABS = ['Personal details', 'Summary', 'Experience', 'Education', 'Projects', 'Skills'] as const;
type Tab = (typeof TABS)[number];

const EMAIL = z.string().email();
const CV_BUILDER = '/app/cv-builder';

export default function ProfilePage() {
  useDocumentTitle('Profile');
  const profile = useProfile();
  if (profile.data) return <LoadedProfile initial={profile.data} />;
  if (profile.isError) {
    return (
      <>
        <PageHeader title="Profile" />
        <EmptyState
          title="Could not load your profile"
          text="Please check your connection and try again."
          action={<Button loading={profile.isFetching} onClick={() => void profile.refetch()}>Retry</Button>}
        />
      </>
    );
  }
  return <PageLoader />;
}

function LoadedProfile({ initial }: { initial: Profile }) {
  const [tab, setTab] = useState<Tab>('Experience');
  const [checkpoint, setCheckpoint] = useState({ saved: initial, version: 0 });
  // A new editor resets the input controllers and the draft together. The selected
  // section stays put, and background query updates cannot replace unsaved edits.
  const reset = useCallback((saved: Profile) => setCheckpoint(({ version }) => ({ saved, version: version + 1 })), []);
  return <ProfileEditor key={checkpoint.version} saved={checkpoint.saved} latest={initial} tab={tab} setTab={setTab} reset={reset} />;
}

function ProfileEditor({ saved, latest, tab, setTab, reset }: {
  saved: Profile;
  latest: Profile;
  tab: Tab;
  setTab: (tab: Tab) => void;
  reset: (saved: Profile) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const save = useSaveProfile();
  const saving = useRef(false);
  const seenQuery = useRef(latest);
  const [p, setP] = useState(() => structuredClone(saved));
  const [validateEmail, setValidateEmail] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [editing, setEditing] = useState<{
    kind: Kind;
    item: Experience | Education | Project;
    isNew: boolean;
  } | null>(null);
  const [removing, setRemoving] = useState<{ kind: Kind; id: string } | null>(null);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((draft) => ({ ...draft, [k]: v }));
  // The raw contact inputs are draft state, separate from the persisted Profile
  // format. Keep their controllers alive even when Personal details is unmounted.
  const contact = useContactLinks(saved.links);
  const phoneField = usePhoneField(saved.phone);
  const location = useLocationField(p.location, (value) => set('location', value));
  const dirty = contact.isDirty || phoneField.isDirty || !!skillInput.trim() || JSON.stringify(p) !== JSON.stringify(saved);
  const strength = profileStrength(p);
  const invalidEmail = p.email !== saved.email && !!p.email.trim() && !EMAIL.safeParse(p.email.trim()).success;

  useEffect(() => {
    if (seenQuery.current === latest) return;
    seenQuery.current = latest;
    if (!dirty && !saving.current) reset(latest);
  }, [dirty, latest, reset]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const doSave = (next = p) => {
    if (saving.current) return;
    const links = contact.validate();
    const phone = phoneField.validate();
    setValidateEmail(true);
    if (links === null || phone === null || invalidEmail) {
      setTab('Personal details');
      toast({ text: 'Please fix the highlighted field first.', tone: 'error' });
      return;
    }
    saving.current = true;
    const email = next.email === saved.email ? saved.email : next.email.trim();
    const skills = skillInput.trim() ? appendSkills(next.skills, skillInput) : next.skills;
    save.mutate({ ...next, email, links, phone, skills }, {
      onSuccess: (profile) => {
        saving.current = false;
        reset(profile);
        toast({ text: 'Profile saved.' });
      },
      onError: () => {
        saving.current = false;
        toast({ text: 'Could not save. Please try again.', tone: 'error' });
      },
    });
  };

  const commitItem = (kind: Kind, item: Experience | Education | Project) => {
    const list = p[kind] as Array<{ id: string }>;
    const exists = list.some((x) => x.id === item.id);
    const next = { ...p, [kind]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] };
    setP(next);
    doSave(next);
    setEditing(null);
  };

  const list = (kind: Kind) => {
    const items = p[kind] as Array<Experience & Education & Project>;
    const noun = kind === 'experience' ? 'experience' : kind === 'education' ? 'education' : 'project';
    return (
      <div className="flex flex-col gap-3">
        {items.map((it, i) => (
          <Card
            as="article"
            key={it.id}
            className="animate-in px-6 py-5"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold">{it.title || it.degree || it.name}</h3>
                <p className="text-sm text-soft">
                  {kind === 'experience' &&
                    [it.company, it.location].filter(Boolean).join(', ') +
                      (it.start ? ` · ${it.start} – ${it.end || 'Present'}` : '')}
                  {kind === 'education' && `${it.school} · ${it.start} – ${it.end}`}
                  {kind === 'projects' && it.tech}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing({ kind, item: it, isNew: false })}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger"
                  onClick={() => setRemoving({ kind, id: it.id })}
                >
                  Delete
                </Button>
              </div>
            </div>
            {kind === 'experience' && it.bullets.length > 0 && (
              <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-relaxed text-soft">
                {it.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {kind === 'education' && it.note && <p className="mt-2 text-[15px] text-soft">{it.note}</p>}
            {kind === 'projects' && (
              <p className="mt-2 text-[15px] leading-relaxed text-soft">{it.description}</p>
            )}
          </Card>
        ))}
        <button
          onClick={() => setEditing({ kind, item: blank[kind](), isNew: true })}
          className="min-h-14 rounded-2xl border border-dashed border-line font-medium text-primary transition-colors hover:border-primary hover:bg-surface"
        >
          + Add {noun}
        </button>
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="Profile"
        subtitle="Your details in one place. New CVs and job matches start from here."
        actions={
          <ButtonLink
            to={CV_BUILDER}
            variant="secondary"
            onClick={(event) => {
              if (!dirty || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              if (!saving.current) setLeaving(true);
            }}
          >
            Open CV builder
          </ButtonLink>
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Profile sections" />
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <fieldset key={tab} disabled={save.isPending} className="m-0 min-w-0 border-0 p-0 animate-in">
          {tab === 'Personal details' && (
            <Card className="grid gap-4 sm:grid-cols-2">
              <Input label="Full name" value={p.fullName} onChange={(e) => set('fullName', e.target.value)} />
              <Input
                label="Email"
                type="email"
                value={p.email}
                error={validateEmail && invalidEmail ? 'Enter a valid email address.' : undefined}
                onChange={(e) => set('email', e.target.value)}
              />
              <PhoneInputs state={phoneField} className="sm:col-span-2" />
              <LocationInputs state={location} />
              <ContactLinksInputs state={contact} />
              <LanguagesEditor className="sm:col-span-2" value={p.languages} onChange={(v) => set('languages', v)} />
            </Card>
          )}
          {tab === 'Summary' && (
            <Card>
              <Textarea
                label="Summary"
                rows={5}
                hint="Two or three sentences about who you are and what you want to do next."
                value={p.summary}
                onChange={(e) => set('summary', e.target.value)}
              />
            </Card>
          )}
          {tab === 'Experience' && list('experience')}
          {tab === 'Education' && list('education')}
          {tab === 'Projects' && list('projects')}
          {tab === 'Skills' && (
            <Card>
              <SkillsEditor skills={p.skills} onChange={(s) => set('skills', s)} input={{ value: skillInput, onChange: setSkillInput }} />
            </Card>
          )}
          {dirty && (
            <div className="sticky bottom-4 z-10 mt-5 flex items-center justify-between gap-3 rounded-full border border-line bg-surface py-2 pr-2 pl-5 shadow-lg animate-in">
              <span className="text-sm text-soft">You have unsaved changes</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { if (!saving.current) reset(saved); }}>
                  Discard
                </Button>
                <Button size="sm" loading={save.isPending} onClick={() => doSave()}>
                  Save changes
                </Button>
              </div>
            </div>
          )}
        </fieldset>

        <aside className="flex flex-col gap-4">
          <Card>
            <h2 className="text-[17px] font-semibold">Profile strength</h2>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl font-semibold">{strength.pct}%</span>
              <span className="text-sm text-soft">
                {strength.pct === 100 ? 'Complete' : strength.pct >= 60 ? 'Almost there' : 'Getting started'}
              </span>
            </div>
            <ProgressBar value={strength.pct} className="mt-3" label="Profile strength" />
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {strength.checks.map((c) => (
                <li key={c.label} className="flex justify-between">
                  <button className="hover:underline" onClick={() => setTab(c.label as Tab)}>
                    {c.label}
                  </button>
                  <span className={c.done ? 'font-medium text-success-ink' : 'font-medium text-accent-ink'}>
                    {c.done ? 'Done' : 'Add'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Note className="p-5">
            <p className="font-medium">Where this is used</p>
            <p className="mt-1.5 text-soft">
              New CVs copy your profile. Editing a CV later does not change your profile, and editing your
              profile does not change saved CVs.
            </p>
          </Note>
        </aside>
      </div>

      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => navigate(CV_BUILDER)}
        title="Leave profile?"
        text="Your unsaved profile changes will be lost if you leave."
        confirmLabel="Discard and leave"
        danger
      />
      {editing && (
        <ItemEditor
          kind={editing.kind}
          item={editing.item}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={(i) => commitItem(editing.kind, i)}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Delete this entry?"
        text="It will be removed from your profile. CVs you already saved keep their copy."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (!removing) return;
          const next = {
            ...p,
            [removing.kind]: (p[removing.kind] as Array<{ id: string }>).filter((x) => x.id !== removing.id),
          };
          setP(next);
          doSave(next);
          setRemoving(null);
        }}
      />
    </>
  );
}
