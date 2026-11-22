import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Link, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/shared/ui/Overlay';
import { guardedRouter, unload } from '@/test/guardedRouter';
import AddApplicationPage from './AddApplicationPage';

const mocks = vi.hoisted(() => ({
  create: { mutateAsync: vi.fn(), isPending: false },
}));
vi.mock('@/shared/api/queries', () => ({
  useCreateApplication: () => mocks.create,
  useCvs: () => ({ data: [], isError: false }),
}));

afterEach(() => {
  cleanup();
  mocks.create = { mutateAsync: vi.fn(), isPending: false };
});

function renderAdd(entry = '/app/applications/new') {
  const router = guardedRouter([{
    element: <ToastProvider><Outlet /><Link to="/app/cvs">Sidebar: My CVs</Link></ToastProvider>,
    children: [
      { path: '/app/applications/new', element: <AddApplicationPage /> },
      { path: '/app/applications/:id', element: <p>APPLICATION PAGE</p> },
      { path: '/app/cvs', element: <p>MY CVS</p> },
    ],
  }], [entry]);
  render(<RouterProvider router={router} />);
  return router;
}
const sidebar = () => fireEvent.click(screen.getByRole('link', { name: 'Sidebar: My CVs' }));

it('does not ask for an untouched form, including details prefilled from a tailored CV', () => {
  renderAdd('/app/applications/new?company=Acme&jobTitle=Engineer');
  expect(screen.getByLabelText('Company')).toHaveValue('Acme');
  expect(unload()).toBe(true);
  sidebar();
  expect(screen.getByText('MY CVS')).toBeInTheDocument();
});

it('asks before typed details are lost, and opens the saved application without asking', async () => {
  mocks.create.mutateAsync = vi.fn(async () => ({ id: 'a9', company: 'Acme' }));
  const router = renderAdd();
  fireEvent.change(screen.getByLabelText('Company'), { target: { value: 'Acme' } });
  await waitFor(() => expect(unload()).toBe(false));
  sidebar();
  const ask = screen.getByRole('dialog', { name: 'Leave without saving?' });
  expect(ask).toHaveTextContent('This application has not been saved.');
  fireEvent.click(within(ask).getByRole('button', { name: 'Stay' }));
  expect(screen.getByLabelText('Company')).toHaveValue('Acme');

  fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Engineer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save application' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/app/applications/a9'));
  expect(screen.queryByRole('dialog')).toBeNull();
});
