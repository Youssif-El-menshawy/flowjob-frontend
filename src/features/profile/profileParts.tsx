// Small editors reused by the Profile page and the CV builder.
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { Education, Experience, Project } from '@/shared/api/types';
import { uid } from '@/mocks/seed';
import { Button } from '@/shared/ui/Button';
import { controlClass, Input, Textarea } from '@/shared/ui/Field';
import { Modal } from '@/shared/ui/Overlay';

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
  useEffect(() => {
    if (!item) return;
    const r = item as unknown as Record<string, unknown>;
    setV(
      Object.fromEntries(
        Object.entries(r).map(([k, x]) => [k, Array.isArray(x) ? x.join('\n') : String(x ?? '')]),
      ),
    );
    setErr('');
  }, [item]);
  if (!item) return null;
  const set = (k: string) => (e: { target: { value: string } }) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const required =
    kind === 'experience' ? ['title', 'company'] : kind === 'education' ? ['degree', 'school'] : ['name'];
  const label = kind === 'experience' ? 'experience' : kind === 'education' ? 'education' : 'project';

  const save = () => {
    if (required.some((k) => !v[k]?.trim())) {
      setErr('Please fill in the required fields.');
      return;
    }
    const out: Record<string, unknown> = { ...v };
    if (kind === 'experience')
      out.bullets = (v.bullets ?? '')
        .split('\n')
        .map((b) => b.replace(/^[-–•]\s*/, '').trim())
        .filter(Boolean);
    onSave(out as unknown as Item);
  };

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
            <div className="grid gap-4 sm:grid-cols-3">
              <Input label="City" optional value={v.location ?? ''} onChange={set('location')} />
              <Input label="Start" placeholder="Jul 2026" value={v.start ?? ''} onChange={set('start')} />
              <Input label="End" placeholder="Present" value={v.end ?? ''} onChange={set('end')} />
            </div>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Start" value={v.start ?? ''} onChange={set('start')} />
              <Input label="End" value={v.end ?? ''} onChange={set('end')} />
            </div>
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
