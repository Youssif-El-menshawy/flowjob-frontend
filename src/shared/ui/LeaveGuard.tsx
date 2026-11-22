import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useBlocker, useLocation, type BlockerFunction, type Location } from 'react-router-dom';
import { Button } from './Button';
import { Modal } from './Overlay';

/**
 * Interruption protection for the whole app, in one place.
 *
 * Pages register what would be lost with `useLeaveGuard`. The provider owns the single router blocker (React Router
 * supports one at a time), the single confirmation dialog and the single `beforeunload` listener, so there is never
 * more than one prompt. Nothing is shown while no guard is active.
 *
 * - Internal navigation (links, Back, redirects) opens the app's own dialog: Stay or Leave.
 * - Refresh and tab close use the browser's native warning: browsers do not allow custom text there.
 * - Closing an editor or switching items uses the same dialog through the guard's `confirm`.
 * - Navigation that follows a successful save goes through `bypass`, so it is never blocked.
 */

export interface LeaveGuardCopy {
  title: string;
  message: ReactNode;
  /** Defaults to "Leave". */
  leaveLabel?: string;
  /** Defaults to "Stay". */
  stayLabel?: string;
}

export interface LeaveGuardOptions extends LeaveGuardCopy {
  /** True while unsaved work or an in-progress action would be lost. */
  when: boolean;
  /** Also warn on refresh or tab close (default: same as `when`). */
  unload?: boolean;
  /** Navigation that keeps the work, for example within the same page. Default: the same pathname. */
  allow?: (next: Location, current: Location) => boolean;
  /** Runs when the person chooses Leave, before leaving (for example to stop a request this tab started). */
  onLeave?: () => void;
  /** Leave is unavailable while true (for example while a save is still running). */
  busy?: boolean;
  /** An editor dialog on top of a page. When leaving the page, the page's own wording wins over it. */
  dialog?: boolean;
}

interface Entry {
  id: string;
  options: LeaveGuardOptions;
}

type Prompt =
  | { kind: 'navigation'; entry: Entry }
  | { kind: 'action'; entry: Entry; copy: LeaveGuardCopy; run: () => unknown; leavesApp?: boolean };

/** Extra wording for `confirmExit`. `leavesApp` is for an action that unloads the page (a redirect to another
 * site): the refresh warning then stays off, so the browser does not ask a second time. */
export type ExitCopy = Partial<LeaveGuardCopy> & { leavesApp?: boolean };

interface Control {
  register: (entry: { current: Entry }) => () => void;
  bypass: (go: () => void) => void;
  confirm: (entryId: string | null, run: () => unknown, copy?: ExitCopy) => void;
}

const LeaveGuardContext = createContext<Control | null>(null);

const sameScreen = (next: Location, current: Location) => next.pathname === current.pathname;

