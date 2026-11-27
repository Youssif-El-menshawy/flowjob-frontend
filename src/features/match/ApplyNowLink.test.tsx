import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApplyNowLink, jobPostingHref } from './ApplyNowLink';

describe('jobPostingHref', () => {
  it('keeps http(s) links and completes bare domains', () => {
    expect(jobPostingHref('https://jobs.acme.com/1')).toBe('https://jobs.acme.com/1');
    expect(jobPostingHref(' http://acme.pl/careers ')).toBe('http://acme.pl/careers');
    expect(jobPostingHref('acme.com/jobs/1')).toBe('https://acme.com/jobs/1');
  });

  it('gives no link for anything that is not a web address', () => {
    for (const bad of ['', '   ', 'javascript:alert(1)', 'mailto:hr@acme.com', 'not a link', 'acme', 'https://localhost']) {
      expect(jobPostingHref(bad)).toBeNull();
    }
    expect(jobPostingHref(undefined)).toBeNull();
  });
});

describe('ApplyNowLink', () => {
  it('opens the posting in a new tab', () => {
    render(<ApplyNowLink jobUrl="acme.com/jobs/1" />);
    const link = screen.getByRole('link', { name: /Apply now/ });
    expect(link).toHaveAttribute('href', 'https://acme.com/jobs/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing without a usable link', () => {
    const { container } = render(<ApplyNowLink jobUrl="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
