import { useId } from 'react';
import type { Cv } from '@/shared/api/types';
import { cn } from '@/shared/lib/utils';
import { controlClass } from '@/shared/ui/Field';
import { cvOptionLabel, sortCvs } from './cvOptions';

/**
 * "Editing CV" toolbar row: a native select (keyboard + screen-reader friendly) listing every
 * saved CV by stable id. It only reports the chosen id; the page decides whether switching is safe.
 */
export function CvSelector({
  cvs,
  value,
  onSelect,
  disabled,
}: {
  cvs: readonly Cv[];
  value: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="mb-2.5 flex min-h-10 items-center gap-3" data-testid="cv-toolbar">
      <label htmlFor={id} className="shrink-0 text-sm font-medium text-soft">
        Editing CV
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value)}
        className={cn(controlClass(), 'h-10 min-w-0 max-w-[360px] flex-1 truncate py-0 pr-8 text-sm font-medium')}
      >
        {sortCvs(cvs).map((c) => (
          <option key={c.id} value={c.id}>
            {cvOptionLabel(c)}
          </option>
        ))}
      </select>
    </div>
  );
}
