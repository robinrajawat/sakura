import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { gzipSync } from 'zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const builtIndex = path.resolve(__dirname, '../../dist/index.html');

// The build minifies the page's inline code and styles (scripts/minify-inline.mjs, docs/mobile-plan.md
// "faster first load"), and every other browser test loads the source page. These drive the built,
// minified page itself through the basics, so a minifier problem shows up here. CI builds before it
// runs the browser tests.
test.describe('the built, minified page works', () => {
  test.skip(!existsSync(builtIndex), 'dist/ not built yet: run `npm run build` first');

  test('it is minified, and much smaller than the source', () => {
    const built = readFileSync(builtIndex, 'utf8');
    const source = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    expect(built.length).toBeLessThan(source.length * 0.75);
    // Under 500 KB compressed (it was about 700 KB before minifying).
    expect(gzipSync(built).length).toBeLessThan(500 * 1024);
  });

  test('typing, Enter, Tab and saving work', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => { if (!/ServiceWorker/.test(e.message)) errors.push(e.message); });
    await page.addInitScript(() => {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('file://' + builtIndex);
    await page.waitForFunction(() => typeof (window as unknown as { createDoc?: unknown }).createDoc === 'function');
    await page.evaluate(() => (0, eval)("createDoc(); nodes=[normalizeNode({id:1,depth:0,text:'One'})]; nextId=2; render()"));
    await page.locator('.node-row .node-label', { hasText: 'One' }).click();
    await expect.poll(() => page.evaluate(() => (0, eval)('editingId'))).toBe(1);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Two');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => (0, eval)("nodes.map(n=>n.depth+':'+n.text).join('|')"))).toBe('0:One|1:Two');
    const id = await page.evaluate(() => (0, eval)('currentDocId'));
    await expect.poll(() => page.evaluate((id) => (JSON.parse(localStorage.getItem('sakura_doc_v1_' + id) || '{}').nodes || []).map((n: { text: string }) => n.text).join('|'), id)).toBe('One|Two');
    expect(errors).toEqual([]);
  });

  test('a phone gets the phone layout', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
    await page.goto('file://' + builtIndex);
    await expect(page.locator('html')).toHaveClass(/(^|\s)phone(\s|$)/);
    await page.locator('#phone-menu-btn').click();
    await expect(page.locator('#phone-menu-btn')).toHaveAttribute('aria-expanded', 'true');
    await ctx.close();
  });
});
