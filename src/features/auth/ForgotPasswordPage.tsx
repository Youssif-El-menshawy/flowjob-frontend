import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { api, USE_MOCKS } from '@/shared/api/client';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { Button, ButtonLink } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Field';
import { AuthShell } from './AuthShell';

const schema = z.object({ email: z.string().trim().email('Please enter a valid email address.') });

export default function ForgotPasswordPage() {
  useDocumentTitle('Reset password');
  if (USE_MOCKS) return <DemoPasswordReset />;

  return (
    <AuthShell
      title="Password recovery"
      text="If you are already signed in, you can change your password in Settings."
    >
      <h1 className="text-[36px] font-semibold">Reset your password.</h1>
      <p className="mt-2 text-soft">Password reset is currently unavailable in connected mode.</p>
      <ButtonLink to="/login" className="mt-8 min-h-12" full>
        Back to log in
      </ButtonLink>
    </AuthShell>
  );
}

function DemoPasswordReset() {
  const [sentTo, setSentTo] = useState('');
  const [requestError, setRequestError] = useState('');
  const { register, handleSubmit, formState } = useForm<{ email: string }>({ resolver: zodResolver(schema) });

  return (
    <AuthShell
      title="It happens to everyone."
      text="Try the password recovery flow in demo mode."
    >
      {sentTo ? (
        <div className="animate-in">
          <h1 className="text-[36px] font-semibold">Demo request complete.</h1>
          <p className="mt-3 leading-relaxed text-soft">
            The demo accepted the request for <strong className="font-medium text-ink">{sentTo}</strong>.
            No email was sent.
          </p>
          <ButtonLink to="/login" className="mt-8 min-h-12" full>
            Back to log in
          </ButtonLink>
        </div>
      ) : (
        <>
          <h1 className="text-[36px] font-semibold">Reset your password.</h1>
          <p className="mt-2 text-soft">Enter an email address to simulate a reset request.</p>
          <form
            noValidate
            className="mt-8 flex flex-col gap-5"
            onSubmit={handleSubmit(async ({ email }) => {
              setRequestError('');
              try {
                await api('/auth/forgot-password', { method: 'POST', json: { email } });
                setSentTo(email);
              } catch {
                setRequestError('Could not complete the demo reset request. Try again.');
              }
            })}
          >
            {requestError && <p role="alert" className="text-sm text-danger">{requestError}</p>}
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
