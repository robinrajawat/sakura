import { describe, it, expect } from 'vitest';
import { handlePdf, pdfFileName, pdfQuotaUid, MAX_PDF_HTML_BYTES, isTimeout } from '../src/pdf';
import type { QuotaKV } from '../src/quota';

function fakeKv(): QuotaKV & { store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    store,
    async get(key: string) {
      return key in store ? store[key] : null;
    },
    async put(key: string, value: string) {
      store[key] = value;
    }
  };
}

const post = (body: unknown) =>
  new Request('https://ai.sakura-notes.com/pdf', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

describe('pdfFileName', () => {
  it('uses the title and strips characters file systems reject', () => {
    expect(pdfFileName('Kumla WH: Reduce/broker?')).toBe('Kumla WH_ Reduce_broker_.pdf');
  });
  it('falls back to Sakura.pdf', () => {
    expect(pdfFileName('')).toBe('Sakura.pdf');
    expect(pdfFileName(undefined)).toBe('Sakura.pdf');
  });
});

describe('handlePdf', () => {
  it('renders the HTML and returns a PDF download', async () => {
    let rendered = '';
    const res = await handlePdf(post({ html: '<p>Hi</p>', title: 'Plan' }), 'u1', fakeKv(), 5, async (h) => {
      rendered = h;
      return fakePdf;
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="Plan.pdf"');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(fakePdf);
    expect(rendered).toBe('<p>Hi</p>');
  });

  it('rejects a missing body or html', async () => {
    const render = async () => fakePdf;
    expect((await handlePdf(post('not json'), 'u1', fakeKv(), 5, render)).status).toBe(400);
    expect((await handlePdf(post({ html: '  ' }), 'u1', fakeKv(), 5, render)).status).toBe(400);
  });

  it('rejects oversized HTML without rendering', async () => {
    let called = false;
    const big = 'x'.repeat(MAX_PDF_HTML_BYTES + 1);
    const res = await handlePdf(post({ html: big }), 'u1', fakeKv(), 5, async () => {
      called = true;
      return fakePdf;
    });
    expect(res.status).toBe(413);
    expect(called).toBe(false);
  });

  it('counts PDFs per user per day, separate from the AI quota', async () => {
    const kv = fakeKv();
    const render = async () => fakePdf;
    expect((await handlePdf(post({ html: 'a' }), 'u1', kv, 2, render)).status).toBe(200);
    expect((await handlePdf(post({ html: 'a' }), 'u1', kv, 2, render)).status).toBe(200);
    expect((await handlePdf(post({ html: 'a' }), 'u1', kv, 2, render)).status).toBe(429);
    expect(Object.keys(kv.store)[0]).toContain(pdfQuotaUid('u1'));
    expect(Object.keys(kv.store).some((k) => k.startsWith('quota:u1:'))).toBe(false);
  });

  it('turns a rendering failure into a 502 the page can fall back from', async () => {
    const res = await handlePdf(post({ html: 'a' }), 'u1', fakeKv(), 5, async () => {
      throw new Error('browser busy');
    });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'PDF rendering failed', details: ['browser busy'] });
  });
});

describe('isTimeout', () => {
  it("recognises puppeteer's navigation timeout, so the page still prints", () => {
    const e = new Error('Navigation timeout of 30000 ms exceeded');
    e.name = 'TimeoutError';
    expect(isTimeout(e)).toBe(true);
    expect(isTimeout(new Error('Navigation timeout of 15000 ms exceeded'))).toBe(true);
  });
  it('leaves real failures alone', () => {
    expect(isTimeout(new Error('Browser closed'))).toBe(false);
    expect(isTimeout(null)).toBe(false);
  });
});
