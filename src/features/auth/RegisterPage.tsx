import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/shared/api/client';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { Icon } from '@/shared/ui/Icons';
import { pendingJob } from '@/shared/lib/pendingJob';
import { useAuth } from './AuthProvider';
import { AuthShell, passwordScore } from './AuthShell';
import { newPassword } from './passwordValidation';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').refine((name) => [...name].length <= 200, 'Use at most 200 characters.'),
  email: z.string().trim().email('Please enter a valid email address.'),
  password: newPassword,
  terms: z.literal(true, { errorMap: () => ({ message: 'Please accept the terms to continue.' }) }),
});
type Form = z.infer<typeof registerSchema>;

const HINTS = [
  'Use at least 8 characters.',
  'Add a number to make it stronger.',
  'Good. A capital letter makes it stronger.',
  'Strong password.',
  'Very strong password.',
];
const BAR = ['bg-st-rejected', 'bg-st-review', 'bg-st-offer', 'bg-primary'];

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register: signUp } = useAuth();
  const nav = useNavigate();
  const [formError, setFormError] = useState('');
  const job = pendingJob.label();
  const { register, handleSubmit, watch, setError, formState } = useForm<Form>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const score = passwordScore(watch('password') ?? '');

  const onSubmit = async (v: Form) => {
    setFormError('');
    try {
      await signUp(v.name, v.email, v.password);
      nav('/app/welcome', { replace: true }); // optional first step: import a CV into the Profile, fill it in, or skip
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof Form, { message: m }));
      } else
        setFormError(e instanceof ApiError ? e.message : 'Could not create your account. Please try again.');
    }
  };

  return (
    <AuthShell
      title="Start with one good CV."
      text="Build it once, check it against any job, and keep every application in one calm place."
    >
      {job && (
        <p className="mb-5 rounded-2xl bg-accent-soft px-4 py-3 text-sm leading-relaxed animate-in">
          We saved <strong className="font-medium">{job}</strong> for you. Create your account and we will
          check how you match it.
        </p>
      )}
      <h1 className="text-[40px] font-semibold">Create your account.</h1>
      <p className="mt-2 text-soft">Free for students. Takes under a minute.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
        {formError && (
          <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            {formError}
          </div>
        )}
        <Input
          label="Full name"
          icon="user"
          placeholder="Sara Nowak"
          autoComplete="name"
          error={formState.errors.name?.message}
          {...register('name')}
        />
        <Input
          label="Email address"
          icon="mail"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Password"
            icon="lock"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={formState.errors.password?.message}
            {...register('password')}
          />
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors duration-300',
                  i < score ? BAR[score - 1] : 'bg-line',
                )}
              />
            ))}
          </div>
          {!formState.errors.password && <p className="text-[13px] text-soft">{HINTS[score]}</p>}
        </div>
        <label className="flex items-start gap-3 text-sm leading-relaxed text-soft">
          <input type="checkbox" className="mt-0.5 size-[18px] accent-primary" {...register('terms')} />
          <span>I agree to the Terms and understand how FlowJob uses my CV data.</span>
        </label>
        {formState.errors.terms && (
          <p className="-mt-3 text-[13px] text-danger">{formState.errors.terms.message}</p>
        )}
        <Button type="submit" full loading={formState.isSubmitting} className="min-h-12 justify-between px-6">
          <span>Create account</span>
          <Icon.arrowRight />
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-soft">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
