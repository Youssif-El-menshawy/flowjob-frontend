import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { loginPassword, newPassword } from '@/features/auth/passwordValidation';
import { GmailSettingsCard } from '@/features/applications/gmail/GmailSettingsCard';
import { ApiError } from '@/shared/api/client';
import { useChangePassword, useUpdateMe } from '@/shared/api/queries';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { useTheme } from '@/shared/lib/theme';
import { Button } from '@/shared/ui/Button';
import { Card, PageHeader, Segmented } from '@/shared/ui/Display';
import { Input } from '@/shared/ui/Field';
import { useLeaveGuard } from '@/shared/ui/LeaveGuard';
import { Modal, useToast } from '@/shared/ui/Overlay';

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const change = useChangePassword();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  // A typed password is unsaved work: closing the dialog (or leaving the page) asks first.
  const guard = useLeaveGuard({
    when: open && (!!cur || !!next),
    dialog: true,
    busy: change.isPending,
    title: 'Discard the password change?',
    message: 'Your password has not been changed yet.',
    leaveLabel: 'Discard',
    stayLabel: 'Keep editing',
  });
  const requestClose = () => guard.confirm(onClose);
  useEffect(() => {
    if (open) {
      setCur('');
      setNext('');
      setErr({});
    }
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Change password"
      footer={
        <>
          <Button variant="secondary" onClick={requestClose}>
            Cancel
          </Button>
          <Button
            loading={change.isPending}
            onClick={() => {
              const current = loginPassword.safeParse(cur);
              const updated = newPassword.safeParse(next);
              if (!current.success || !updated.success) {
                return setErr({
                  current: current.success ? '' : current.error.issues[0].message,
                  next: updated.success ? '' : updated.error.issues[0].message,
                });
              }
              setErr({});
              change.mutate(
                { current: cur, next },
                {
                  onSuccess: () => {
                    toast({ text: 'Password changed.' });
                    onClose();
                  },
                  onError: (e) =>
                    setErr(
                      e instanceof ApiError && e.fieldErrors
                        ? e.fieldErrors
                        : { current: 'Could not change password.' },
                    ),
                },
              );
            }}
          >
            Change password
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={cur}
          error={err.current}
          onChange={(e) => setCur(e.target.value)}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          error={err.next}
          hint="At least 8 characters."
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
    </Modal>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const toast = useToast();
  const { user, setUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const updateMe = useUpdateMe();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [accErr, setAccErr] = useState<Record<string, string>>({});
  const [pw, setPw] = useState(false);
  const accountDirty = name !== user?.name || email !== user?.email;
  useLeaveGuard({
    when: accountDirty || updateMe.isPending,
    busy: updateMe.isPending,
    title: 'Leave without saving?',
    message: 'Your account changes have not been saved.',
    leaveLabel: 'Discard and leave',
  });

  return (
    <>
      <PageHeader title="Settings" subtitle="Manage your account, appearance and data." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card className="flex flex-col gap-4 animate-in">
            <h2 className="text-[17px] font-semibold">Account</h2>
            <Input
              label="Full name"
              value={name}
              error={accErr.name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={email}
              error={accErr.email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {email !== user?.email && (
              <Input label="Current password (required to change email)" type="password"
                autoComplete="current-password" value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)} />
            )}
            <div className="flex flex-wrap gap-2.5 pt-1">
              <Button
                disabled={!accountDirty}
                loading={updateMe.isPending}
                onClick={() => {
                  setAccErr({});
                  updateMe.mutate(
                    { name, email, currentPassword },
                    {
                      onSuccess: (u) => {
                        setUser(u);
                        setCurrentPassword('');
                        toast({ text: 'Account updated.' });
                      },
                      onError: (e) => setAccErr(e instanceof ApiError && e.fieldErrors ? e.fieldErrors : {}),
                    },
                  );
                }}
              >
                Save changes
              </Button>
              <Button variant="secondary" onClick={() => setPw(true)}>
                Change password
              </Button>
            </div>
          </Card>

          <Card
            className="flex items-center justify-between gap-4 animate-in"
            style={{ animationDelay: '.06s' }}
          >
            <div>
              <h2 className="text-[17px] font-semibold">Appearance</h2>
              <p className="text-sm text-soft">Pick what is easier on your eyes.</p>
            </div>
            <Segmented
              label="Theme"
              options={['Light', 'Dark'] as const}
              value={theme === 'dark' ? 'Dark' : 'Light'}
              onChange={(v) => setTheme(v === 'Dark' ? 'dark' : 'light')}
            />
          </Card>

          <Card className="flex flex-col gap-3 animate-in" style={{ animationDelay: '.12s' }}>
            <h2 className="text-[17px] font-semibold">Your data</h2>
            <p className="leading-relaxed text-soft">
              Data export and account deletion are not available yet.
            </p>
          </Card>
        </div>

        <div className="h-fit">
          <GmailSettingsCard />
        </div>
      </div>

      <PasswordModal open={pw} onClose={() => setPw(false)} />
    </>
  );
}
