/**
 * Error reports from devices (docs/standard-practice-plan.md step 2; owner 2026-11-20: "do what's
 * standard for the applications in this category" → Sentry). Pure settings and scrubbing, unit-tested;
 * src/telemetry/sentry.ts is the thin part that loads the SDK.
 *
 * What a report holds: the error's message (cut to MAX_VALUE_LENGTH) and where in Sakura's code it
 * happened, the app version, and the browser and system. Never: the person's IP, account or email,
 * document text, clicks, console output or network requests. Addresses lose their query and hash.
 */

/** The project's DSN (Sentry → Settings → Projects → sakura-web → Client Keys). Public by design: it
 * only lets a page send reports in. Empty means reporting is off. */
export const SENTRY_DSN = '';

/** Reports are sent only from the live site, never from tests, local copies or previews. */
export const PRODUCTION_ORIGIN = 'https://www.sakura-notes.com';

export const MAX_VALUE_LENGTH = 300;

export function reportingEnabled(origin: string, dsn: string = SENTRY_DSN): boolean {
  return !!dsn && origin === PRODUCTION_ORIGIN;
}

/** An address without its query string or #fragment (they can carry a document's id or a search). */
export function stripUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** The parts of a Sentry event this file touches; the real event type satisfies it structurally. */
export interface ScrubbableEvent {
  user?: unknown;
  request?: { url?: string; headers?: Record<string, string>; query_string?: unknown; cookies?: unknown };
  breadcrumbs?: unknown[];
}

/** beforeSend: removes anything that could identify the person or carry their content. */
export function scrubEvent<T extends ScrubbableEvent>(event: T): T {
  delete event.user;
  if (event.request) {
    event.request.url = stripUrl(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    if (event.request.headers) {
      const ua = event.request.headers['User-Agent'];
      event.request.headers = ua ? { 'User-Agent': ua } : {};
    }
  }
  delete event.breadcrumbs;
  return event;
}

/** An error buffered by the page's first script before the SDK loaded (window.__sakuraBootErrors). */
export interface BootError {
  message?: string;
  where?: string;
  beforeStart?: boolean;
  error?: unknown;
}

/** The Error to report for a buffered one: the original when the browser gave one, otherwise one
 * rebuilt from its message, so a startup failure still arrives with what the browser said. */
export function bootErrorToException(b: BootError): Error {
  if (b.error instanceof Error) return b.error;
  return new Error(String(b.message || 'Unknown startup error') + (b.where ? ` (${b.where})` : ''));
}
