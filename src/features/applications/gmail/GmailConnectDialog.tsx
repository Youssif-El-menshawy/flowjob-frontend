import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/Overlay';

/** Shown before Google OAuth so the user knows what access and analysis they are agreeing to. */
export function GmailConnectDialog({
  open,
  onClose,
  onContinue,
  loading,
  reconnect = false,
}: {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  loading?: boolean;
  reconnect?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={reconnect ? 'Reconnect Gmail' : 'Connect Gmail'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onContinue} loading={loading}>
            Continue to Google
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed text-soft">
        <p>
          FlowJob gets <strong className="font-semibold text-ink">read-only</strong> access to your Gmail. It
          looks for recruitment emails from the last 30 days, then checks again every few hours while FlowJob is
          running.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Likely recruitment emails are analysed with OpenAI after contact details, quoted replies and
            signatures are removed. Attachments are never read.
          </li>
          <li>Clear applications are added for you. Anything uncertain, and every status change, waits for your review.</li>
          <li>FlowJob keeps only short excerpts and dates, never whole emails.</li>
          <li>
            Disconnect at any time to erase the Gmail data, including suggestions you dismissed. Your applications
            stay. If you connected before, dismissed suggestions may appear again.
          </li>
        </ul>
      </div>
    </Modal>
  );
}
