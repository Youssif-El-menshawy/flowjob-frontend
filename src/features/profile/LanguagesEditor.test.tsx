import { useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguagesEditor } from './LanguagesEditor';

function setup(value = '') {
  const change = vi.fn();
  function Form() {
    const [languages, setLanguages] = useState(value);
    return <LanguagesEditor value={languages} onChange={(text) => { change(text); setLanguages(text); }} />;
  }
  render(<Form />);
  return change;
}

function openAdd() {
  fireEvent.click(screen.getByRole('button', { name: 'Add language' }));
  return within(screen.getByRole('dialog', { name: 'Add language' }));
}

afterEach(cleanup);

describe('Languages editor', () => {
  it('searches, adds with no proficiency, edits the level, and removes the entry', () => {
    const change = setup();
    const add = openAdd();
    fireEvent.change(add.getByRole('searchbox', { name: 'Search languages' }), { target: { value: 'WOLO' } });
    expect(add.getByRole('option', { name: 'Wolof' })).toBeInTheDocument();
    expect(add.queryByRole('option', { name: 'English' })).not.toBeInTheDocument();
    fireEvent.change(add.getByLabelText('Language'), { target: { value: 'Wolof' } });
    expect(add.getByLabelText(/^Proficiency/)).toHaveValue('');
    fireEvent.click(add.getByRole('button', { name: 'Add language' }));
    expect(change).toHaveBeenLastCalledWith('Wolof');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Wolof' }));
    const edit = within(screen.getByRole('dialog', { name: 'Edit language' }));
    fireEvent.change(edit.getByLabelText(/^Proficiency/), { target: { value: 'C1' } });
    fireEvent.click(edit.getByRole('button', { name: 'Save language' }));
    expect(change).toHaveBeenLastCalledWith('Wolof (C1)');
    expect(within(screen.getByRole('list', { name: 'Saved languages' })).getByText('C1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Wolof' }));
    expect(change).toHaveBeenLastCalledWith('');
    expect(screen.queryByRole('list', { name: 'Saved languages' })).toBeNull();
  });

  it('adds a custom name and prevents duplicates regardless of case', () => {
    const change = setup('English C1');
    let dialog = openAdd();
    fireEvent.change(dialog.getByLabelText('Language'), { target: { value: '__custom__' } });
    fireEvent.change(dialog.getByLabelText('Custom language'), { target: { value: '  eNgLiSh  ' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add language' }));
    expect(dialog.getByRole('alert')).toHaveTextContent(/already in the list/);
    expect(change).not.toHaveBeenCalled();

    fireEvent.change(dialog.getByLabelText('Custom language'), { target: { value: 'Example Dialect' } });
    fireEvent.change(dialog.getByLabelText(/^Proficiency/), { target: { value: 'Native' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add language' }));
    expect(change).toHaveBeenLastCalledWith('English (C1), Example Dialect (Native)');

    dialog = openAdd();
    fireEvent.change(dialog.getByLabelText('Language'), { target: { value: '__custom__' } });
    fireEvent.change(dialog.getByLabelText('Custom language'), { target: { value: 'EXAMPLE dialect' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add language' }));
    expect(dialog.getByRole('alert')).toHaveTextContent(/already in the list/);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('keeps unrecognized text unchanged until the user edits a row and preserves it on other edits', () => {
    const legacy = 'English - C1 / Notes (reading, writing)';
    const change = setup(legacy);
    expect(screen.getByText('Notes (reading, writing)')).toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit English' }));
    const edit = within(screen.getByRole('dialog', { name: 'Edit language' }));
    fireEvent.click(edit.getByRole('button', { name: 'Save language' }));
    expect(change).not.toHaveBeenCalled();

    const add = openAdd();
    fireEvent.change(add.getByLabelText('Language'), { target: { value: 'Polish' } });
    fireEvent.click(add.getByRole('button', { name: 'Add language' }));
    expect(change).toHaveBeenLastCalledWith('English (C1), Notes (reading, writing), Polish');
  });

  it('reopens a saved custom entry for explicit editing without rewriting it on load', () => {
    const change = setup('Example Dialect (A2), Other Dialect');
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Example Dialect (A2)' }));
    const edit = within(screen.getByRole('dialog', { name: 'Edit language' }));
    expect(edit.getByLabelText('Custom language')).toHaveValue('Example Dialect');
    expect(edit.getByLabelText(/^Proficiency/)).toHaveValue('A2');
    fireEvent.change(edit.getByLabelText(/^Proficiency/), { target: { value: '' } });
    fireEvent.click(edit.getByRole('button', { name: 'Save language' }));
    expect(change).toHaveBeenLastCalledWith('Example Dialect, Other Dialect');
  });
});
