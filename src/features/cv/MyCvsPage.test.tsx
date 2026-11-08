import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Cv } from '@/shared/api/types';

const cvs = [
  { id: 'o1', name: 'Original CV', kind: 'original', createdAt: '2026-01-01', updatedAt: '2026-01-01', content: {} },
  { id: 't1', name: 'Hays v1', kind: 'tailored', jobTitle: 'Dev', company: 'Hays', createdAt: '2026-02-01', updatedAt: '2026-02-01', content: {} },
] as unknown as Cv[];

vi.mock('@/shared/api/queries', () => ({
  useCvs: () => ({ data: cvs, isLoading: false }),
  useDeleteCv: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('./CvSheet', () => ({ CvSheet: () => null }));
vi.mock('./CvPreviewModal', () => ({ CvPreviewModal: () => null }));

import MyCvsPage from './MyCvsPage';
import { ToastProvider } from '@/shared/ui/Overlay';

afterEach(cleanup);

describe('My CVs → Edit', () => {
  it('opens each CV in the builder by its id', () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <MyCvsPage />
        </ToastProvider>
      </MemoryRouter>,
    );
    const hrefs = screen.getAllByRole('link', { name: 'Edit' }).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/app/cv-builder/t1');
    expect(hrefs.every((h) => h?.startsWith('/app/cv-builder'))).toBe(true); // original opens the default route
  });
});
