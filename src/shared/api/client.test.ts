import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, apiBlob } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('CV API errors', () => {
  const issue = { loc: ['body', 'content', 'experience', 0, 'bullets'], msg: 'Input should be a valid list' };

  it.each([api, apiBlob])('exposes the same nested validation feedback for JSON and PDF requests', async (request) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ detail: [issue] }, { status: 422 })));
    await expect(request('/cvs/preview/pdf')).rejects.toMatchObject({
      status: 422,
      message: 'content.experience.0.bullets: Input should be a valid list',
      fieldErrors: { bullets: 'Input should be a valid list' },
    });
  });

  it('preserves the actionable render-capacity message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      Response.json({ detail: 'PDF rendering is busy. Please try again shortly.' }, { status: 503 }),
    ));
    await expect(apiBlob('/cvs/preview/pdf')).rejects.toMatchObject({
      status: 503,
      message: 'PDF rendering is busy. Please try again shortly.',
    });
  });
});
