import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCvs } from '@/shared/api/queries';
import type { ApplicationInput } from '@/shared/api/types';
import { STATUSES } from '@/shared/api/types';
import { cn, todayISO } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { STATUS_STYLE } from '@/shared/ui/Display';
import { Input, Select, Textarea } from '@/shared/ui/Field';

export const applicationSchema = z.object({
  company: z.string().trim().min(1, 'Company is required.'),
  jobTitle: z.string().trim().min(1, 'Job title is required.'),
  dateApplied: z
    .string()
    .min(1, 'Date is required.')
    .refine((d) => d <= todayISO(), 'The date cannot be in the future.'),
  status: z.enum(STATUSES),
  jobUrl: z.string().trim().optional(),
  cvId: z.string().optional(),
  notes: z.string().max(1000, 'Keep notes under 1000 characters.').optional(),
});

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
  const { register, handleSubmit, watch, setValue, formState } = useForm<ApplicationInput>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      company: '',
      jobTitle: '',
      dateApplied: todayISO(),
      status: 'Applied',
      jobUrl: '',
      notes: '',
      cvId: '',
      ...defaults,
    },
  });
  const status = watch('status');
  const e = formState.errors;

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
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
          max={todayISO()}
          error={e.dateApplied?.message}
          {...register('dateApplied')}
        />
        <Input label="Job post link" optional placeholder="company.com/careers/..." {...register('jobUrl')} />
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
