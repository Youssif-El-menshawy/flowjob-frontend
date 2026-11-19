import { useDocumentTitle } from '@/shared/lib/hooks';
import { ButtonLink } from '@/shared/ui/Button';
import { AuthShell } from './AuthShell';

// The backend has no password-reset endpoint yet, so this page only explains where to change a password.
export default function ForgotPasswordPage() {
  useDocumentTitle('Reset password');

  return (
    <AuthShell
      title="Password recovery"
      text="If you are already signed in, you can change your password in Settings."
    >
      <h1 className="text-[36px] font-semibold">Reset your password.</h1>
      <p className="mt-2 text-soft">Password reset by email is not available yet.</p>
      <ButtonLink to="/login" className="mt-8 min-h-12" full>
        Back to log in
      </ButtonLink>
    </AuthShell>
  );
}
