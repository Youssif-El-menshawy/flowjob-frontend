import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ContactLinksFields, type ContactLinksHandle } from './ContactLinksFields';

let current: string[] = [];
function Harness({ initial, handle }: { initial: string[]; handle: React.RefObject<ContactLinksHandle> }) {
  const [links, setLinks] = useState(initial);
  current = links;
  return <ContactLinksFields ref={handle} links={links} onChange={setLinks} />;
}
const setup = (initial: string[]) => {
  const handle = createRef<ContactLinksHandle>();
  render(<Harness initial={initial} handle={handle} />);
  return handle;
};
const li = () => screen.getByLabelText(/LinkedIn URL/) as HTMLInputElement;
const gh = () => screen.getByLabelText(/GitHub URL/) as HTMLInputElement;
const type = (el: HTMLElement, v: string) => fireEvent.change(el, { target: { value: v } });

afterEach(cleanup);

describe('ContactLinksFields', () => {
  it('shows two optional inputs instead of one comma-separated field', () => {
    setup([]);
    expect(li()).toBeInTheDocument();
    expect(gh()).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Links/)).toBeNull();
  });

  it('loads existing stored links into the right inputs, whatever their order or format', () => {
    setup(['github.com/saranowak', 'linkedin.com/in/saranowak']);
    expect(li().value).toBe('linkedin.com/in/saranowak');
    expect(gh().value).toBe('github.com/saranowak');
  });

  it('untouched legacy links are returned exactly as stored (no reorder, no rewrite)', () => {
    const stored = ['https://janedoe.dev', 'github.com/jane', 'linkedin.com/in/jane'];
    const handle = setup(stored);
    expect(handle.current!.validate()).toEqual(stored);
    expect(current).toEqual(stored);
  });

  it('normalises on blur: adds https:// and writes it to the links', () => {
    setup([]);
    type(li(), 'linkedin.com/in/jane');
    fireEvent.blur(li());
    expect(li().value).toBe('https://linkedin.com/in/jane');
    expect(current).toEqual(['https://linkedin.com/in/jane']);
  });

  it('keeps unrelated legacy links when a field is edited', () => {
    setup(['https://janedoe.dev', 'portfolio']);
    type(gh(), 'github.com/jane');
    fireEvent.blur(gh());
    expect(current).toEqual(['https://github.com/jane', 'https://janedoe.dev', 'portfolio']);
  });

  it('clearing a field removes just that link', () => {
    setup(['https://linkedin.com/in/a', 'https://github.com/a', 'x.dev']);
    type(li(), '');
    fireEvent.blur(li());
    expect(current).toEqual(['https://github.com/a', 'x.dev']);
  });

  it('shows an inline error for an unsafe or wrong-site link and validate() returns null', () => {
    const handle = setup([]);
    type(li(), 'javascript:alert(1)');
    fireEvent.blur(li());
    expect(screen.getByText(/starts with https/i)).toBeInTheDocument();
    type(gh(), 'linkedin.com/in/jane');
    let result: string[] | null | undefined;
    act(() => {
      result = handle.current!.validate();
    });
    expect(result).toBeNull();
    expect(screen.getByText(/doesn’t look like a GitHub link/)).toBeInTheDocument();
  });

  it('validate() returns the normalised links for a valid edit', () => {
    const handle = setup([]);
    type(li(), 'linkedin.com/in/jane');
    type(gh(), 'http://github.com/jane');
    expect(handle.current!.validate()).toEqual(['https://linkedin.com/in/jane', 'https://github.com/jane']);
  });

  it('does not nag about an untouched legacy value that happens to be invalid', () => {
    const handle = setup(['https://linkedin.com/in/jane smith']);
    fireEvent.blur(li());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(handle.current!.validate()).toEqual(['https://linkedin.com/in/jane smith']);
  });
});
