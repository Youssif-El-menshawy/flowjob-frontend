import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/shared/api/types';
import { ToastProvider } from '@/shared/ui/Overlay';
import { AppLayout } from '@/app/AppLayout';
import { LeaveGuardProvider } from '@/shared/ui/LeaveGuard';
import ProfilePage from './ProfilePage';

const mocks = vi.hoisted(() => ({
  profile: undefined as Profile | undefined,
  isError: false,
  isPending: false,
  save: vi.fn(),
  refetch: vi.fn(),
  profileListeners: new Set<() => void>(),
  importAvailable: undefined as boolean | undefined,
}));

function subscribeProfile(listener: () => void) {
  mocks.profileListeners.add(listener);
  return () => { mocks.profileListeners.delete(listener); };
}

function refreshProfile() {
  act(() => mocks.profileListeners.forEach((listener) => listener()));
}

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { name: 'Profile Name', email: 'profile@example.test' }, logout: vi.fn() }),
}));

vi.mock('@/shared/api/queries', () => ({
  useApplications: () => ({ data: [] }),
  useGmail: () => ({ data: undefined }),
  useProfile: () => ({
    data: useSyncExternalStore(subscribeProfile, () => mocks.profile),
    isError: mocks.isError,
    refetch: mocks.refetch,
  }),
  useSaveProfile: () => ({ mutate: mocks.save, isPending: mocks.isPending }),
  useProfileImportStatus: () => ({
    data: mocks.importAvailable === undefined ? undefined : { available: mocks.importAvailable },
  }),
}));

function fixture(overrides: Partial<Profile> = {}): Profile {
  return {
    fullName: 'Profile Name',
    email: 'profile@example.test',
    phone: '+33612345678',
    location: '',
    links: [],
    summary: '',
    experience: [],
    education: [],
    projects: [],
    skills: [],
    languages: '',
    ...overrides,
  };
}

function renderProfile(entries = ['/app/profile'], initialIndex?: number) {
  // As in the app: one interruption guard around every page.
  const router = createMemoryRouter([{
    element: <LeaveGuardProvider><Outlet /></LeaveGuardProvider>,
    children: [{
      path: '/app',
      element: <AppLayout />,
      children: [
        { path: 'profile', element: <ProfilePage /> },
        { path: 'cv-builder', element: <h1>CV Builder destination</h1> },
        { path: 'cvs', element: <h1>My CVs destination</h1> },
        { path: 'applications', element: <h1>Applications destination</h1> },
      ],
    }],
  }], { initialEntries: entries, initialIndex });
  render(<ToastProvider><RouterProvider router={router} /></ToastProvider>);
  return router;
}

function renderPersonalDetails(location: string, languages = '', overrides: Partial<Profile> = {}) {
  mocks.profile = fixture({ location, languages, ...overrides });
  renderProfile();
  tab('Personal details');
}

const city = () => screen.getByRole('textbox', { name: /^City/ });
const country = () => screen.getByRole('button', { name: /^Location country:/ });
const phone = () => screen.getByRole('textbox', { name: 'Phone number' });
const phoneCountry = () => screen.getByRole('button', { name: /^Phone country:/ });
const linkedin = () => screen.getByLabelText(/LinkedIn URL/);
const github = () => screen.getByLabelText(/GitHub URL/);
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name }));
const edit = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
const discard = () => fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  mocks.importAvailable = undefined;
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  mocks.profile = undefined;
  mocks.isError = false;
  mocks.isPending = false;
});

