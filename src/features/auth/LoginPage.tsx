import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, USE_MOCKS } from '@/shared/api/client';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { useAuth } from './AuthProvider';
import { Icon } from '@/shared/ui/Icons';
import { AuthShell } from './AuthShell';
import { loginPassword } from './passwordValidation';

const schema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: loginPassword,
});
type Form = z.infer<typeof schema>;

export default function LoginPage() {
  useDocumentTitle('Log in');
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [formError, setFormError] = useState('');
  const { register, handleSubmit, setValue, formState } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: Form) => {
    setFormError('');
    try {
      await login(v.email, v.password);
      nav(loc.state?.from ?? '/app', { replace: true });
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Could not log in. Please try again.');
    }
  };

  return (
    <AuthShell
      title="A clearer path forward."
      text="Every application is a step. We keep count, so you can see how far you have come."
    >
      <h1 className="text-[40px] font-semibold">Welcome back.</h1>
      <p className="mt-2 text-soft">Continue where you left off.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 flex flex-col gap-5" noValidate>
        {formError && (
          <div role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger animate-in">
            {formError}
          </div>
        )}
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
            placeholder="Enter your password"
            autoComplete="current-password"
            error={formState.errors.password?.message}
            {...register('password')}
          />
          <Link
            to="/forgot-password"
            className="self-end text-[13px] text-soft hover:text-ink hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button
          type="submit"
          full
          loading={formState.isSubmitting}
          className="mt-1 min-h-12 justify-between px-6"
        >
          <span>Log in</span>
          <Icon.arrowRight />
        </Button>
        {USE_MOCKS && (
          <button
            type="button"
            className="text-sm font-semibold text-soft hover:text-ink"
            onClick={() => {
              setValue('email', 'sara@flowjob.dev');
              setValue('password', 'flowjob123');
              handleSubmit(onSubmit)();
            }}
          >
            Try the demo account
          </button>
        )}
      </form>
      <p className="mt-8 text-center text-sm text-soft">
        Don’t have an account?{' '}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
