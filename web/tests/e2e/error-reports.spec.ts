import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../../dist');
const SITE = 'https://www.sakura-notes.com';
// The real project's host (the page's CSP allows only that one), with a stand-in key and project.
const TEST_DSN = 'https://publickey@o4512462918320128.ingest.de.sentry.io/1';

// Error reports (docs/standard-practice-plan.md step 2, src/telemetry/sentry.ts). The built page is
// served as if from the live site, with a stand-in Sentry that records what would be sent.
test.describe('error reports', () => {
  test.skip(!existsSync(path.join(dist, 'index.html')), 'dist/ not built yet: run `npm run build` first');

  async function openLiveSite(page: Page, dsn: string | null, prefs?: object) {
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
    await page.addInitScript(({ d, p }) => {
      if (p && !sessionStorage.getItem('prefsSeeded')) { sessionStorage.setItem('prefsSeeded', '1'); localStorage.setItem('sakura_v001_prefs', JSON.stringify(p)); }
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      if (d) (window as unknown as { __sakuraSentryTestDsn?: string }).__sakuraSentryTestDsn = d;
    }, { d: dsn, p: prefs || null });
    await page.goto(SITE + '/?doc=private-id#row');
    await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
    return sent;
  }

  test('an error on the live site is reported, without the person\'s details', async ({ page }) => {
    const sent = await openLiveSite(page, TEST_DSN);
    await page.waitForFunction(() => !!document.querySelector('script[src*="/vendor/sentry-"]'));
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

  test('turned off in Settings, Sentry isn\'t loaded and nothing is sent', async ({ page }) => {
    const sent = await openLiveSite(page, TEST_DSN, { errorReportsOff: true });
    await expect(page.locator('#auto-error-report-toggle')).toHaveAttribute('aria-checked', 'false');
    expect(await page.locator('script[src*="/vendor/sentry-"]').count()).toBe(0);
    await page.evaluate(() => setTimeout(() => { throw new Error('not reported'); }, 0));
    await page.waitForTimeout(1000);
    expect(sent).toEqual([]);
  });

  test('turning it off while the page is open stops reports at once', async ({ page }) => {
    const sent = await openLiveSite(page, TEST_DSN);
    await page.waitForFunction(() => !!document.querySelector('script[src*="/vendor/sentry-"]'));
    await page.waitForTimeout(500);
    await expect(page.locator('#auto-error-report-toggle')).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(() => (0, eval)('setErrorReportsEnabled(false)'));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}').errorReportsOff)).toBe(true);
    await page.evaluate(() => setTimeout(() => { throw new Error('after turning off'); }, 0));
    await page.waitForTimeout(1000);
    expect(sent.some((b) => b.includes('after turning off'))).toBe(false);
  });

  test('someone who used Sakura before is told first; reports start from the next load', async ({ page }) => {
    const sent = await openLiveSite(page, TEST_DSN, { theme: 'light' });
    expect(await page.locator('script[src*="/vendor/sentry-"]').count()).toBe(0);
    await expect(page.locator('#toast')).toContainText('Sakura now sends error reports', { timeout: 6000 });
    await page.reload();
    await page.waitForFunction(() => !!document.querySelector('script[src*="/vendor/sentry-"]'));
    await expect(page.locator('#toast')).not.toContainText('Sakura now sends error reports');
    await page.waitForTimeout(500);
    await page.evaluate(() => setTimeout(() => { throw new Error('after the notice'); }, 0));
    await expect.poll(() => sent.some((b) => b.includes('after the notice')), { timeout: 10000 }).toBe(true);
  });
});