export function LeaveGuardProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<string, { current: Entry }>());
  // Set while a confirmed or bypassed exit is under way, so it is not blocked or warned about a second time.
  const released = useRef(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const location = useLocation();

  const active = useCallback((id?: string | null): Entry | null => {
    if (id) {
      const entry = entries.current.get(id)?.current;
      return entry?.options.when ? entry : null;
    }
    // Leaving the page loses everything on it, so an active page guard speaks for it. An editor dialog's own
    // wording is used when only the dialog has changes, or when closing just that dialog (the `id` case above).
    let dialog: Entry | null = null;
    for (const ref of entries.current.values()) {
      const { when, dialog: isDialog } = ref.current.options;
      if (when && !isDialog) return ref.current;
      if (when && !dialog) dialog = ref.current;
    }
    return dialog;
  }, []);

  const shouldBlock = useCallback<BlockerFunction>(({ currentLocation, nextLocation }) => {
    if (released.current) return false;
    const entry = active();
    if (!entry) return false;
    const allow = entry.options.allow ?? sameScreen;
    return !allow(nextLocation, currentLocation);
  }, [active]);
  const blocker = useBlocker(shouldBlock);

  // One dialog at a time: a navigation blocked while a prompt is already open is simply cancelled.
  useEffect(() => {
    if (blocker.state !== 'blocked' || prompt?.kind === 'navigation') return; // already asking about this one
    if (prompt) {
      blocker.reset(); // an editor's own question is open: ignore the extra navigation
      return;
    }
    const entry = active();
    if (!entry) {
      blocker.proceed(); // the guard went away in the meantime: nothing left to protect
      return;
    }
    setPrompt({ kind: 'navigation', entry });
  }, [blocker, prompt, active]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (released.current) return;
      for (const ref of entries.current.values()) {
        const { when, unload } = ref.current.options;
        if (when && (unload ?? true)) {
          event.preventDefault();
          event.returnValue = ''; // older browsers need this to show the native warning
          return;
        }
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // A completed navigation ends any release.
  useEffect(() => {
    released.current = false;
  }, [location]);

  const control = useMemo<Control>(() => ({
    register: (ref) => {
      entries.current.set(ref.current.id, ref);
      return () => {
        entries.current.delete(ref.current.id);
      };
    },
    bypass: (go) => {
      released.current = true;
      try {
        go(); // router navigation decides whether to block synchronously
      } finally {
        released.current = false;
      }
    },
    confirm: (entryId, run, copy) => {
      const entry = active(entryId);
      if (!entry) {
        void run();
        return;
      }
      const { leavesApp, ...wording } = copy ?? {};
      setPrompt({ kind: 'action', entry, run, leavesApp, copy: { ...entry.options, ...wording } });
    },
  }), [active]);

  // Stable, so the dialog does not re-run its focus setup on every render of the provider.
  const latest = useRef({ prompt, blocker });
  latest.current = { prompt, blocker };
  const stay = useCallback(() => {
    const { prompt: open, blocker: current } = latest.current;
    if (open?.kind === 'navigation' && current.state === 'blocked') current.reset();
    setPrompt(null);
  }, []);
  const leave = async () => {
    if (!prompt) return;
    const current = prompt;
    setPrompt(null);
    current.entry.options.onLeave?.();
    if (current.kind === 'navigation') {
      if (blocker.state === 'blocked') blocker.proceed();
      return;
    }
    released.current = true;
    try {
      await current.run();
    } finally {
      if (!current.leavesApp) released.current = false;
    }
  };

  const copy: LeaveGuardCopy | null = prompt ? (prompt.kind === 'action' ? prompt.copy : prompt.entry.options) : null;
  const busy = !!prompt && !!active(prompt.entry.id)?.options.busy;

  return (
    <LeaveGuardContext.Provider value={control}>
      {children}
      <Modal
        open={!!prompt}
        onClose={stay}
        title={copy?.title ?? ''}
        size="confirm"
        showCloseButton={false}
        stackFooter
        footer={
          <>
            <Button variant="danger" onClick={() => void leave()} disabled={busy}>
              {copy?.leaveLabel ?? 'Leave'}
            </Button>
            <Button onClick={stay} data-autofocus>
              {copy?.stayLabel ?? 'Stay'}
            </Button>
          </>
        }
      >
        <div className="leading-relaxed break-words text-soft">{copy?.message}</div>
      </Modal>
    </LeaveGuardContext.Provider>
  );
}

/**
 * Protects this component's unsaved work or in-progress action. Returns `confirm`, which runs an action straight away
 * when nothing would be lost and otherwise asks first with this guard's wording (use it for closing an editor or
 * switching items). Outside the provider (isolated component tests) it does nothing and `confirm` runs at once.
 */
export function useLeaveGuard(options: LeaveGuardOptions) {
  const control = useContext(LeaveGuardContext);
  const id = useId();
  const ref = useRef<Entry>({ id, options });
  ref.current = { id, options };
  useLayoutEffect(() => control?.register(ref), [control]);
  const confirm = useCallback(
    (run: () => unknown, copy?: Partial<LeaveGuardCopy>) => (control ? control.confirm(id, run, copy) : void run()),
    [control, id],
  );
  return useMemo(() => ({ confirm }), [confirm]);
}

/** App-wide exits: `bypass` for navigation after a successful save, `confirmExit` for leaving the app (log out,
 * the Gmail redirect) when any guard is active. */
export function useLeaveControl() {
  const control = useContext(LeaveGuardContext);
  return useMemo(() => ({
    bypass: (go: () => void) => (control ? control.bypass(go) : go()),
    confirmExit: (run: () => unknown, copy?: ExitCopy) =>
      control ? control.confirm(null, run, copy) : void run(),
  }), [control]);
}
