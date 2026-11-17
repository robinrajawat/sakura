/**
 * POST /pdf — turns the app's print-ready HTML into a real PDF file, so Download PDF saves a
 * .pdf straight away instead of opening the browser's print dialog (owner, 2026-11-07).
 *
 * The page sends the same self-contained HTML it would otherwise print (every style inlined,
 * Contents page numbers already filled in, <base> pointing at the site so fonts and relative
 * images load). Cloudflare Browser Rendering opens it in headless Chrome with JavaScript off and
 * prints it, so the file matches the print path page for page (same engine, same print CSS,
 * including the @page footer). Nothing is stored: the HTML and the PDF only pass through.
 *
 * Limits: signed-in users only, a per-user daily count (separate from the AI quota), and a size
 * cap. On the Workers Free plan Cloudflare allows 10 browser-minutes a day and one new browser
 * every 20 seconds, so a warm browser session is reused when one is free (kept warm for 10s). Any failure returns an
 * error and the page falls back to the print dialog.
 *
 * When Cloudflare says the day's browser time is used up, PDF files pause for everyone until
 * midnight UTC (when Cloudflare's allowance resets): a KV flag answers every later request at once
 * with 429 `{ paused: true }`, so nobody waits for a browser that can't start (owner, 2026-11-17).
 */
import puppeteer, { type Browser } from '@cloudflare/puppeteer';
import type { QuotaKV } from './quota';
import { consumeQuota, refundQuota } from './quota';

export const MAX_PDF_HTML_BYTES = 20 * 1024 * 1024;
/** How long to wait for the page's load event before printing what is there. */
export const LOAD_TIMEOUT_MS = 15000;
/** An idle browser stays open this long for the next PDF. Short, because idle time counts against
 * the Workers Free plan's daily browser minutes (was 60s, which used most of a minute per PDF). */
export const KEEP_ALIVE_MS = 10000;

/** Puppeteer's navigation timeout (a TimeoutError), as opposed to a real failure. */
export function isTimeout(err: unknown): boolean {
  return !!err && typeof err === 'object' && ((err as { name?: string }).name === 'TimeoutError' || /timeout/i.test(String((err as { message?: string }).message ?? '')));
}
export const DEFAULT_DAILY_PDF_QUOTA = 50;

/** Cloudflare refusing a browser because the account's daily browser time is used up, as
 * @cloudflare/puppeteer reports it ("Unable to create new browser: code: 429: message: Browser
 * time limit exceeded for today"). The other 429, starting browsers too often, is not this. */
export function isDailyBrowserLimit(err: unknown): boolean {
  const msg = String((err as { message?: string } | null)?.message ?? err ?? '');
  return /code:\s*429/.test(msg) && /time limit|for today|daily/i.test(msg);
}

/** The flag that pauses PDF files until the UTC day ends (one key per day). */
export function pdfPausedKey(now: Date = new Date()): string {
  return `pdf-paused:${now.toISOString().slice(0, 10)}`;
}

/** Seconds until the next midnight UTC, at least 60 (KV's shortest expiry). */
export function secondsUntilUtcMidnight(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - now.getTime()) / 1000));
}

const PAUSED_BODY = { error: 'PDF files are paused until tomorrow', paused: true };

/** Renders print-ready HTML to PDF bytes. Injected so the handler is testable without a browser. */
export type RenderPdf = (html: string) => Promise<Uint8Array>;

export function pdfQuotaUid(uid: string): string {
  return `pdf:${uid}`;
}

/** A safe download name: the document title without characters file systems reject. */
export function pdfFileName(title: unknown): string {
  const base = String(typeof title === 'string' ? title : '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .trim()
    .slice(0, 120);
  return (base || 'Sakura') + '.pdf';
}

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function handlePdf(
  request: Request,
  uid: string,
  kv: QuotaKV,
  dailyLimit: number,
  render: RenderPdf,
  now: () => Date = () => new Date()
): Promise<Response> {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_PDF_HTML_BYTES) return json({ error: 'Document too large for a PDF file' }, 413);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const html = typeof b.html === 'string' ? b.html : '';
  if (!html.trim()) return json({ error: 'html is required' }, 400);
  if (html.length > MAX_PDF_HTML_BYTES) return json({ error: 'Document too large for a PDF file' }, 413);

  // Checked before the person's own count, so a paused day doesn't use it up.
  if (await kv.get(pdfPausedKey(now()))) return json(PAUSED_BODY, 429);

  const quota = await consumeQuota(kv, pdfQuotaUid(uid), dailyLimit, now());
  if (!quota.allowed) return json({ error: 'Daily PDF limit reached' }, 429);

  let pdf: Uint8Array;
  try {
    pdf = await render(html);
  } catch (err) {
    if (isDailyBrowserLimit(err)) {
      const t = now();
      await kv.put(pdfPausedKey(t), '1', { expirationTtl: secondsUntilUtcMidnight(t) });
      // No browser ran, so this request doesn't count against the person's own daily PDFs. Other
      // failures still count: a browser did run, and refunding them would let broken requests
      // use up the app's shared browser time for free.
      await refundQuota(kv, pdfQuotaUid(uid), t);
      return json(PAUSED_BODY, 429);
    }
    return json({ error: 'PDF rendering failed', details: [err instanceof Error ? err.message : String(err)] }, 502);
  }
  return new Response(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${pdfFileName(b.title).replace(/"/g, '')}"`,
      'Cache-Control': 'no-store'
    }
  });
}

/** Reuses an idle browser session when there is one (the Free plan starts at most one new
 * browser every 20 seconds); otherwise starts one that stays warm for KEEP_ALIVE_MS (10s). */
async function openBrowser(binding: Fetcher): Promise<Browser> {
  try {
    const sessions = await puppeteer.sessions(binding);
    const idle = sessions.find((s) => !s.connectionId);
    if (idle) return await puppeteer.connect(binding, idle.sessionId);
  } catch {
    // Fall through to a fresh browser.
  }
  return puppeteer.launch(binding, { keep_alive: KEEP_ALIVE_MS });
}

export function browserRenderer(binding: Fetcher): RenderPdf {
  return async (html: string) => {
    const browser = await openBrowser(binding);
    const page = await browser.newPage();
    try {
      // The HTML is the app's own print copy: it needs no script, and none may run.
      await page.setJavaScriptEnabled(false);
      await page.emulateMediaType('print');
      // Wait for the page's load event, not for the network to go fully quiet (networkidle0):
      // one slow or hanging font/image request kept that from ever happening, so every PDF timed
      // out ("Navigation timeout of 30000 ms exceeded", owner report 2026-11-13). If even the load
      // event is held up, print what has loaded rather than failing: the text and layout are
      // already there; at worst one picture or font is missing.
      try {
        await page.setContent(html, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
      } catch (err) {
        if (!isTimeout(err)) throw err;
      }
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, timeout: 30000 });
      return pdf;
    } finally {
      await page.close().catch(() => undefined);
      // Disconnect, don't close: the session stays warm for the next PDF.
      browser.disconnect();
    }
  };
}
