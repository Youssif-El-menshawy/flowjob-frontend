import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Education, Experience } from '@/shared/api/types';
import { ItemEditor } from './profileParts';

const exp = (o: Partial<Experience> = {}): Experience => ({
  id: 'e1', title: 'Dev', company: 'Acme', location: '', start: 'Jul 2022', end: 'Mar 2024', bullets: ['Did things'], ...o,
});
const edu = (o: Partial<Education> = {}): Education => ({
  id: 'd1', degree: 'BSc', school: 'Uni', start: '2018', end: '2021', note: '', ...o,
});

const onSave = vi.fn();
afterEach(() => {
  cleanup();
  onSave.mockReset();
});

const open = (kind: 'experience' | 'education', item: Experience | Education) =>
  render(<ItemEditor kind={kind} item={item} onClose={() => {}} onSave={onSave} />);
const pick = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
const val = (label: string) => (screen.getByLabelText(label) as HTMLSelectElement).value;
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const saved = () => onSave.mock.calls[0][0] as Experience & Education;

describe('month/year date fields', () => {
  it('replaces the free-text inputs in Experience and Education with selectors', () => {
    open('experience', exp());
    expect(screen.queryByPlaceholderText('Jul 2026')).toBeNull();
    expect(screen.getByLabelText('Start date month')).toBeInTheDocument();
    expect(screen.getByLabelText('End date year')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Present' })).toBeInTheDocument();
    cleanup();
    open('education', edu());
    expect(screen.getByLabelText('Start date year')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Present' })).toBeInTheDocument();
  });

  it('loads existing stored values: "Mon YYYY", year-only, and backend "YYYY-MM"', () => {
    open('experience', exp({ start: 'Jul 2022', end: '2024-03' }));
    expect([val('Start date month'), val('Start date year')]).toEqual(['07', '2022']);
    expect([val('End date month'), val('End date year')]).toEqual(['03', '2024']);
    cleanup();
    open('education', edu({ start: '2018', end: '2021' }));
    expect([val('Start date month'), val('Start date year')]).toEqual(['', '2018']);
  });

  it('writes dates in the existing stored format', () => {
    open('experience', exp({ start: '', end: 'Mar 2024' }));
    pick('Start date year', '2022');
    pick('Start date month', '07');
    save();
    expect(saved().start).toBe('Jul 2022');
    expect(saved().end).toBe('Mar 2024'); // untouched value is unchanged
  });

  it('both dropdowns are enabled from the start, in any order', () => {
    open('experience', exp({ start: '', end: 'Mar 2024' }));
    expect(screen.getByLabelText('Start date month')).toBeEnabled();
    expect(screen.getByLabelText('Start date year')).toBeEnabled();
    pick('Start date month', '07'); // month first
    pick('Start date year', '2022');
    save();
    expect(saved().start).toBe('Jul 2022');
  });

  it('keeps a month chosen before the year, and a year chosen before the month', () => {
    open('experience', exp({ start: '', end: 'Mar 2024' }));
    pick('Start date month', '09');
    expect(val('Start date month')).toBe('09'); // partial selection preserved while editing
    expect(val('Start date year')).toBe('');
    pick('Start date year', '2021');
    expect([val('Start date month'), val('Start date year')]).toEqual(['09', '2021']);
    pick('Start date year', '');
    expect(val('Start date month')).toBe('09'); // clearing the year keeps the month
  });

  it('blocks Save on a month without a year, with a clear inline error, then accepts the fix', () => {
    open('experience', exp({ start: '', end: 'Mar 2024' }));
    pick('Start date month', '07');
    expect(screen.queryByText(/Choose a year/)).toBeNull(); // not nagging while editing
    save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert', { name: '' })).toBeInTheDocument();
    expect(screen.getAllByText('Choose a year to go with the month.').length).toBeGreaterThan(0);
    pick('Start date year', '2022');
    expect(screen.queryByText('Choose a year to go with the month.')).toBeNull();
    save();
    expect(saved().start).toBe('Jul 2022');
  });

  it('applies the same incomplete check to the end date', () => {
    open('education', edu({ start: '2018', end: '2021' }));
    pick('End date year', '');
    pick('End date month', '05');
    save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByText('Choose a year to go with the month.').length).toBeGreaterThan(0);
  });

  it('year-only dates are still valid', () => {
    open('education', edu({ start: '', end: '' }));
    pick('Start date year', '2018');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Present' })); // untick
    pick('End date year', '2021');
    save();
    expect(saved().start).toBe('2018');
    expect(saved().end).toBe('2021');
  });

  it('a stray end month does not block Save when Present is ticked', () => {
    open('experience', exp({ end: '' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Present' })); // untick
    pick('End date month', '04');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Present' })); // tick again
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saved().end).toBe('');
  });

  it('Present disables the end date and is stored as an empty end', () => {
    open('experience', exp({ end: 'Mar 2024' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Present' }));
    expect(screen.getByLabelText('End date year')).toBeDisabled();
    save();
    expect(saved().end).toBe('');
    expect(saved().start).toBe('Jul 2022');
  });

  it('an existing empty end loads as Present; an old literal "Present" is preserved untouched', () => {
    open('experience', exp({ end: '' }));
    expect(screen.getByRole('checkbox', { name: 'Present' })).toBeChecked();
    cleanup();
    open('experience', exp({ end: 'Present' }));
    expect(screen.getByRole('checkbox', { name: 'Present' })).toBeChecked();
    save();
    expect(saved().end).toBe('Present');
  });

  it('blocks saving when the end is before the start, and explains why', () => {
    open('experience', exp({ start: 'Jul 2022', end: 'Jan 2022' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/before the start/i);
    save();
    expect(onSave).not.toHaveBeenCalled();
    pick('End date year', '2023');
    expect(screen.queryByText(/before the start/i)).toBeNull();
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('requires an end date once Present is unticked', () => {
    open('experience', exp({ end: '' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Present' })); // untick
    save();
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Choose an end date, or tick Present/).length).toBeGreaterThan(0);
    pick('End date year', '2025');
    save();
    expect(saved().end).toBe('2025');
  });

  it('keeps unparseable legacy text exactly as stored until the user replaces it', () => {
    open('education', edu({ start: 'Summer 2019', end: 'Autumn 2022' }));
    expect(screen.getByText(/Saved as “Summer 2019”/)).toBeInTheDocument();
    save();
    expect(saved().start).toBe('Summer 2019');
    expect(saved().end).toBe('Autumn 2022');
  });

  it('start date stays optional, as before', () => {
    open('experience', exp({ start: '', end: 'Mar 2024' }));
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saved().start).toBe('');
  });
});
