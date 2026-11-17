import { describe, it, expect } from 'vitest';
import {
  handlePdf,
  pdfFileName,
  pdfQuotaUid,
  MAX_PDF_HTML_BYTES,
  isTimeout,
  isDailyBrowserLimit,
  pdfPausedKey,
  secondsUntilUtcMidnight
} from '../src/pdf';
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

describe('daily browser time used up', () => {
  const limitErr = new Error('Unable to create new browser: code: 429: message: Browser time limit exceeded for today');
  const noon = () => new Date('2026-11-17T12:00:00Z');
  const fail = (err: Error) => async (): Promise<Uint8Array> => {
    throw err;
  };

  it('tells the daily limit apart from other errors', () => {
    expect(isDailyBrowserLimit(limitErr)).toBe(true);
    expect(isDailyBrowserLimit(new Error('Unable to create new browser: code: 429: message: Rate limit exceeded'))).toBe(false);
    expect(isDailyBrowserLimit(new Error('Navigation timeout of 30000 ms exceeded'))).toBe(false);
    expect(isDailyBrowserLimit(undefined)).toBe(false);
  });

  it('counts down to midnight UTC, never under a minute', () => {
    expect(secondsUntilUtcMidnight(noon())).toBe(12 * 3600);
    expect(secondsUntilUtcMidnight(new Date('2026-11-17T23:59:50Z'))).toBe(60);
  });

  it('pauses PDF files for the rest of the UTC day once Cloudflare refuses', async () => {
    const kv = fakeKv();
    const first = await handlePdf(post({ html: '<p>Hi</p>' }), 'u1', kv, 5, fail(limitErr), noon);
    expect(first.status).toBe(429);
    expect(await first.json()).toMatchObject({ paused: true });
    expect(kv.store[pdfPausedKey(noon())]).toBe('1');
    // The refused request gave its count back.
    expect(Object.entries(kv.store).filter(([k]) => k.includes(pdfQuotaUid('u1'))).map(([, v]) => v)).toEqual(['0']);

    let rendered = false;
    const second = await handlePdf(post({ html: '<p>Hi</p>' }), 'u2', kv, 5, async () => {
      rendered = true;
      return fakePdf;
    }, noon);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ paused: true });
    expect(rendered).toBe(false);
    // The paused request didn't use the person's own count.
    expect(Object.keys(kv.store).some((k) => k.includes(pdfQuotaUid('u2')))).toBe(false);

    const tomorrow = () => new Date('2026-11-18T00:00:01Z');
    const third = await handlePdf(post({ html: '<p>Hi</p>' }), 'u2', kv, 5, async () => fakePdf, tomorrow);
    expect(third.status).toBe(200);
  });

  it('keeps other render failures as 502 and does not pause', async () => {
    const kv = fakeKv();
    const res = await handlePdf(post({ html: '<p>Hi</p>' }), 'u1', kv, 5, fail(new Error('boom')), noon);
    expect(res.status).toBe(502);
    expect(kv.store[pdfPausedKey(noon())]).toBeUndefined();
    // A browser did run, so it still counts.
    expect(Object.entries(kv.store).filter(([k]) => k.includes(pdfQuotaUid('u1'))).map(([, v]) => v)).toEqual(['1']);
  });
});
