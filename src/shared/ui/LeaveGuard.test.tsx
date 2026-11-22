import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { Link, RouterProvider, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardedRouter, unload } from '@/test/guardedRouter';
import { useLeaveControl, useLeaveGuard, type LeaveGuardOptions } from './LeaveGuard';
import { Modal } from './Overlay';

afterEach(cleanup);

const COPY = { title: 'Leave this page?', message: 'Your notes are not saved.' };

/** A page with a text field whose unsaved text is protected, plus the ways out the app uses. */
function NotesPage({ guard }: { guard?: Partial<LeaveGuardOptions> }) {
  const [text, setText] = useState('');
  const nav = useNavigate();
  const leave = useLeaveControl();
  const { confirm } = useLeaveGuard({ when: !!text, ...COPY, ...guard });
  return (
    <>
      <h1>Notes</h1>
      <label>Notes<input value={text} onChange={(e) => setText(e.target.value)} /></label>
      <Link to="/elsewhere">Elsewhere</Link>
      <Link to="/notes?tab=2">Same page</Link>
      <button onClick={() => leave.bypass(() => nav('/saved'))}>Save and go</button>
      <button onClick={() => confirm(() => setText(''))}>Clear</button>
    </>
  );
}

function renderNotes(guard?: Partial<LeaveGuardOptions>) {
  const router = guardedRouter([
    { path: '/notes', element: <NotesPage guard={guard} /> },
    { path: '/elsewhere', element: <h1>Elsewhere page</h1> },
    { path: '/saved', element: <h1>Saved page</h1> },
    { path: '/start', element: <h1>Start page</h1> },
  ], ['/start', '/notes'], 1);
  render(<RouterProvider router={router} />);
  return router;
}
const type = (value: string) => fireEvent.change(screen.getByLabelText('Notes'), { target: { value } });
const dialog = () => screen.getByRole('dialog', { name: COPY.title });

