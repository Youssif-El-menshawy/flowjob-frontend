import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cvs: { data: undefined as { id: string; name: string }[] | undefined } }));
vi.mock('@/shared/api/queries', () => ({ useCvs: () => mocks.cvs }));

import { ApiError } from '@/shared/api/client';
import { ApplicationForm } from './ApplicationForm';

const form = (cvId?: string) => (
  <ApplicationForm
    defaults={{ company: 'Acme', jobTitle: 'Backend Engineer', cvId }}
    submitLabel="Save"
    onSubmit={async () => {}}
    onCancel={() => {}}
  />
);

afterEach(() => {
  cleanup();
  mocks.cvs = { data: undefined };
});

describe('ApplicationForm CV prefill (Job Match handoff)', () => {
  it('applies a default cvId once the async CV list has loaded', () => {
    const { rerender } = render(form('cv1')); // CV list still loading
    mocks.cvs = { data: [{ id: 'cv1', name: 'Original CV' }] };
    rerender(form('cv1')); // list arrives
    expect(screen.getByLabelText(/CV you sent/)).toHaveValue('cv1');
  });

  it('works when the CV list is already cached', () => {
    mocks.cvs = { data: [{ id: 'cv1', name: 'Original CV' }] };
    render(form('cv1'));
    expect(screen.getByLabelText(/CV you sent/)).toHaveValue('cv1');
  });

  it('leaves "Not linked" when the handed-over CV no longer exists', () => {
    const { rerender } = render(form('gone'));
    mocks.cvs = { data: [{ id: 'cv1', name: 'Original CV' }] };
    rerender(form('gone'));
    expect(screen.getByLabelText(/CV you sent/)).toHaveValue('');
  });

  it('defaults to "Not linked" when no cvId is provided', () => {
    mocks.cvs = { data: [{ id: 'cv1', name: 'Original CV' }] };
    render(form(undefined));
    expect(screen.getByLabelText(/CV you sent/)).toHaveValue('');
  });
});


function editForm(onSubmit: ReturnType<typeof vi.fn>, cvId: string | null = 'gone') {
  return (
    <ApplicationForm
      mode="edit"
      defaults={{
        company: 'Acme', jobTitle: 'Backend Engineer', status: 'Interview',
        notes: 'First interview', cvId, followUpDate: '2025-02-01', workArrangement: 'Remote',
      }}
      submitLabel="Save"
      onSubmit={onSubmit}
      onCancel={() => {}}
    />
  );
}

describe('ApplicationForm partial edits', () => {
  it('keeps a missing attachment visible and sends only changed notes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(editForm(onSubmit));
    expect(screen.queryByText('CV no longer available')).not.toBeInTheDocument();
    mocks.cvs = { data: [{ id: 'new', name: 'Replacement' }] };
    rerender(editForm(onSubmit));
    expect(screen.getByLabelText(/CV you sent/)).toHaveDisplayValue('CV no longer available');

    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: 'Second interview' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ notes: 'Second interview' }));
  });

  it.each([
    ['new', 'new'],
    ['', null],
  ])('sends only an explicit replacement or removal (%s)', async (selection, expected) => {
    mocks.cvs = { data: [{ id: 'new', name: 'Replacement' }] };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(editForm(onSubmit));
    fireEvent.change(screen.getByLabelText(/CV you sent/), { target: { value: selection } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cvId: expected }));
  });

  it('keeps an untouched available CV out of a patch and clears optional fields with null', async () => {
    mocks.cvs = { data: [{ id: 'current', name: 'Original CV' }] };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(editForm(onSubmit, 'current'));
    expect(screen.getByLabelText(/CV you sent/)).toHaveValue('current');
    fireEvent.change(screen.getByLabelText(/Follow-up date/), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Work arrangement/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ followUpDate: null, workArrangement: null }));
  });

  it('does not submit a replacement that disappears while the form is open', async () => {
    mocks.cvs = { data: [{ id: 'new', name: 'Replacement' }] };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(editForm(onSubmit));
    fireEvent.change(screen.getByLabelText(/CV you sent/), { target: { value: 'new' } });
    mocks.cvs = { data: [] };
    rerender(editForm(onSubmit));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Choose another CV or remove the attachment/)).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/CV you sent/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ cvId: null }));
  });

  it('shows a rejected attachment save without clearing other edits', async () => {
    mocks.cvs = { data: [{ id: 'new', name: 'Replacement' }] };
    const onSubmit = vi.fn().mockRejectedValue(new ApiError(422, { message: 'Linked CV not found' }));
    render(editForm(onSubmit));
    fireEvent.change(screen.getByLabelText(/CV you sent/), { target: { value: 'new' } });
    fireEvent.change(screen.getByLabelText(/Notes/), { target: { value: 'Keep these edits' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Linked CV not found');
    expect(screen.getByLabelText(/Notes/)).toHaveValue('Keep these edits');
  });
});
