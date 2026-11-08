import { describe, expect, it } from 'vitest';
import type { CvContent } from '@/shared/api/types';
import { createPreviewEngine, pdfFingerprint, type PreviewState } from './cvPreview';

const base: CvContent = {
  fullName: 'Ada',
  email: 'ada@example.com',
  phone: '',
  location: '',
  links: [],
  summary: 'Engineer.',
  experience: [],
  education: [],
  projects: [],
  skills: [],
  languages: '',
};

const pdf = () => new Blob(['%PDF-'], { type: 'application/pdf' });
const flush = () => new Promise((r) => setTimeout(r, 0));

/** A fetcher whose promises resolve/reject under test control. */
function makeFetcher() {
  const calls: {
    content: CvContent;
    signal: AbortSignal;
    resolve: (b: Blob) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const fetcher = (content: CvContent, signal: AbortSignal) =>
    new Promise<Blob>((resolve, reject) => calls.push({ content, signal, resolve, reject }));
  return { fetcher, calls };
}

describe('pdfFingerprint', () => {
  it('ignores item ids (they do not affect the PDF)', () => {
    const a = { ...base, experience: [{ id: '1', title: 'T', company: 'C', start: '2020-01', end: '', bullets: ['x'] }] };
    const b = { ...base, experience: [{ id: '2', title: 'T', company: 'C', start: '2020-01', end: '', bullets: ['x'] }] };
    expect(pdfFingerprint(a)).toBe(pdfFingerprint(b));
  });

  it('changes when visible content changes', () => {
    const a = { ...base, summary: 'one' };
    const b = { ...base, summary: 'two' };
    expect(pdfFingerprint(a)).not.toBe(pdfFingerprint(b));
  });

  it('returns to the original fingerprint when an edit is reverted', () => {
    const original = pdfFingerprint(base);
    const edited = pdfFingerprint({ ...base, summary: 'changed' });
    const reverted = pdfFingerprint({ ...base, summary: base.summary });
    expect(edited).not.toBe(original);
    expect(reverted).toBe(original);
  });
});

describe('preview engine', () => {
  it('generates the initial preview exactly once', async () => {
    const { fetcher, calls } = makeFetcher();
    const engine = createPreviewEngine(fetcher, () => {});
    engine.request(base);
    expect(calls.length).toBe(1);
    calls[0].resolve(pdf());
    await flush();
    expect(engine.getState().status).toBe('ready');
    expect(engine.isStale(base)).toBe(false);
  });

  it('deduplicates identical in-flight requests and no-ops when up to date', async () => {
    const { fetcher, calls } = makeFetcher();
    const engine = createPreviewEngine(fetcher, () => {});
    engine.request(base);
    engine.request(base); // identical, still in flight -> no new call
    expect(calls.length).toBe(1);
    calls[0].resolve(pdf());
    await flush();
    engine.request(base); // already displayed -> no-op
    engine.requestIfStale(base); // not stale -> no-op
    expect(calls.length).toBe(1);
  });

  it('requestIfStale only fetches when content changed (Next/Back behavior)', async () => {
    const { fetcher, calls } = makeFetcher();
    const engine = createPreviewEngine(fetcher, () => {});
    engine.request(base);
    calls[0].resolve(pdf());
    await flush();
    engine.requestIfStale(base); // navigation without edits
    expect(calls.length).toBe(1);
    engine.requestIfStale({ ...base, summary: 'edited' }); // edited then navigated
    expect(calls.length).toBe(2);
  });

  it('never lets an older response overwrite a newer one, and aborts the superseded request', async () => {
    const { fetcher, calls } = makeFetcher();
    const engine = createPreviewEngine(fetcher, () => {});
    engine.request({ ...base, summary: 'A' }); // calls[0]
    engine.request({ ...base, summary: 'B' }); // supersedes calls[0] -> calls[1]
    expect(calls[0].signal.aborted).toBe(true);
    const blobB = pdf();
    calls[1].resolve(blobB);
    await flush();
    expect(engine.getState().blob).toBe(blobB);
    calls[0].resolve(pdf()); // late, stale response
    await flush();
    expect(engine.getState().blob).toBe(blobB); // unchanged
  });

  it('keeps the previous preview and stays stale when a request fails', async () => {
    const { fetcher, calls } = makeFetcher();
    const engine = createPreviewEngine(fetcher, () => {});
    const blobA = pdf();
    engine.request({ ...base, summary: 'A' });
    calls[0].resolve(blobA);
    await flush();
    const edited = { ...base, summary: 'B' };
    engine.request(edited);
    calls[1].reject(new Error('backend down'));
    await flush();
    const st: PreviewState = engine.getState();
    expect(st.blob).toBe(blobA); // previous PDF retained
    expect(st.error).toBe(true);
    expect(engine.isStale(edited)).toBe(true); // not claimed up to date
  });
});