describe('no unsaved work', () => {
  it('never prompts or warns', () => {
    const router = renderNotes();
    expect(unload()).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(screen.getByRole('heading', { name: 'Elsewhere page' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/elsewhere');
  });

  it('runs a guarded action at once', () => {
    renderNotes();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('internal navigation with unsaved work', () => {
  it('asks in the app dialog: Stay keeps the work, Leave continues', () => {
    const onLeave = vi.fn();
    const router = renderNotes({ onLeave });
    type('draft');
    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(within(dialog()).getByText(COPY.message)).toBeVisible();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/notes');
    expect(screen.getByLabelText('Notes')).toHaveValue('draft');
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Elsewhere page' })).toBeInTheDocument();
  });

  it('protects the browser Back button', async () => {
    const router = renderNotes();
    type('draft');
    await act(() => router.navigate(-1));
    expect(dialog()).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/notes');
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/start'));
  });

  it('lets navigation within the same page through', () => {
    const router = renderNotes();
    type('draft');
    fireEvent.click(screen.getByRole('link', { name: 'Same page' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.search).toBe('?tab=2');
  });

  it('never blocks the navigation that follows a successful save, and keeps protecting afterwards', async () => {
    const router = renderNotes();
    type('draft');
    fireEvent.click(screen.getByRole('button', { name: 'Save and go' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/saved');
    await act(() => router.navigate('/notes'));
    type('new draft');
    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(dialog()).toBeInTheDocument();
  });

  it('keeps Leave unavailable while the work is still being saved', () => {
    renderNotes({ busy: true });
    type('draft');
    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(within(dialog()).getByRole('button', { name: 'Leave' })).toBeDisabled();
  });
});

describe('refresh and closing the tab', () => {
  it('uses the native warning only while something would be lost', () => {
    renderNotes();
    expect(unload()).toBe(true);
    type('draft');
    expect(unload()).toBe(false);
    type('');
    expect(unload()).toBe(true);
  });

  it('can protect in-app navigation without the native warning', () => {
    renderNotes({ unload: false });
    type('draft');
    expect(unload()).toBe(true);
  });
});

describe('the confirmation dialog', () => {
  it('is an accessible modal that focuses Stay, and Escape or the backdrop means Stay', async () => {
    const router = renderNotes();
    type('draft');
    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    const box = dialog();
    expect(box).toHaveAttribute('aria-modal', 'true');
    await waitFor(() => expect(within(box).getByRole('button', { name: 'Stay' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/notes');

    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    fireEvent.click(document.querySelector('[aria-hidden].absolute.inset-0')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(router.state.location.pathname).toBe('/notes');
  });

  it('stacks full-width buttons on phones with Stay on top', () => {
    renderNotes();
    type('draft');
    fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
    const stay = within(dialog()).getByRole('button', { name: 'Stay' });
    const leave = within(dialog()).getByRole('button', { name: 'Leave' });
    const footer = stay.parentElement!;
    expect(footer).toBe(leave.parentElement);
    // Column-reverse below the sm breakpoint puts the last button (Stay) on top; every button is full width.
    expect(footer.className).toContain('flex-col-reverse');
    expect(footer.className).toContain('[&>*]:w-full');
    expect(footer.lastElementChild).toBe(stay);
    expect(leave.className).toContain('min-h-11'); // a comfortable touch target
  });

  it('shows one dialog at a time, with the page wording when a dialog-level editor is also open', async () => {
    function Page() {
      useLeaveGuard({ when: true, title: 'Leave the page?', message: 'Page work is not saved.' });
      const editor = useLeaveGuard({ when: true, dialog: true, title: 'Discard the entry?', message: 'Entry edits.' });
      const [open, setOpen] = useState(true);
      return (
        <>
          <Link to="/elsewhere">Elsewhere</Link>
          <Modal open={open} onClose={() => editor.confirm(() => setOpen(false))} title="Entry editor">
            <p>editor</p>
          </Modal>
        </>
      );
    }
    const router = guardedRouter([
      { path: '/page', element: <Page /> },
      { path: '/elsewhere', element: <h1>Elsewhere page</h1> },
      { path: '/start', element: <h1>Start page</h1> },
    ], ['/start', '/page'], 1);
    render(<RouterProvider router={router} />);
    // Leaving the page: the page speaks for everything on it.
    await act(() => router.navigate('/elsewhere'));
    expect(screen.getByRole('dialog', { name: 'Leave the page?' })).toBeInTheDocument();
    await act(() => router.navigate(-1)); // a second way out while asking: no second dialog
    expect(screen.getAllByRole('dialog').filter((d) => d.getAttribute('aria-label') !== 'Entry editor')).toHaveLength(1);
    fireEvent.keyDown(document, { key: 'Escape' }); // only the top dialog answers
    expect(screen.queryByRole('dialog', { name: 'Leave the page?' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Entry editor' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/page');

    // Closing just the editor: its own wording.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Discard the entry?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(screen.queryByRole('dialog', { name: 'Entry editor' })).toBeNull();
  });

  it('asks before an app exit such as logging out, and runs it only on Leave', async () => {
    const exit = vi.fn();
    function Page() {
      useLeaveGuard({ when: true, ...COPY });
      const { confirmExit } = useLeaveControl();
      return <button onClick={() => confirmExit(exit, { title: 'Log out?', leaveLabel: 'Log out' })}>Log out</button>;
    }
    render(<RouterProvider router={guardedRouter([{ path: '/', element: <Page /> }])} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    const box = screen.getByRole('dialog', { name: 'Log out?' });
    expect(within(box).getByText(COPY.message)).toBeVisible();
    fireEvent.click(within(box).getByRole('button', { name: 'Stay' }));
    expect(exit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(exit).toHaveBeenCalledTimes(1));
  });

  it('does not add the native warning after confirming a redirect away from the app', async () => {
    const assign = vi.fn();
    function Page() {
      useLeaveGuard({ when: true, ...COPY });
      const { confirmExit } = useLeaveControl();
      return <button onClick={() => confirmExit(assign, { leavesApp: true })}>Go to Google</button>;
    }
    render(<RouterProvider router={guardedRouter([{ path: '/', element: <Page /> }])} />);
    expect(unload()).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Go to Google' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(unload()).toBe(true); // the page is unloading by choice: the browser must not ask again
  });
});

describe('outside the provider (isolated component tests)', () => {
  it('does nothing and runs actions at once', () => {
    const run = vi.fn();
    function Bare() {
      const { confirm } = useLeaveGuard({ when: true, ...COPY });
      return <button onClick={() => confirm(run)}>Close</button>;
    }
    render(<Bare />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(run).toHaveBeenCalled();
    expect(unload()).toBe(true);
  });
});

describe('Modal focus', () => {
  it('keeps focus in the field being typed in when the parent re-renders with a new onClose', async () => {
    function Editor() {
      const [text, setText] = useState('');
      return (
        <Modal open onClose={() => setText('')} title="Editor" showCloseButton={false}>
          <input aria-label="First" />
          <input aria-label="Second" value={text} onChange={(e) => setText(e.target.value)} />
        </Modal>
      );
    }
    render(<Editor />);
    await waitFor(() => expect(screen.getByLabelText('First')).toHaveFocus());
    const second = screen.getByLabelText('Second');
    second.focus();
    fireEvent.change(second, { target: { value: 'a' } });
    await new Promise((r) => setTimeout(r, 60)); // longer than the dialog's initial focus delay
    expect(second).toHaveFocus();
  });
});
