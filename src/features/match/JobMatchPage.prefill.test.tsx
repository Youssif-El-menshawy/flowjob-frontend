import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => ({ data: [{ id: 'cv1', name: 'My CV', kind: 'original', updatedAt: '2026-01-01' }], isLoading: false }),
  useMatches: () => ({ data: [] }),
  useRunMatch: () => ({ mutate: vi.fn(), isPending: false }),
  useTailorDirect: () => ({ mutate: vi.fn(), isPending: false }),
}));

import JobMatchPage from './JobMatchPage';

afterEach(cleanup);

it('fills the form with a job opened from the Jobs page', () => {
  const job = { title: 'Software Intern', company: 'Bosch Group', url: 'https://jobs.example/j1', description: 'Learn robotics.' };
  render(
    <MemoryRouter initialEntries={[{ pathname: '/app/match', state: { job } }]}>
      <Routes>
        <Route path="/app/match" element={<JobMatchPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByPlaceholderText('Backend Engineer')).toHaveValue('Software Intern');
  expect(screen.getByDisplayValue('Bosch Group')).toBeInTheDocument();
  expect(screen.getByDisplayValue('https://jobs.example/j1')).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Paste the full job post/i)).toHaveValue('Learn robotics.');
});
