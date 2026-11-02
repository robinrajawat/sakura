import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-02: a dark reload flashed white in the installed app's title bar, which takes its colour
// from theme-color. The head sets it before anything paints, so it never shows the light colour.
for (const [label, prefs] of [['saved Dark', { theme: 'dark', themeMode: 'manual' }], ['System on a dark OS', { theme: 'light', themeMode: 'system' }]] as const) {
  test(`theme-color is dark from the first moment (${label})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript((p) => {
      localStorage.setItem('sakura_welcome_seen', '1');
      localStorage.setItem('sakura_v001_prefs', JSON.stringify(p));
      const seen: string[] = [];
      (window as any).__themeColors = seen;
      new MutationObserver((muts) => {
        for (const m of muts) {
          const t = m.target as Element;
          if (t.nodeName === 'META' && t.getAttribute('name') === 'theme-color') seen.push(t.getAttribute('content') || '');
          for (const n of Array.from(m.addedNodes)) if ((n as Element).nodeName === 'BODY') seen.push('body:' + (n as Element).className);
        }
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['content'] });
    }, prefs);
    await page.goto('file://' + indexPath);
    await page.waitForFunction(() => typeof (window as any).syncThemeColorMeta === 'function');
    const seen: string[] = await page.evaluate(() => (window as any).__themeColors);
    const firstBody = seen.findIndex((s) => s.startsWith('body:'));
    expect(seen.slice(0, firstBody)).toContain('#181816');
    expect(seen.filter((s) => !s.startsWith('body:'))).not.toContain('#f8f8f6');
    await expect(page.locator('body')).toHaveClass(/theme-dark/);
    expect(await page.evaluate(() => document.documentElement.style.background)).toBe('');
  });
}

// Owner 2026-11-02: "icons on the app bar seem to move". Search's place on the rail is kept while its box
// is moved in, so To-Dos below it never jumps.
test("Search's place on the rail is kept while it is empty", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  const todosY = () => page.locator('#dock-panel-appbar-toggle').evaluate((e) => Math.round(e.getBoundingClientRect().top));
  const before = await todosY();
  await page.evaluate(() => { const s = document.getElementById('appbar-qa-slot')!; (window as any).__qa = s.firstElementChild; s.replaceChildren(); });
  expect(await todosY()).toBe(before);
  await page.evaluate(() => document.getElementById('appbar-qa-slot')!.append((window as any).__qa));
});
