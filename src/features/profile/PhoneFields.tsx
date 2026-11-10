import { forwardRef, useId, useImperativeHandle, useRef, useState } from 'react';
import {
  buildPhone,
  countryByCode,
  localeCountry,
  parseStoredPhone,
  type CountryCode,
} from '@/shared/lib/phone';
import { controlClass } from '@/shared/ui/Field';
import { CountrySelect } from '@/shared/ui/CountrySelect';
import { cn } from '@/shared/lib/utils';

/**
 * State + validation for the optional phone field (country dropdown + national number) over the single
 * stored `phone` string. Keep it in a component that stays mounted (CV Builder editor / Profile form).
 *
 * - Valid numbers are written to the value as E.164 ("+447911123456").
 * - A value the user hasn't touched is never rewritten (legacy formats survive exactly as stored).
 * - A stored value whose country can't be identified is shown as-is with no country selected.
 */
export function usePhoneField(value: string, onChange?: (value: string) => void) {
  const initial = useRef(parseStoredPhone(value)).current;
  const initialNational = initial.kind === 'parsed' ? initial.national : initial.kind === 'unrecognised' ? initial.raw : '';
  const initialCountry: CountryCode | '' = initial.kind === 'parsed' ? initial.country : initial.kind === 'empty' ? localeCountry() : '';
  const [country, setCountry] = useState<CountryCode | ''>(initialCountry);
  const [national, setNational] = useState(initialNational);
  const [shown, setShown] = useState(false);

  const changed = (c = country, n = national) =>
    n.trim() !== initialNational.trim() || (n.trim() !== '' && c !== initialCountry);
  const errorOf = (): string | undefined => {
    if (!shown || !changed()) return undefined;
    const r = buildPhone(country, national);
    return r.ok ? undefined : r.error;
  };

  /** Update the stored value: E.164 when valid, otherwise the raw text so the change still counts as unsaved. */
  const emit = (c: CountryCode | '', n: string) => {
    if (!onChange) return;
    const r = buildPhone(c, n);
    onChange(r.ok ? r.value : n.trim());
  };
  const editNational = (n: string) => {
    setNational(n);
    emit(country, n);
  };
  const pickCountry = (c: CountryCode) => {
    setCountry(c);
    if (national.trim()) emit(c, national);
  };
  const blur = () => {
    setShown(true);
    if (!changed()) return;
    const r = buildPhone(country, national);
    if (r.ok && r.value) {
      if (r.national) setNational(r.national);
      if (r.country) setCountry(r.country);
    }
  };
  /** The value to save, or null (with an inline error) when the changed number is invalid. */
  const validate = (): string | null => {
    setShown(true);
    if (!changed()) return value; // nothing edited: keep the stored value exactly as it is
    const r = buildPhone(country, national);
    if (!r.ok) return null;
    if (r.national) setNational(r.national);
    if (r.country) setCountry(r.country);
    onChange?.(r.value);
    return r.value;
  };

  const legacy = initial.kind === 'unrecognised' && national.trim() === initialNational.trim() ? initial.raw : null;
  return { country, national, editNational, pickCountry, blur, errorOf, validate, legacy, isDirty: changed() };
}
export type PhoneField = ReturnType<typeof usePhoneField>;

/** Country dropdown + national number input, driven by `usePhoneField`. */
export function PhoneInputs({ state, className }: { state: PhoneField; className?: string }) {
  const id = useId();
  const error = state.errorOf();
  return (
    <fieldset className={cn('m-0 min-w-0 border-0 p-0', className)} aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-2 text-sm font-medium">
        Phone <span className="font-normal text-soft">(optional)</span>
      </legend>
      <div className="grid grid-cols-[minmax(120px,150px)_1fr] gap-3">
        <CountrySelect value={state.country} onChange={state.pickCountry} label="Phone country" invalid={!!error} />
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-label="Phone number"
          aria-invalid={!!error}
          placeholder={state.country ? 'Phone number' : 'Number, or +country code'}
          value={state.national}
          onChange={(e) => state.editNational(e.target.value)}
          onBlur={state.blur}
          className={cn(controlClass(!!error), 'min-h-12')}
        />
      </div>
      {state.legacy && !error && (
        <p className="mt-1.5 text-xs text-soft">
          Saved as “{state.legacy}”. Pick a country to format it; it is kept as is until you change it.
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export interface PhoneFieldHandle {
  validate: () => string | null;
}
/** Self-contained variant (hook + inputs) for a single always-mounted form, e.g. the Profile page. */
export const PhoneFieldWithHandle = forwardRef<
  PhoneFieldHandle,
  { value: string; onChange: (v: string) => void; className?: string }
>(function PhoneFieldWithHandle({ value, onChange, className }, ref) {
  const state = usePhoneField(value, onChange);
  useImperativeHandle(ref, () => ({ validate: state.validate }));
  return <PhoneInputs state={state} className={className} />;
});

export { countryByCode };
