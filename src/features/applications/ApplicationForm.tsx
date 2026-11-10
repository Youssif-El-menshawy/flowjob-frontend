import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ApiError } from '@/shared/api/client';
import { useCvs } from '@/shared/api/queries';
import type { ApplicationInput, ApplicationPatch } from '@/shared/api/types';
import { EMPLOYMENT_TYPES, STATUSES, WORK_ARRANGEMENTS } from '@/shared/api/types';
import { cn, todayISO } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { STATUS_STYLE } from '@/shared/ui/Display';
import { Input, Select, Textarea } from '@/shared/ui/Field';

export const applicationSchema = z.object({
  company: z.string().trim().min(1, 'Company is required.').refine((text) => [...text].length <= 200, 'Use at most 200 characters.'),
  jobTitle: z.string().trim().min(1, 'Job title is required.').refine((text) => [...text].length <= 200, 'Use at most 200 characters.'),
  status: z.enum(STATUSES),
  jobUrl: z.string().trim().optional(),
  location: z.string().trim().optional(),
  workArrangement: z.union([z.enum(WORK_ARRANGEMENTS), z.literal('')]).optional(),
  employmentType: z.string().optional(),
  dateApplied: z
    .string()
    .optional()
    .refine((d) => !d || d <= todayISO(), 'The date cannot be in the future.'),
  followUpDate: z.string().optional(),
  cvId: z.string().optional(),
  notes: z.string().refine((text) => [...text].length <= 5000, 'Use at most 5000 characters.').optional(),
});

type FormValues = z.input<typeof applicationSchema>;

function applicationPayload(v: FormValues, cvId: string | null): ApplicationInput {
  return {
    company: v.company,
    jobTitle: v.jobTitle,
    status: v.status,
    jobUrl: v.jobUrl || null,
    location: v.location || null,
    workArrangement: v.workArrangement || null,
    employmentType: v.employmentType || null,
    dateApplied: v.dateApplied || null,
    followUpDate: v.followUpDate || null,
    notes: v.notes || null,
    cvId,
  };
}

type ApplicationFormProps = {
  defaults?: Partial<ApplicationInput>;
  submitLabel: string;
  onCancel: () => void;
} & (
  | { mode?: 'create'; onSubmit: (v: ApplicationInput) => Promise<unknown> }
  | { mode: 'edit'; onSubmit: (v: ApplicationPatch) => Promise<unknown> }
);

export function ApplicationForm(props: ApplicationFormProps) {
  const { defaults, submitLabel, onCancel } = props;
  const editing = props.mode === 'edit';
  const cvs = useCvs();
  const { control, register, handleSubmit, watch, setValue, setError, formState } = useForm<FormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      company: defaults?.company ?? '',
      jobTitle: defaults?.jobTitle ?? '',
      status: defaults?.status ?? 'Applied',
      jobUrl: defaults?.jobUrl ?? '',
      location: defaults?.location ?? '',
      workArrangement: defaults?.workArrangement ?? '',
      employmentType: defaults?.employmentType ?? '',
      dateApplied: defaults?.dateApplied ?? (editing ? '' : todayISO()),
      followUpDate: defaults?.followUpDate ?? '',
      notes: defaults?.notes ?? '',
      cvId: defaults?.cvId ?? '',
    },
  });
  const status = watch('status');
  const { dirtyFields, errors: e } = formState;
  const available = (id?: string) => cvs.data?.some((cv) => cv.id === id);

  const submit = async (v: FormValues) => {
    const selectedCv = v.cvId && available(v.cvId) ? v.cvId : null;
    if (editing && dirtyFields.cvId && v.cvId && !selectedCv) {
      setError('cvId', { type: 'validate', message: 'This CV is no longer available. Choose another CV or remove the attachment.' });
      return;
    }
    const payload = applicationPayload(v, selectedCv);
    try {
      if (props.mode === 'edit') {
        const patch = Object.fromEntries(
          Object.entries(payload).filter(([key]) => dirtyFields[key as keyof ApplicationInput]),
        ) as ApplicationPatch;
        await props.onSubmit(patch);
      } else {
        await props.onSubmit(payload);
      }
    } catch (error) {
      const message = error instanceof ApiError
        ? Object.values(error.fieldErrors ?? {})[0] ?? error.message
        : 'Could not save the application. Please try again.';
      setError('root.server', { type: 'server', message });
    }
  };

  return (
    <form noValidate onSubmit={handleSubmit(submit)} className="flex flex-col gap-5">
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
          {defaults?.employmentType && !EMPLOYMENT_TYPES.some((type) => type === defaults.employmentType) && (
            <option value={defaults.employmentType}>{defaults.employmentType}</option>
          )}
          {EMPLOYMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Input label="Follow-up date" type="date" optional {...register('followUpDate')} />
      </div>
      {!editing && (
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
      <Controller
        control={control}
        name="cvId"
        render={({ field }) => {
          const value = field.value ?? '';
          const found = !!value && available(value);
          const attached = editing ? defaults?.cvId : undefined;
          const showAttachment = !!attached && !available(attached);
          const showUnavailableChoice = editing && !!value && value !== attached && !found;
          const currentLabel = cvs.isError ? 'Could not load attached CV'
            : cvs.data ? 'CV no longer available' : 'Loading attached CV…';
          return (
            <Select label="CV you sent" optional error={e.cvId?.message} {...field} value={editing || found ? value : ''}>
              {showAttachment && <option value={attached}>{currentLabel}</option>}
              {showUnavailableChoice && <option value={value}>Selected CV no longer available</option>}
              <option value="">Not linked</option>
              {cvs.data?.map((cv) => <option key={cv.id} value={cv.id}>{cv.name}</option>)}
            </Select>
          );
        }}
      />
      <Textarea
        label="Notes"
        optional
        rows={3}
        placeholder="Who referred you, salary range, next steps…"
        error={e.notes?.message}
        {...register('notes')}
      />
      {e.root?.server?.message && <p role="alert" className="text-sm text-danger">{e.root.server.message}</p>}
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
