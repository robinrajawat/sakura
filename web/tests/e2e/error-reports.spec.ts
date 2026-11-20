import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../../dist');
const SITE = 'https://www.sakura-notes.com';

// Error reports (docs/standard-practice-plan.md step 2, src/telemetry/sentry.ts). The built page is
// served as if from the live site, with a stand-in Sentry that records what would be sent.
test.describe('error reports', () => {
  test.skip(!existsSync(path.join(dist, 'index.html')), 'dist/ not built yet: run `npm run build` first');

  async function openLiveSite(page: Page, dsn: string | null) {
    const sent: string[] = [];
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname.endsWith('.ingest.de.sentry.io')) { sent.push(route.request().postData() || ''); return route.fulfill({ status: 200, body: '{}' }); }
      if (url.origin !== SITE) return route.abort();
      const file = path.join(dist, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
      if (!file.startsWith(dist) || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const type = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.json') ? 'application/json' : undefined;
      return route.fulfill({ status: 200, body: readFileSync(file), contentType: type });
    });
    await page.addInitScript((d) => {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      if (d) (window as unknown as { __sakuraSentryTestDsn?: string }).__sakuraSentryTestDsn = d;
    }, dsn);
    await page.goto(SITE + '/?doc=private-id#row');
    await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
    return sent;
  }

  test('an error on the live site is reported, without the person\'s details', async ({ page }) => {
    const sent = await openLiveSite(page, 'https://publickey@o1.ingest.de.sentry.io/1');
    await page.waitForFunction(() => !!document.querySelector('script[src*="/assets/sentry-"]'));
    await page.waitForTimeout(500); // the module runs init
    await page.evaluate(() => setTimeout(() => { throw new Error('test failure from a phone'); }, 0));
    await expect.poll(() => sent.find((b) => b.includes('test failure from a phone')), { timeout: 10000 }).toBeTruthy();
    const body = sent.find((b) => b.includes('test failure from a phone'))!;
    const event = JSON.parse(body.split('\n').find((l) => l.includes('test failure from a phone'))!);
    expect(event.exception.values[0].value).toBe('test failure from a phone');
    expect(event.release).toBeTruthy();
    expect(event.user).toBeUndefined();
    expect(event.breadcrumbs).toBeUndefined();
    expect(event.request.url).toBe(SITE + '/');
    expect(body).not.toContain('private-id');
  });

  test('with no DSN set, nothing is sent', async ({ page }) => {
    const sent = await openLiveSite(page, null);
    await page.evaluate(() => setTimeout(() => { throw new Error('not reported'); }, 0));
    await page.waitForTimeout(1000);
    expect(sent).toEqual([]);
  });
});