describe('Profile opening tab', () => {
  it('opens on Personal details, where a new profile starts', () => {
    mocks.profile = fixture();
    renderProfile();
    expect(screen.getByRole('tab', { name: 'Personal details' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Profile CV import entry point', () => {
  it('offers the CV import only while the account can still use it', () => {
    mocks.profile = fixture();
    mocks.importAvailable = true;
    renderProfile();
    expect(screen.getByRole('link', { name: 'Import from my CV' })).toHaveAttribute('href', '/app/profile/import');
    cleanup();
    mocks.importAvailable = false;
    renderProfile();
    expect(screen.queryByRole('link', { name: 'Import from my CV' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open CV builder' })).toBeVisible();
  });
});

describe('Profile location', () => {
  it('searches by country name with the keyboard, saves one string, and keeps the phone country', () => {
    renderPersonalDetails('');
    fireEvent.change(city(), { target: { value: 'New ' } });
    expect(city()).toHaveValue('New ');
    tab('Summary');
    tab('Personal details');
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

describe('Profile languages', () => {
  it('keeps the exact legacy string when saving a different field', () => {
    const legacy = 'English - C1 / Arabic - Native / Reading only';
    renderPersonalDetails('', legacy);
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Renamed' } });
    save();
    expect(mocks.save.mock.calls[0][0].languages).toBe(legacy);
  });

  it('saves the edited list in the existing Profile string field', () => {
    renderPersonalDetails('', 'English C1, Arabic Native');
    fireEvent.click(screen.getByRole('button', { name: 'Add language' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add language' }));
    fireEvent.change(dialog.getByLabelText('Language'), { target: { value: 'Polish' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add language' }));
    save();
    expect(mocks.save.mock.calls[0][0]).toEqual({
      ...mocks.profile,
      languages: 'English (C1), Arabic (Native), Polish',
    });
  });
});

describe('Profile draft validation', () => {
  it('blocks an invalid international phone after switching tabs and keeps the entered number', () => {
    renderPersonalDetails('');
    edit(phone(), '123');
    tab('Summary');
    expect(screen.getByText('You have unsaved changes')).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Phone number' })).not.toBeInTheDocument();
    save();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: 'Personal details' })).toHaveAttribute('aria-selected', 'true');
    expect(phone()).toHaveValue('123');
    expect(phoneCountry()).toHaveAccessibleName('Phone country: France +33');
    expect(screen.getByText('Enter a valid France phone number.')).toBeVisible();

    edit(phone(), '+44 7911 123456');
    tab('Experience');
    save();
    expect(mocks.save.mock.calls[0][0].phone).toBe('+447911123456');
  });

  it('counts a country-only edit to an ambiguous number as unsaved and validates it', () => {
    renderPersonalDetails('', '', { phone: '123' });
    fireEvent.click(phoneCountry());
    edit(screen.getByRole('combobox', { name: 'Search countries' }), 'United Kingdom');
    fireEvent.click(screen.getByRole('option', { name: /United Kingdom/ }));
    expect(screen.getByText('You have unsaved changes')).toBeVisible();
    tab('Education');
    save();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid United Kingdom phone number.')).toBeVisible();
    discard();
    expect(phone()).toHaveValue('123');
    expect(phoneCountry()).toHaveAccessibleName('Phone country: not selected');
  });

  it.each([
    ['LinkedIn', linkedin, 'javascript:alert(1)', /starts with https/i],
    ['GitHub', github, 'linkedin.com/in/fixture', /doesn’t look like a GitHub link/],
  ])('blocks an invalid %s URL after switching tabs', (_label, field, invalid, error) => {
    renderPersonalDetails('');
    edit(field(), invalid);
    tab('Education');
    save();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(field()).toHaveValue(invalid);
    expect(screen.getByText(error)).toBeVisible();
  });

  it('validates an edited email when saving from another tab and accepts clearing it', () => {
    renderPersonalDetails('');
    edit(screen.getByLabelText('Email'), 'invalid-address');
    tab('Summary');
    save();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    edit(screen.getByLabelText('Email'), '');
    save();
    expect(mocks.save.mock.calls[0][0].email).toBe('');
  });

  it('validates contact fields on item autosave and keeps the new item in the draft', () => {
    renderPersonalDetails('');
    edit(github(), 'not a valid link');
    tab('Experience');
    fireEvent.click(screen.getByRole('button', { name: '+ Add experience' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Add experience' }));
    edit(dialog.getByLabelText('Job title'), 'Engineer');
    edit(dialog.getByLabelText('Company'), 'Fixture Co');
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(github()).toHaveValue('not a valid link');
    tab('Experience');
    expect(screen.getByRole('heading', { name: 'Engineer' })).toBeVisible();
    expect(screen.getByText('You have unsaved changes')).toBeVisible();
  });

  it('retains pending skills across tabs and includes them in Save', () => {
    renderPersonalDetails('', '', { skills: ['React'] });
    tab('Skills');
    edit(screen.getByLabelText('Add a skill'), 'TypeScript, react');
    tab('Summary');
    tab('Skills');
    expect(screen.getByLabelText('Add a skill')).toHaveValue('TypeScript, react');
    save();
    expect(mocks.save.mock.calls[0][0].skills).toEqual(['React', 'TypeScript']);
  });
});

describe('Profile persistence and navigation', () => {
  it('restores visible values and saves a new edit without reintroducing discarded data', () => {
    const saved = fixture({
      phone: '+33 6 12 34 56 78', location: 'Wroclaw/Poland',
      links: ['portfolio', 'github.com/fixture', 'linkedin.com/in/fixture'],
      languages: 'English (C1), Arabic (Native)',
    });
    renderPersonalDetails(saved.location, saved.languages, saved);
    const originalPhone = (phone() as HTMLInputElement).value;
    edit(phone(), '123');
    edit(linkedin(), 'javascript:alert(1)');
    edit(github(), 'github.com/other');
    edit(city(), 'Another city');
    tab('Summary');
    edit(screen.getByLabelText('Summary'), 'Discard this summary');
    save();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid France phone number.')).toBeVisible();
    discard();

    expect(phone()).toHaveValue(originalPhone);
    expect(phoneCountry()).toHaveAccessibleName('Phone country: France +33');
    expect(linkedin()).toHaveValue('linkedin.com/in/fixture');
    expect(github()).toHaveValue('github.com/fixture');
    expect(city()).toHaveValue('Wroclaw');
    expect(screen.queryByText('Enter a valid France phone number.')).not.toBeInTheDocument();
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
    tab('Summary');
    expect(screen.getByLabelText('Summary')).toHaveValue('');

    edit(screen.getByLabelText('Summary'), 'A different edit');
    save();
    expect(mocks.save.mock.calls[0][0]).toEqual({ ...saved, summary: 'A different edit' });
  });

  it('uses the last successful response as the new Discard baseline', () => {
    renderPersonalDetails('');
    edit(github(), 'github.com/new-user');
    save();
    const [payload, callbacks] = mocks.save.mock.calls[0];
    act(() => callbacks.onSuccess({ ...payload, fullName: 'Name returned by server' }));
    expect(screen.getByLabelText('Full name')).toHaveValue('Name returned by server');
    expect(github()).toHaveValue('https://github.com/new-user');
    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();

    edit(github(), 'github.com/discard-me');
    discard();
    expect(github()).toHaveValue('https://github.com/new-user');
    expect(screen.getByLabelText('Full name')).toHaveValue('Name returned by server');
  });

  it('shows an initial load error and opens the Profile after Retry succeeds', () => {
    mocks.isError = true;
    renderProfile();
    expect(screen.getByText('Could not load your profile')).toBeVisible();
    mocks.refetch.mockImplementation(() => {
      mocks.profile = fixture();
      mocks.isError = false;
      refreshProfile();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Could not load your profile')).not.toBeInTheDocument();
    tab('Personal details');
    expect(screen.getByLabelText('Full name')).toHaveValue('Profile Name');
  });

  it('retains unsaved contact and summary edits after Save fails and lets the user retry', () => {
    renderPersonalDetails('');
    edit(github(), 'https://github.com/fixture');
    tab('Summary');
    edit(screen.getByLabelText('Summary'), 'Unsaved summary');
    save();
    const [payload, callbacks] = mocks.save.mock.calls[0];
    act(() => callbacks.onError(new Error('Fixture network error')));
    expect(screen.getByText('Could not save. Please try again.')).toBeVisible();
    expect(screen.getByLabelText('Summary')).toHaveValue('Unsaved summary');
    tab('Personal details');
    expect(github()).toHaveValue('https://github.com/fixture');
    expect(screen.getByText('You have unsaved changes')).toBeVisible();
    save();
    expect(mocks.save.mock.calls[1][0]).toEqual(payload);
  });

  it('adopts a fresh query result while clean and retains edits through a later refresh', () => {
    renderPersonalDetails('');
    mocks.profile = fixture({ fullName: 'Fresh name' });
    refreshProfile();
    expect(screen.getByLabelText('Full name')).toHaveValue('Fresh name');

    edit(screen.getByLabelText('Full name'), 'Unsaved name');
    mocks.profile = fixture({ fullName: 'Another server value' });
    refreshProfile();
    expect(screen.getByLabelText('Full name')).toHaveValue('Unsaved name');
    expect(screen.getByText('You have unsaved changes')).toBeVisible();
  });

  it('keeps an unsaved draft when navigation is cancelled and warns on page unload', () => {
    renderPersonalDetails('');
    const unload = () => window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
    expect(unload()).toBe(true);
    edit(github(), 'github.com/fixture');
    tab('Summary');
    expect(unload()).toBe(false);

    const open = () => fireEvent.click(screen.getByRole('link', { name: 'Open CV builder' }));
    open();
    const dialog = within(screen.getByRole('dialog', { name: 'Leave profile?' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Stay' }));
    tab('Personal details');
    expect(github()).toHaveValue('github.com/fixture');
    expect(screen.getByText('You have unsaved changes')).toBeVisible();

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Discard and leave' }));
    expect(screen.getByRole('heading', { name: 'CV Builder destination' })).toBeVisible();
    expect(unload()).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});


describe('Profile sidebar and history navigation', () => {
  const leaveDialog = () => within(screen.getByRole('dialog', { name: 'Leave profile?' }));
  const sidebarLink = (name: string) => within(screen.getByRole('navigation', { name: 'Main' }))
    .getByRole('link', { name });
  const leave = () => fireEvent.click(leaveDialog().getByRole('button', { name: 'Discard and leave' }));

  function draftSummary() {
    tab('Summary');
    edit(screen.getByLabelText('Summary'), 'Unsaved sidebar draft');
  }

  it('keeps the current URL and edits on cancel, then follows the selected sidebar destination', async () => {
    mocks.profile = fixture();
    const router = renderProfile(['/app/profile?from=settings#details']);
    const original = router.state.location;
    draftSummary();

    fireEvent.click(sidebarLink('My CVs'));
    expect(leaveDialog().getByText(/unsaved profile changes/)).toBeVisible();
    fireEvent.click(leaveDialog().getByRole('button', { name: 'Stay' }));
    expect(router.state.location).toEqual(original);
    expect(screen.getByLabelText('Summary')).toHaveValue('Unsaved sidebar draft');

    fireEvent.click(sidebarLink('Applications'));
    leave();
    expect(await screen.findByRole('heading', { name: 'Applications destination' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/app/applications');
    expect(mocks.save).not.toHaveBeenCalled();
    await act(() => router.navigate(-1));
    tab('Summary');
    expect(screen.getByLabelText('Summary')).toHaveValue('');
  });

  it('protects the mobile sidebar and continues to the clicked destination on discard', async () => {
    mocks.profile = fixture();
    const router = renderProfile();
    draftSummary();

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const mobileNav = screen.getAllByRole('navigation', { name: 'Main' })[1];
    fireEvent.click(within(mobileNav).getByRole('link', { name: 'My CVs' }));
    expect(router.state.location.pathname).toBe('/app/profile');
    leave();
    expect(await screen.findByRole('heading', { name: 'My CVs destination' })).toBeVisible();
  });

  it('allows clean sidebar navigation directly', async () => {
    mocks.profile = fixture();
    renderProfile();
    fireEvent.click(sidebarLink('My CVs'));
    expect(await screen.findByRole('heading', { name: 'My CVs destination' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Leave profile?' })).not.toBeInTheDocument();
  });

  it('allows sidebar navigation directly after a successful save', async () => {
    mocks.profile = fixture();
    renderProfile();
    draftSummary();
    save();
    const [payload, callbacks] = mocks.save.mock.calls[0];
    act(() => callbacks.onSuccess(payload));

    expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument();
    fireEvent.click(sidebarLink('My CVs'));
    expect(await screen.findByRole('heading', { name: 'My CVs destination' })).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'Leave profile?' })).not.toBeInTheDocument();
  });

  it.each([
    { direction: 'Back', delta: -1, entries: ['/app/cvs?from=history#saved', '/app/profile'], initialIndex: 1 },
    { direction: 'Forward', delta: 1, entries: ['/app/profile', '/app/cvs?from=history#saved'], initialIndex: 0 },
  ])('protects $direction and resumes the original history entry after discard', async ({ delta, entries, initialIndex }) => {
    mocks.profile = fixture();
    const router = renderProfile(entries, initialIndex);
    draftSummary();

    await act(() => router.navigate(delta));
    fireEvent.click(leaveDialog().getByRole('button', { name: 'Stay' }));
    expect(router.state.location.pathname).toBe('/app/profile');
    expect(screen.getByLabelText('Summary')).toHaveValue('Unsaved sidebar draft');

    await act(() => router.navigate(delta));
    leave();
    expect(await screen.findByRole('heading', { name: 'My CVs destination' })).toBeVisible();
    expect(router.state.historyAction).toBe('POP');
    expect(router.state.location).toMatchObject({ pathname: '/app/cvs', search: '?from=history', hash: '#saved' });
  });
});
