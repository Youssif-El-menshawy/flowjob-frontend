import { useState } from 'react';
import { formatLocation, parseLocation, type LocationParts } from '@/shared/lib/location';
import { CountrySelect } from '@/shared/ui/CountrySelect';
import { Input } from '@/shared/ui/Field';

export function useLocationField(value: string, onChange: (location: string) => void) {
  // Keep the draft as typed, including spaces and punctuation. Reparse when the parent
  // replaces the value (e.g. Profile's Discard). Reading legacy text never emits a change.
  const [draft, setDraft] = useState(() => ({ ...parseLocation(value), value }));
  const current = draft.value === value ? draft : { ...parseLocation(value), value };
  if (current !== draft) setDraft(current);

  const edit = (parts: LocationParts) => {
    if (parts.city === current.city && parts.country === current.country) return;
    const next = formatLocation(parts);
    setDraft({ ...parts, value: next });
    onChange(next);
  };

  return { current, edit };
}

export function LocationInputs({ state: { current, edit } }: { state: ReturnType<typeof useLocationField> }) {
  return (
    <div className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-2">
      <Input
        label="City"
        optional
        autoComplete="address-level2"
        value={current.city}
        onChange={(e) => edit({ city: e.target.value, country: current.country })}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-sm font-medium">
          Country <span className="font-normal text-soft">(optional)</span>
        </span>
        <CountrySelect
          label="Location country"
          value={current.country}
          onChange={(country) => edit({ city: current.city, country })}
          onClear={() => edit({ city: current.city, country: '' })}
          showDialCode={false}
        />
      </div>
    </div>
  );
}


export function LocationFields({ value, onChange }: { value: string; onChange: (location: string) => void }) {
  const state = useLocationField(value, onChange);
  return <LocationInputs state={state} />;
}
