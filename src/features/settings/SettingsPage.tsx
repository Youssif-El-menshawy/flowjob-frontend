import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthProvider';
import { loginPassword, newPassword } from '@/features/auth/passwordValidation';
import { ApiError, USE_MOCKS } from '@/shared/api/client';
import {
  exportData,
  useChangePassword,
  useConnectGmail,
  useDeleteAccount,
  useDisconnectGmail,
  useGmail,
  useSetAutoSync,
  useSyncGmail,
  useUpdateMe,
} from '@/shared/api/queries';
import { useDocumentTitle } from '@/shared/lib/hooks';
import { useTheme } from '@/shared/lib/theme';
import { cn, downloadJson, fmtRelative } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/Button';
import { Card, Note, PageHeader, Segmented } from '@/shared/ui/Display';
import { Input } from '@/shared/ui/Field';
import { ConfirmDialog, Modal, useToast } from '@/shared/ui/Overlay';
import { Skeleton } from '@/shared/ui/Spinner';

function Switch({
  on, onChange, label, disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        'flex h-[30px] w-[52px] shrink-0 items-center rounded-full p-[3px] transition-colors duration-200',
        on ? 'bg-primary' : 'bg-line',
      )}
    >
      <span
        className={cn(
          'size-6 rounded-full bg-white shadow transition-transform duration-200',
          on && 'translate-x-[22px]',
        )}
      />
    </button>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const change = useChangePassword();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
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
      onClose={onClose}
      title="Change password"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
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

          {USE_MOCKS ? (
            <DemoDataCard />
          ) : (
            <Card className="flex flex-col gap-3 animate-in" style={{ animationDelay: '.12s' }}>
              <h2 className="text-[17px] font-semibold">Your data</h2>
              <p className="leading-relaxed text-soft">
                Data export and account deletion are currently unavailable in connected mode.
              </p>
            </Card>
          )}
        </div>

        {USE_MOCKS ? (
          <DemoGmailCard />
        ) : (
          <Card className="flex flex-col gap-5 animate-in" style={{ animationDelay: '.08s' }}>
            <h2 className="text-[17px] font-semibold">Gmail</h2>
            <p className="leading-relaxed text-soft">
              Gmail integration is currently unavailable in connected mode. You can update application
              statuses manually from Applications.
            </p>
          </Card>
        )}
      </div>

      <PasswordModal open={pw} onClose={() => setPw(false)} />
    </>
  );
}

function DemoDataCard() {
  const toast = useToast();
  const nav = useNavigate();
  const { logout } = useAuth();
  const del = useDeleteAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  return (
    <>
      <Card className="flex flex-col gap-3 animate-in" style={{ animationDelay: '.12s' }}>
        <h2 className="text-[17px] font-semibold">Your data</h2>
        <p className="leading-relaxed text-soft">
          Download the data stored for your demo account, or delete that account and its data.
        </p>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <Button
            variant="secondary"
            loading={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                downloadJson('flowjob-data.json', await exportData());
                toast({ text: 'Your data was downloaded.' });
              } catch {
                toast({ text: 'Could not download your data. Try again.', tone: 'error' });
              } finally {
                setExporting(false);
              }
            }}
          >
            Download my data
          </Button>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete account
          </Button>
        </div>
      </Card>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete your account?"
        text="Your profile, CVs, matches and applications will be deleted for good. This cannot be undone."
        confirmLabel="Delete my account"
        danger
        loading={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: async () => {
              await logout().catch(() => {});
              nav('/', { replace: true });
            },
            onError: () => toast({ text: 'Could not delete your account. Try again.', tone: 'error' }),
          })
        }
      />
    </>
  );
}

function DemoGmailCard() {
  const toast = useToast();
  const gmail = useGmail();
  const connect = useConnectGmail();
  const disconnect = useDisconnectGmail();
  const autoSync = useSetAutoSync();
  const sync = useSyncGmail();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const g = gmail.data;

  return (
    <>
      <Card className="flex flex-col gap-5 animate-in" style={{ animationDelay: '.08s' }}>
        <h2 className="text-[17px] font-semibold">Gmail</h2>
        {gmail.isLoading ? (
          <div role="status" aria-label="Loading Gmail settings">
            <Skeleton className="h-40" />
          </div>
        ) : gmail.isError || !g ? (
          <div className="flex flex-col items-start gap-3">
            <p role="alert" className="text-sm text-danger">Could not load Gmail settings.</p>
            <Button variant="secondary" loading={gmail.isFetching} onClick={() => void gmail.refetch()}>
              Retry
            </Button>
          </div>
        ) : g.connected ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-success-bg px-5 py-4 text-success-ink">
              <div>
                <p className="font-medium">Connected · {g.email}</p>
                <p className="text-[13px]">Simulated connection</p>
              </div>
              <p className="text-[13px] font-medium">Last checked {fmtRelative(g.lastSyncAt)}</p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Check automatically</p>
                <p className="text-[13px] text-soft">Demo auto-sync preference</p>
              </div>
              <Switch
                label="Check automatically"
                on={g.autoSync}
                disabled={autoSync.isPending}
                onChange={(v) =>
                  autoSync.mutate(v, {
                    onError: () => toast({ text: 'Could not update Gmail settings. Try again.', tone: 'error' }),
                  })
                }
              />
            </div>
            <div className="flex justify-between border-t border-line pt-4 text-[15px]">
              <span className="text-soft">This month</span>
              <span>{g.updatesThisMonth} updates</span>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button
                loading={sync.isPending}
                onClick={() =>
                  sync.mutate(undefined, {
                    onSuccess: (r) =>
                      toast({
                        text: r.newSuggestions
                          ? `Checked ${r.checked} emails. ${r.newSuggestions} reply needs your review.`
                          : `Checked ${r.checked} emails. Nothing new.`,
                      }),
                    onError: () =>
                      toast({ text: 'Could not reach Gmail. Try again later.', tone: 'error' }),
                  })
                }
              >
                {sync.isPending ? 'Checking…' : 'Check now'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDisconnect(true)}>
                Disconnect Gmail
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="leading-relaxed text-soft">
              Connect Gmail and FlowJob can spot replies from companies, then update the matching
              application or ask you first when it is unsure.
            </p>
            <Button
              className="self-start"
              loading={connect.isPending}
              onClick={() =>
                connect.mutate(undefined, {
                  onSuccess: () => toast({ text: 'Gmail connected.' }),
                  onError: () => toast({ text: 'Could not connect Gmail. Try again.', tone: 'error' }),
                })
              }
            >
              Connect Gmail
            </Button>
          </>
        )}
        <Note className="mt-1">
          <p className="font-medium">Demo Gmail</p>
          <p className="mt-1 text-soft">This demo uses simulated messages and does not access your inbox.</p>
        </Note>
      </Card>
      <ConfirmDialog
        open={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        title="Disconnect Gmail?"
        text="This disconnects the simulated Gmail account. Your applications stay as they are."
        confirmLabel="Disconnect"
        loading={disconnect.isPending}
        onConfirm={() =>
          disconnect.mutate(undefined, {
            onSuccess: () => {
              setConfirmDisconnect(false);
              toast({ text: 'Gmail disconnected.' });
            },
            onError: () => toast({ text: 'Could not disconnect Gmail. Try again.', tone: 'error' }),
          })
        }
      />
    </>
  );
}
