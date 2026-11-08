import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCvs } from '@/shared/api/queries';
import type { ApplicationInput } from '@/shared/api/types';
import { EMPLOYMENT_TYPES, STATUSES, WORK_ARRANGEMENTS } from '@/shared/api/types';
import { cn, todayISO } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { STATUS_STYLE } from '@/shared/ui/Display';
import { Input, Select, Textarea } from '@/shared/ui/Field';

export const applicationSchema = z.object({
  company: z.string().trim().min(1, 'Company is required.'),
  jobTitle: z.string().trim().min(1, 'Job title is required.'),
  status: z.enum(STATUSES),
  jobUrl: z.string().trim().optional(),
  location: z.string().trim().optional(),
  workArrangement: z.string().optional(),
  employmentType: z.string().optional(),
  dateApplied: z
    .string()
    .optional()
    .refine((d) => !d || d <= todayISO(), 'The date cannot be in the future.'),
  followUpDate: z.string().optional(),
  cvId: z.string().optional(),
  notes: z.string().max(1000, 'Keep notes under 1000 characters.').optional(),
});

type FormValues = z.input<typeof applicationSchema>;

// Enum/date fields must never be sent as '' (the backend would reject it), so an empty
// choice means "unset" and is dropped. Text fields and cvId keep '' on purpose, so the
// user can clear a note or unlink a CV. Required fields always stay.
const STRIP_WHEN_EMPTY = new Set(['workArrangement', 'employmentType', 'dateApplied', 'followUpDate']);

function clean(v: FormValues): ApplicationInput {
  const out: Record<string, unknown> = { company: v.company, jobTitle: v.jobTitle, status: v.status };
  for (const k of ['jobUrl', 'location', 'workArrangement', 'employmentType', 'dateApplied', 'followUpDate', 'cvId', 'notes'] as const) {
    const val = v[k];
    if (val === undefined) continue;
    if (val === '' && STRIP_WHEN_EMPTY.has(k)) continue;
    out[k] = val;
  }
  return out as ApplicationInput;
}

export function ApplicationForm({
  defaults,
  onSubmit,
  submitLabel,
  onCancel,
  showStatus = true,
}: {
  defaults?: Partial<ApplicationInput>;
  onSubmit: (v: ApplicationInput) => Promise<unknown>;
  submitLabel: string;
  onCancel: () => void;
  showStatus?: boolean;
}) {
  const cvs = useCvs();
  const { register, handleSubmit, watch, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      company: '',
      jobTitle: '',
      status: 'Applied',
      jobUrl: '',
      location: '',
      workArrangement: '',
      employmentType: '',
      dateApplied: todayISO(),
      followUpDate: '',
      notes: '',
      cvId: '',
      ...defaults,
    },
  });
  const status = watch('status');
  const e = formState.errors;

  // The CV <select> is filled asynchronously, so a default cvId (e.g. handed over from Job
  // Match) cannot be applied until its <option> exists. Apply it once the list has loaded.
  const appliedCv = useRef(false);
  useEffect(() => {
    const want = defaults?.cvId;
    if (appliedCv.current || !want || !cvs.data) return;
    appliedCv.current = true;
    if (cvs.data.some((c) => c.id === want)) setValue('cvId', want);
  }, [cvs.data, defaults?.cvId, setValue]);

  return (
    <form noValidate onSubmit={handleSubmit((v) => onSubmit(clean(v)))} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Company" placeholder="Allegro" error={e.company?.message} {...register('company')} />
        <Input
          label="Job title"
          placeholder="Junior Frontend Developer"
          error={e.jobTitle?.message}
          {...register('jobTitle')}
        />
        <Input
          label="Date applied"
          type="date"
          optional
          max={todayISO()}
          error={e.dateApplied?.message}
          {...register('dateApplied')}
        />
        <Input label="Job post link" optional placeholder="company.com/careers/..." {...register('jobUrl')} />
        <Input label="Location" optional placeholder="Warsaw / Remote" {...register('location')} />
        <Select label="Work arrangement" optional {...register('workArrangement')}>
          <option value="">Not set</option>
          {WORK_ARRANGEMENTS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </Select>
        <Select label="Employment type" optional {...register('employmentType')}>
          <option value="">Not set</option>
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input label="Follow-up date" type="date" optional {...register('followUpDate')} />
      </div>
      {showStatus && (
        <fieldset>
          <legend className="mb-2.5 text-sm font-medium">Status</legend>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setValue('status', s)}
                className={cn(
                  'min-h-10 rounded-full border px-4 text-sm font-medium transition-all active:scale-95',
                  status === s
                    ? `${STATUS_STYLE[s].slab} border-transparent text-[#1c2b22]`
                    : 'border-line bg-surface text-ink hover:bg-tint',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <Select label="CV you sent" optional {...register('cvId')}>
        <option value="">Not linked</option>
        {cvs.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Textarea
        label="Notes"
        optional
        rows={3}
        placeholder="Who referred you, salary range, next steps…"
        error={e.notes?.message}
        {...register('notes')}
      />
      <div className="flex flex-wrap justify-end gap-2.5 pt-1">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={formState.isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
