import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import ProfilePage from './ProfilePage';

const mocks = vi.hoisted(() => ({ profile: {} as Profile, save: vi.fn() }));

vi.mock('@/shared/api/queries', () => ({
  useProfile: () => ({ data: mocks.profile }),
  useSaveProfile: () => ({ mutate: mocks.save, isPending: false }),
}));

function renderPersonalDetails(location: string) {
  mocks.profile = {
    fullName: 'Profile Name',
    email: 'profile@example.test',
    phone: '+33612345678',
    location,
    links: [],
    summary: '',
    experience: [],
    education: [],
    projects: [],
    skills: [],
    languages: '',
  };
  render(
    <MemoryRouter>
      <ToastProvider>
        <ProfilePage />
      </ToastProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Personal details' }));
}

const city = () => screen.getByRole('textbox', { name: /^City/ });
const country = () => screen.getByRole('button', { name: /^Location country:/ });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Profile location', () => {
  it('searches by country name with the keyboard, saves one string, and keeps the phone country', () => {
    renderPersonalDetails('');
    fireEvent.change(city(), { target: { value: 'New ' } });
    expect(city()).toHaveValue('New ');
    fireEvent.change(city(), { target: { value: 'New Town' } });
    fireEvent.click(country());
    const search = screen.getByRole('combobox', { name: 'Search countries' });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'polan' } });
    expect(screen.getByRole('option', { name: 'Poland' })).toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(country()).toHaveAccessibleName('Location country: Poland');
    expect(country()).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Phone country: France +33' })).toBeInTheDocument();

    save();
    expect(mocks.save.mock.calls[0][0]).toEqual({ ...mocks.profile, location: 'New Town, Poland' });
  });

  it('loads slash-separated legacy values and can clear the optional country', () => {
    renderPersonalDetails('Wroclaw/Poland');
    expect(city()).toHaveValue('Wroclaw');
    expect(country()).toHaveAccessibleName('Location country: Poland');
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    fireEvent.click(country());
    fireEvent.click(screen.getByRole('option', { name: 'No country' }));
    save();
    expect(mocks.save.mock.calls[0][0].location).toBe('Wroclaw');
  });

  it('keeps ambiguous legacy text on unrelated saves and restores it on discard', () => {
    const legacy = 'Springfield, IL';
    renderPersonalDetails(legacy);
    expect(city()).toHaveValue(legacy);
    expect(country()).toHaveAccessibleName('Location country: not selected');
    fireEvent.change(city(), { target: { value: 'Chicago' } });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(city()).toHaveValue(legacy);
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Renamed' } });
    save();
    expect(mocks.save.mock.calls[0][0].location).toBe(legacy);
  });
});
