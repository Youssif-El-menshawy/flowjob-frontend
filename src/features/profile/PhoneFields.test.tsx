import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PhoneFieldWithHandle, type PhoneFieldHandle } from './PhoneFields';

let current = '';
function Harness({ initial, handle }: { initial: string; handle: React.RefObject<PhoneFieldHandle> }) {
  const [v, setV] = useState(initial);
  current = v;
  return <PhoneFieldWithHandle ref={handle} value={v} onChange={setV} />;
}
const setup = (initial: string) => {
  const handle = createRef<PhoneFieldHandle>();
  render(<Harness initial={initial} handle={handle} />);
  return handle;
};
const num = () => screen.getByLabelText('Phone number') as HTMLInputElement;
const countryBtn = () => screen.getByRole('button', { name: /^Phone country:/ });
const validate = (h: React.RefObject<PhoneFieldHandle>) => {
  let r: string | null | undefined;
  act(() => {
    r = h.current!.validate();
  });
  return r;
};
const pick = (query: string, name: RegExp) => {
  fireEvent.click(countryBtn());
  fireEvent.change(screen.getByRole('combobox', { name: 'Search countries' }), { target: { value: query } });
  fireEvent.click(screen.getByRole('option', { name }));
};

afterEach(cleanup);

describe('PhoneField', () => {
  it('shows a country dropdown and a separate national number input, optional', () => {
    setup('');
    expect(countryBtn()).toBeInTheDocument();
    expect(num()).toBeInTheDocument();
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });

  it('lists country name, flag and dialing code in a searchable list, incl. shared calling codes', () => {
    setup('');
    fireEvent.click(countryBtn());
    const search = screen.getByRole('combobox', { name: 'Search countries' });
    fireEvent.change(search, { target: { value: '+44' } });
    const opts = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(opts.some((t) => t.includes('United Kingdom') && t.includes('+44') && t.includes('🇬🇧'))).toBe(true);
    expect(opts.some((t) => t.includes('Jersey'))).toBe(true); // countries sharing +44
    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText('No matching country.')).toBeInTheDocument();
  });

  it('keyboard: arrows + Enter select, Escape closes without selecting', () => {
    setup('');
    fireEvent.click(countryBtn());
    const search = screen.getByRole('combobox', { name: 'Search countries' });
    fireEvent.change(search, { target: { value: 'france' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'ArrowUp' });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(countryBtn()).toHaveAttribute('aria-label', 'Phone country: France +33');
    fireEvent.click(countryBtn());
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search countries' }), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(countryBtn()).toHaveAttribute('aria-label', 'Phone country: France +33');
  });

  it('saves a valid number as E.164', () => {
    const h = setup('');
    pick('kingdom', /United Kingdom/);
    fireEvent.change(num(), { target: { value: '07911 123456' } });
    expect(current).toBe('+447911123456');
    expect(validate(h)).toBe('+447911123456');
  });

  it('shows an inline error for an invalid number and validate() returns null', () => {
    const h = setup('');
    pick('kingdom', /United Kingdom/);
    fireEvent.change(num(), { target: { value: '123' } });
    fireEvent.blur(num());
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid United Kingdom phone number.');
    expect(validate(h)).toBeNull();
  });

  it('is optional: clearing the number clears the value', () => {
    const h = setup('+33612345678');
    fireEvent.change(num(), { target: { value: '' } });
    expect(current).toBe('');
    expect(validate(h)).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('loads an existing international number: country identified, value untouched', () => {
    const h = setup('+33 6 12 34 56 78'); // stored with spaces (legacy formatting)
    expect(countryBtn()).toHaveAttribute('aria-label', 'Phone country: France +33');
    expect(num().value).toMatch(/06 12 34 56 78/);
    expect(validate(h)).toBe('+33 6 12 34 56 78'); // not rewritten unless edited
    expect(current).toBe('+33 6 12 34 56 78');
  });

  it('does not guess a country for a local/legacy number and keeps it verbatim', () => {
    const h = setup('(415) 555-2671');
    expect(countryBtn()).toHaveAttribute('aria-label', 'Phone country: not selected');
    expect(num().value).toBe('(415) 555-2671');
    expect(screen.getByText(/Saved as “\(415\) 555-2671”/)).toBeInTheDocument();
    expect(validate(h)).toBe('(415) 555-2671');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets the user pick a country to normalise a legacy local number', () => {
    const h = setup('(415) 555-2671');
    pick('united states', /United States/);
    expect(current).toBe('+14155552671');
    expect(validate(h)).toBe('+14155552671');
  });

  it('reads a pasted international number and adopts its country', () => {
    const h = setup('');
    pick('united states', /United States/);
    fireEvent.change(num(), { target: { value: '+33 6 12 34 56 78' } });
    fireEvent.blur(num());
    expect(countryBtn()).toHaveAttribute('aria-label', 'Phone country: France +33');
    expect(validate(h)).toBe('+33612345678');
  });

  it('works with countries that share a calling code', () => {
    const h = setup('');
    pick('canada', /Canada/);
    fireEvent.change(num(), { target: { value: '613 555 0123' } });
    expect(validate(h)).toBe('+16135550123');
    expect(countryBtn()).toHaveAttribute('aria-label', 'Phone country: Canada +1');
  });

  it('exposes listbox semantics', () => {
    setup('');
    fireEvent.click(countryBtn());
    const lb = screen.getByRole('listbox', { name: 'Countries' });
    expect(within(lb).getAllByRole('option').length).toBeGreaterThan(200);
  });
});
