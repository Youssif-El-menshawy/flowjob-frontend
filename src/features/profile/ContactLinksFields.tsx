import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Input } from '@/shared/ui/Field';
import {
  joinLinks,
  linkExample,
  linkLabel,
  normalizeHttpsUrl,
  splitLinks,
  type LinkKind,
} from '@/shared/lib/links';

const KINDS: LinkKind[] = ['linkedin', 'github'];

/**
 * State + validation for the two optional contact-link inputs (LinkedIn, GitHub) over the existing
 * `links: string[]` field. Hold it in a component that stays mounted (e.g. the CV Builder editor) so
 * typed text survives step changes.
 */
export function useContactLinks(links: string[], onChange: (links: string[]) => void) {
  // Captured once: the original split, so untouched values and every other legacy link survive verbatim.
  const initial = useRef(splitLinks(links)).current;
  const [text, setText] = useState({ linkedin: initial.linkedin, github: initial.github });
  const [shown, setShown] = useState<Record<LinkKind, boolean>>({ linkedin: false, github: false });

  const compose = (t: { linkedin: string; github: string }) => joinLinks(t.linkedin, t.github, initial.others);
  const changed = (k: LinkKind, t = text) => t[k].trim() !== initial[k].trim();
  const errorOf = (k: LinkKind): string | undefined => {
    if (!shown[k] || !changed(k)) return undefined; // never nag about, or rewrite, a link the user hasn't touched
    const r = normalizeHttpsUrl(text[k], k);
    return r.ok ? undefined : r.error;
  };

  const edit = (k: LinkKind, value: string) => {
    const t = { ...text, [k]: value };
    setText(t);
    onChange(compose(t));
  };
  const blur = (k: LinkKind) => {
    setShown((s) => ({ ...s, [k]: true }));
    if (!changed(k)) return;
    const r = normalizeHttpsUrl(text[k], k);
    if (r.ok && r.value !== text[k]) edit(k, r.value);
  };
  /**
   * Validates the links the user changed and applies the normalised https URLs. Returns the links to
   * save, or null (with inline errors shown) when a changed link is invalid. Untouched and unrelated
   * legacy links are returned exactly as stored.
   */
  const validate = (): string[] | null => {
    setShown({ linkedin: true, github: true });
    if (!KINDS.some((k) => changed(k))) return links; // nothing edited: keep every stored link as it is
    const next = { ...text };
    let ok = true;
    for (const k of KINDS) {
      if (!changed(k)) continue;
      const r = normalizeHttpsUrl(text[k], k);
      if (r.ok) next[k] = r.value;
      else ok = false;
    }
    if (!ok) return null;
    setText(next);
    const out = compose(next);
    onChange(out);
    return out;
  };

  return { text, edit, blur, errorOf, validate };
}
export type ContactLinks = ReturnType<typeof useContactLinks>;

/** The two inputs, driven by `useContactLinks`. Renders as siblings so it drops into any grid. */
export function ContactLinksInputs({ state }: { state: ContactLinks }) {
  return (
    <>
      {KINDS.map((k) => (
        <Input
          key={k}
          label={`${linkLabel(k)} URL`}
          optional
          inputMode="url"
          autoComplete="url"
          placeholder={linkExample(k)}
          value={state.text[k]}
          error={state.errorOf(k)}
          onChange={(e) => state.edit(k, e.target.value)}
          onBlur={() => state.blur(k)}
        />
      ))}
    </>
  );
}

export interface ContactLinksHandle {
  validate: () => string[] | null;
}

/** Self-contained variant (hook + inputs) for pages with a single always-mounted form, e.g. Profile. */
export const ContactLinksFields = forwardRef<
  ContactLinksHandle,
  { links: string[]; onChange: (links: string[]) => void }
>(function ContactLinksFields({ links, onChange }, ref) {
  const state = useContactLinks(links, onChange);
  useImperativeHandle(ref, () => ({ validate: state.validate }));
  return <ContactLinksInputs state={state} />;
});
