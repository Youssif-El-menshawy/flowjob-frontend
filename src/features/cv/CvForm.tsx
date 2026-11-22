import { useId, useState, type ReactNode } from 'react';
import type { CvContent, Education, Experience, Project } from '@/shared/api/types';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Display';
import { Input, Textarea } from '@/shared/ui/Field';
import { blank, ItemEditor, SkillsEditor, type Kind } from '@/features/profile/profileParts';
import { ContactLinksInputs, type useContactLinks } from '@/features/profile/ContactLinksFields';
import { LanguagesEditor } from '@/features/profile/LanguagesEditor';
import { LocationFields } from '@/features/profile/LocationFields';
import { PhoneInputs, type usePhoneField } from '@/features/profile/PhoneFields';

// The section editor shared by the CV Builder and the Smart CV Import review of the Profile: section tabs and each
// section's fields, using the same profile editors (items, skills, languages, links, phone, location).

export const SECTION_LABELS = {
  personal: 'Personal',
  summary: 'Summary',
  experience: 'Experience',
  education: 'Education',
  projects: 'Projects',
  skills: 'Skills',
} as const;
export type Section = keyof typeof SECTION_LABELS;
export const SECTIONS = Object.keys(SECTION_LABELS) as Section[];

type Item = Experience | Education | Project;
export type SetContent = <K extends keyof CvContent>(key: K, value: CvContent[K]) => void;

export function useSectionIds() {
  const tabsId = useId();
  return { tabId: (value: Section) => `${tabsId}-${value}`, panelId: `${tabsId}-panel` };
}

export function CvSectionTabs({
  section,
  onSelect,
  tabId,
  panelId,
  counts,
}: {
  section: Section;
  onSelect: (section: Section) => void;
  tabId: (section: Section) => string;
  panelId: string;
  /** Optional number shown on a tab (for example notes to review in that section). */
  counts?: Partial<Record<Section, number>>;
}) {
  return (
    <div role="tablist" aria-label="CV sections" className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
      {SECTIONS.map((value, index) => {
        const active = value === section;
        const count = counts?.[value] ?? 0;
        return (
          <button
            key={value}
            id={tabId(value)}
            type="button"
            role="tab"
            aria-controls={panelId}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(value)}
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
              onSelect(SECTIONS[next]);
              document.getElementById(tabId(SECTIONS[next]))?.focus();
            }}
            className={cn(
              'min-w-[110px] flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
              active ? 'bg-accent text-[#1c2b22]' : 'bg-side text-soft hover:text-ink',
            )}
          >
            {SECTION_LABELS[value]}
            {count > 0 && (
              <span className="ml-1.5 rounded-full bg-[#fbebc6] px-1.5 text-xs text-[#7a4f00]" aria-label={`${count} to review`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function CvSectionFields({
  section,
  content: c,
  set,
  contact,
  phoneField,
  name,
  onNameChange,
  nameHint = 'Only you see this.',
  identityHint,
  notes,
  missing,
  itemNote,
}: {
  section: Section;
  content: CvContent;
  set: SetContent;
  contact: ReturnType<typeof useContactLinks>;
  phoneField: ReturnType<typeof usePhoneField>;
  /** The CV's name. Without it (the Profile import review) there is no name field. */
  name?: string;
  onNameChange?: (name: string) => void;
  nameHint?: string;
  /** When set, full name and email are shown read-only with this hint (they come from the account). */
  identityHint?: string;
  /** Shown at the top of the section (for example what an import could not confirm). */
  notes?: ReactNode;
  /** Content fields to mark as not found (Smart CV Import). */
  missing?: ReadonlySet<string>;
  /** Extra line under an item in the experience, education and project lists. */
  itemNote?: (kind: Kind, item: Item) => ReactNode;
}) {
  const [editing, setEditing] = useState<{ kind: Kind; item: Item; isNew: boolean } | null>(null);
  const notFound = (field: string) => (missing?.has(field) ? 'Not found in your CV. Add it if you have it.' : undefined);

  const items = (kind: Kind) => {
    const list = c[kind] as Array<Experience & Education & Project>;
    return (
      <div className="flex flex-col gap-2.5">
        {missing?.has(kind) && list.length === 0 && (
          <p className="rounded-xl bg-tint px-4 py-3 text-sm text-soft">Nothing found in your CV for this section.</p>
        )}
        {list.map((it) => (
          <div
            key={it.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{it.title || it.degree || it.name}</p>
              <p className="truncate text-sm text-soft">{it.company || it.school || it.tech}</p>
              {itemNote?.(kind, it)}
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
      <Card key={section} className="flex flex-col gap-5 animate-in">
        <h2 className="text-xl font-semibold">{SECTION_LABELS[section]}</h2>
        {notes}
        {section === 'personal' && (
          <>
            {name !== undefined && (
              <Input label="CV name" hint={nameHint} value={name} onChange={(e) => onNameChange?.(e.target.value)} />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Full name"
                hint={identityHint ?? notFound('fullName')}
                value={c.fullName}
                readOnly={!!identityHint}
                onChange={(e) => set('fullName', e.target.value)}
              />
              <Input
                label="Email"
                hint={identityHint ?? notFound('email')}
                value={c.email}
                readOnly={!!identityHint}
                onChange={(e) => set('email', e.target.value)}
              />
              <PhoneInputs state={phoneField} className="sm:col-span-2" />
              <LocationFields value={c.location} onChange={(v) => set('location', v)} />
            </div>
            {(missing?.has('phone') || missing?.has('location')) && (
              <p className="text-sm text-soft">
                {[missing.has('phone') && 'Phone', missing.has('location') && 'Location'].filter(Boolean).join(' and ')}{' '}
                not found in your CV. Add {missing.has('phone') && missing.has('location') ? 'them' : 'it'} if you have{' '}
                {missing.has('phone') && missing.has('location') ? 'them' : 'it'}.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <ContactLinksInputs state={contact} />
            </div>
          </>
        )}
        {section === 'summary' && (
          <Textarea
            label="Summary"
            rows={5}
            hint={notFound('summary') ?? 'Two or three sentences. Say what you do and what you want next.'}
            value={c.summary}
            onChange={(e) => set('summary', e.target.value)}
          />
        )}
        {section === 'experience' && items('experience')}
        {section === 'education' && items('education')}
        {section === 'projects' && items('projects')}
        {section === 'skills' && (
          <>
            {missing?.has('skills') && c.skills.length === 0 && (
              <p className="rounded-xl bg-tint px-4 py-3 text-sm text-soft">No skills list found in your CV.</p>
            )}
            <SkillsEditor skills={c.skills} onChange={(s) => set('skills', s)} />
            <LanguagesEditor value={c.languages} onChange={(v) => set('languages', v)} />
          </>
        )}
      </Card>
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
