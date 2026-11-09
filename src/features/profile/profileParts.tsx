// Small editors reused by the Profile page and the CV builder.
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Education, Experience, Project } from '@/shared/api/types';
import { uid } from '@/mocks/seed';
import { Button } from '@/shared/ui/Button';
import { controlClass, Input, Textarea } from '@/shared/ui/Field';
import { Modal } from '@/shared/ui/Overlay';
import { MonthYearPicker } from '@/shared/ui/MonthYearPicker';
import { parseDate, validateRange } from '@/shared/lib/dates';

export type Kind = 'experience' | 'education' | 'projects';
type Item = Experience | Education | Project;

export const blank = {
  experience: (): Experience => ({
    id: uid(),
    title: '',
    company: '',
    location: '',
    start: '',
    end: '',
    bullets: [],
  }),
  education: (): Education => ({ id: uid(), degree: '', school: '', start: '', end: '', note: '' }),
  projects: (): Project => ({ id: uid(), name: '', tech: '', description: '' }),
};

export function ItemEditor({
  kind,
  item,
  isNew,
  onClose,
  onSave,
}: {
  kind: Kind;
  item: Item | null;
  isNew?: boolean;
  onClose: () => void;
  onSave: (i: Item) => void;
}) {
  const [v, setV] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  // An empty end date means "Present" in the stored format, so the checkbox is derived from it.
  const [present, setPresent] = useState(false);
  const [showDateErrors, setShowDateErrors] = useState(false);
  // A month picked without a year can't be stored, so each picker reports it here.
  const [incomplete, setIncomplete] = useState({ start: false, end: false });
  useEffect(() => {
    if (!item) return;
    const r = item as unknown as Record<string, unknown>;
    setV(
      Object.fromEntries(
        Object.entries(r).map(([k, x]) => [k, Array.isArray(x) ? x.join('\n') : String(x ?? '')]),
      ),
    );
    setErr('');
    setShowDateErrors(false);
    setIncomplete({ start: false, end: false });
    const end = parseDate(String(r.end ?? '')).kind;
    setPresent(end === 'empty' || end === 'present');
  }, [item]);
  if (!item) return null;
  const set = (k: string) => (e: { target: { value: string } }) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const required =
    kind === 'experience' ? ['title', 'company'] : kind === 'education' ? ['degree', 'school'] : ['name'];
  const hasDates = kind === 'experience' || kind === 'education';
  const dateErrors = hasDates ? validateRange(v.start ?? '', v.end ?? '', present) : {};
  const incompleteStart = hasDates && incomplete.start;
  const incompleteEnd = hasDates && incomplete.end && !present;
  const NEEDS_YEAR = 'Choose a year to go with the month.';
  const label = kind === 'experience' ? 'experience' : kind === 'education' ? 'education' : 'project';

  const save = () => {
    if (required.some((k) => !v[k]?.trim())) {
      setErr('Please fill in the required fields.');
      return;
    }
    if (hasDates && (incompleteStart || incompleteEnd || dateErrors.end)) {
      setShowDateErrors(true);
      setErr('Please check the dates.');
      return;
    }
    const out: Record<string, unknown> = { ...v };
    // Present is stored as an empty end date; a legacy "Present" text value is left exactly as it was.
    if (hasDates && present && parseDate(v.end).kind === 'date') out.end = '';
    if (kind === 'experience')
      out.bullets = (v.bullets ?? '')
        .split('\n')
        .map((b) => b.replace(/^[-–•]\s*/, '').trim())
        .filter(Boolean);
    onSave(out as unknown as Item);
  };

  const setDate = (k: 'start' | 'end') => (value: string) => setV((s) => ({ ...s, [k]: value }));
  const dateFields = (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <MonthYearPicker
        label="Start date"
        optional
        value={v.start ?? ''}
        onChange={setDate('start')}
        onIncompleteChange={(b) => setIncomplete((s) => (s.start === b ? s : { ...s, start: b }))}
        error={showDateErrors && incompleteStart ? NEEDS_YEAR : undefined}
      />
      <div className="flex flex-col gap-3">
        <MonthYearPicker
          label="End date"
          value={present ? '' : (v.end ?? '')}
          onChange={setDate('end')}
          disabled={present}
          onIncompleteChange={(b) => setIncomplete((s) => (s.end === b ? s : { ...s, end: b }))}
          error={
            incompleteEnd
              ? showDateErrors
                ? NEEDS_YEAR
                : undefined
              : showDateErrors || (!!v.end && !present)
                ? dateErrors.end
                : undefined
          }
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
          <input
            type="checkbox"
            checked={present}
            onChange={(e) => {
              setPresent(e.target.checked);
              if (e.target.checked) setV((s) => ({ ...s, end: '' }));
            }}
            className="size-[18px] accent-primary"
          />
          Present
        </label>
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`${isNew ? 'Add' : 'Edit'} ${label}`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {err && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{err}</p>}
        {kind === 'experience' && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Job title" value={v.title ?? ''} onChange={set('title')} />
              <Input label="Company" value={v.company ?? ''} onChange={set('company')} />
            </div>
            <Input label="City" optional value={v.location ?? ''} onChange={set('location')} />
            {dateFields}
            <Textarea
              label="What you did"
              rows={5}
              hint="One line per point. Start with a verb and add a number where you can."
              value={v.bullets ?? ''}
              onChange={set('bullets')}
            />
          </>
        )}
        {kind === 'education' && (
          <>
            <Input label="Degree" value={v.degree ?? ''} onChange={set('degree')} />
            <Input label="School" value={v.school ?? ''} onChange={set('school')} />
            {dateFields}
            <Input
              label="Note"
              optional
              placeholder="Thesis, honours, relevant courses"
              value={v.note ?? ''}
              onChange={set('note')}
            />
          </>
        )}
        {kind === 'projects' && (
          <>
            <Input label="Project name" value={v.name ?? ''} onChange={set('name')} />
            <Input
              label="Tech used"
              placeholder="React, FastAPI, PostgreSQL"
              value={v.tech ?? ''}
              onChange={set('tech')}
            />
            <Textarea
              label="What it does and your part"
              rows={3}
              value={v.description ?? ''}
              onChange={set('description')}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

export function SkillsEditor({ skills, onChange }: { skills: string[]; onChange: (s: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const next = [...skills];
    parts.forEach((p) => {
      if (!next.some((x) => x.toLowerCase() === p.toLowerCase())) next.push(p);
    });
    onChange(next);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !draft && skills.length) onChange(skills.slice(0, -1));
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {skills.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 rounded-full bg-tint py-1.5 pr-1.5 pl-3.5 text-sm animate-pop"
          >
            {s}
            <button
              onClick={() => onChange(skills.filter((x) => x !== s))}
              className="grid size-6 place-items-center rounded-full text-soft hover:bg-surface hover:text-ink"
              aria-label={`Remove ${s}`}
            >
              ×
            </button>
          </span>
        ))}
        {!skills.length && (
          <p className="text-sm text-soft">No skills yet. Add the tools and topics you know.</p>
        )}
      </div>
      <div className="flex gap-2">
        <label htmlFor="skill-add" className="sr-only">
          Add a skill
        </label>
        <input
          id="skill-add"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="Type a skill and press Enter"
          className={`${controlClass()} min-h-11 flex-1`}
        />
        <Button variant="secondary" onClick={add} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
