import { useCallback, useMemo, useRef, useState } from 'react';
import { LANGUAGE_NAMES } from '@/shared/lib/languageCatalog';
import {
  catalogName,
  formatLanguages,
  languageKey,
  parseLanguages,
  PROFICIENCIES,
  readLanguageFields,
  type LanguageEntry,
  type Proficiency,
} from '@/shared/lib/languages';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Field';
import { Modal } from '@/shared/ui/Overlay';

const CUSTOM = '__custom__';

function LanguageDialog({ entries, index, onApply, onClose }: {
  entries: readonly LanguageEntry[];
  index: number;
  onApply: (entry: LanguageEntry) => void;
  onClose: () => void;
}) {
  const original = entries[index];
  const initial = original?.kind === 'legacy' ? readLanguageFields(original.text) : original;
  const [choice, setChoice] = useState(() => initial ? catalogName(initial.name) ?? CUSTOM : '');
  const [custom, setCustom] = useState(initial?.name ?? '');
  const [proficiency, setProficiency] = useState<Proficiency>(initial?.proficiency ?? '');
  const [error, setError] = useState('');

  const apply = () => {
    const name = (choice === CUSTOM ? custom : choice).trim();
    if (!name) {
      setError('Choose a language or enter a custom name.');
      return;
    }
    if (/[,/()\r\n]/u.test(name)) {
      setError('Enter one language name without commas, slashes, or parentheses.');
      return;
    }
    if (initial?.name === name && initial.proficiency === proficiency) {
      onClose();
      return;
    }
    const duplicate = entries.some((entry, position) => {
      if (position === index) return false;
      const other = entry.kind === 'legacy' ? readLanguageFields(entry.text).name : entry.name;
      return languageKey(other) === languageKey(name);
    });
    if (duplicate) {
      setError('This language is already in the list.');
      return;
    }
    onApply({ kind: 'language', name, proficiency });
  };

  return (
    <Modal
      open
      onClose={onClose}
      showCloseButton={false}
      dismissOnBackdrop={false}
      title={index < 0 ? 'Add language' : 'Edit language'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={apply}>{index < 0 ? 'Add language' : 'Save language'}</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Select
          label="Language"
          data-autofocus
          value={choice}
          onChange={(event) => {
            setChoice(event.target.value);
            setError('');
          }}
        >
          <option value="">Choose a language</option>
          {LANGUAGE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
          <option value={CUSTOM}>Enter a custom language</option>
        </Select>
        {choice === CUSTOM && (
          <Input
            label="Custom language"
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value);
              setError('');
            }}
          />
        )}
        <Select
          label="Proficiency"
          optional
          value={proficiency}
          onChange={(event) => setProficiency(event.target.value as Proficiency)}
        >
          <option value="">Not specified</option>
          {PROFICIENCIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  );
}

/** Edit one optional string without normalizing saved values just by opening the form. */
export function LanguagesEditor({ value, onChange, className }: {
  value?: string | null;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [edited, setEdited] = useState<{ value: string; entries: LanguageEntry[] } | null>(null);
  const parsed = useMemo(() => parseLanguages(value), [value]);
  const entries = edited && edited.value === value ? edited.entries : parsed;
  const addButton = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setEditIndex(null), []);

  const update = (next: LanguageEntry[]) => {
    const text = formatLanguages(next);
    setEdited({ value: text, entries: next });
    onChange(text);
  };

  return (
    <fieldset className={cn('m-0 min-w-0 border-0 p-0', className)}>
      <legend className="mb-2 text-sm font-medium">
        Languages <span className="font-normal text-soft">(optional)</span>
      </legend>
      {entries.length > 0 && (
        <ul aria-label="Saved languages" className="mb-2 space-y-1.5">
          {entries.map((entry, index) => {
            const label = entry.kind === 'legacy' ? entry.text.trim() : entry.name;
            return (
              <li key={index} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-1.5">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="font-medium whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.kind === 'legacy' ? entry.text : entry.name}</span>
                  {entry.kind === 'legacy' ? (
                    <span className="text-xs text-soft">Saved text</span>
                  ) : entry.proficiency ? (
                    <span className="rounded-full bg-tint px-2 py-0.5 text-xs text-ink">{entry.proficiency}</span>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label={`Edit ${label}`} onClick={() => setEditIndex(index)}>Edit</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove ${label}`}
                    onClick={() => {
                      update(entries.filter((_, position) => position !== index));
                      addButton.current?.focus();
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button ref={addButton} size="sm" variant="secondary" onClick={() => setEditIndex(-1)}>Add language</Button>
      {editIndex !== null && (
        <LanguageDialog
          entries={entries}
          index={editIndex}
          onClose={close}
          onApply={(entry) => {
            update(editIndex < 0 ? [...entries, entry] : entries.map((old, index) => index === editIndex ? entry : old));
            close();
          }}
        />
      )}
    </fieldset>
  );
}
