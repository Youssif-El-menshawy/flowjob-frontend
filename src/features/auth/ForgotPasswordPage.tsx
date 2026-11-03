import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { api } from '@/shared/api/client';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { AuthShell } from './AuthShell';

const schema = z.object({ email: z.string().trim().email('Please enter a valid email address.') });

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset password');
  const [sentTo, setSentTo] = useState('');
  const { register, handleSubmit, formState } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  return (
    <AuthShell
      title="It happens to everyone."
      text="Reset your password and you will be back on track in a minute."
    >
      {sentTo ? (
        <div className="animate-in">
          <h1 className="text-[36px] font-semibold">Check your inbox.</h1>
          <p className="mt-3 leading-relaxed text-soft">
            If an account exists for <strong className="font-medium text-ink">{sentTo}</strong>, we sent a
            link to reset your password. It works for 30 minutes.
          </p>
          <ButtonLink to="/login" className="mt-8 min-h-12" full>
            Back to log in
          </ButtonLink>
        </div>
      ) : (
        <>
          <h1 className="text-[36px] font-semibold">Reset your password.</h1>
          <p className="mt-2 text-soft">Enter your email and we will send you a reset link.</p>
          <form
            noValidate
            className="mt-8 flex flex-col gap-5"
            onSubmit={handleSubmit(async ({ email }) => {
              await api('/auth/forgot-password', { method: 'POST', json: { email } });
              setSentTo(email);
            })}
          >
            <Input
              label="Email address"
              icon="mail"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={formState.errors.email?.message}
              {...register('email')}
            />
            <Button type="submit" full loading={formState.isSubmitting} className="min-h-12">
              Send reset link
            </Button>
          </form>
          <p className="mt-8 text-center text-sm text-soft">
            Remembered it?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
