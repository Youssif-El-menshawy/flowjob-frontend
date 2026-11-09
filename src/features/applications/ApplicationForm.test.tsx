import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ cvs: { data: undefined as { id: string; name: string }[] | undefined } }));
vi.mock('@/shared/api/queries', () => ({ useCvs: () => mocks.cvs }));

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
