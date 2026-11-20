import { describe, it, expect } from 'vitest';
import { reportingEnabled, stripUrl, scrubEvent, bootErrorToException, PRODUCTION_ORIGIN } from '../../src/telemetry/sentryConfig';

describe('error reports (Sentry) settings', () => {
  it('report only from the live site, and only with a DSN', () => {
    expect(reportingEnabled(PRODUCTION_ORIGIN, 'https://k@o1.ingest.de.sentry.io/1')).toBe(true);
    expect(reportingEnabled(PRODUCTION_ORIGIN, '')).toBe(false);
    expect(reportingEnabled('null', 'https://k@o1.ingest.de.sentry.io/1')).toBe(false); // file://
    expect(reportingEnabled('http://localhost:5173', 'https://k@o1.ingest.de.sentry.io/1')).toBe(false);
    expect(reportingEnabled('https://sakura-notes.pages.dev', 'https://k@o1.ingest.de.sentry.io/1')).toBe(false);
  });

  it('addresses lose their query and fragment', () => {
    expect(stripUrl('https://www.sakura-notes.com/?doc=abc#row-3')).toBe('https://www.sakura-notes.com/');
    expect(stripUrl('https://www.sakura-notes.com/index.html#x')).toBe('https://www.sakura-notes.com/index.html');
    expect(stripUrl('https://www.sakura-notes.com/')).toBe('https://www.sakura-notes.com/');
    expect(stripUrl(undefined)).toBeUndefined();
  });

  it('a report keeps no user, cookies, query, other headers or breadcrumbs', () => {
    const e = scrubEvent({
      user: { id: 'uid', email: 'a@b.c', ip_address: '1.2.3.4' },
      request: { url: 'https://www.sakura-notes.com/?q=secret', query_string: 'q=secret', cookies: 'x=1', headers: { 'User-Agent': 'UA', Referer: 'https://x/?y' } },
      breadcrumbs: [{ message: 'typed words' }]
    });
    expect(e).toEqual({ request: { url: 'https://www.sakura-notes.com/', headers: { 'User-Agent': 'UA' } } });
  });

  it('a startup error arrives as the original Error, or one rebuilt from the browser\'s words', () => {
    const original = new Error('boom');
    expect(bootErrorToException({ message: 'boom', error: original })).toBe(original);
    const rebuilt = bootErrorToException({ message: "Cannot access 'X' before initialization", where: 'line 5:3' });
    expect(rebuilt.message).toBe("Cannot access 'X' before initialization (line 5:3)");
    expect(bootErrorToException({}).message).toBe('Unknown startup error');
  });
});
