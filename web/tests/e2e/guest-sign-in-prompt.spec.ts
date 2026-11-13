import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Cloud-first plan, Phase 4: like other try-first apps, a guest is asked to sign in once real work
// exists, never with a wall: from a day after their first words, one dismissible message on a
// save, not repeated for 14 days.
async function open(page: Page, firstContentAgoMs: number | null) {
  await page.addInitScript((ago) => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
    if (ago !== null) localStorage.setItem('sakura_guest_first_content_at', String(Date.now() - ago));
  }, firstContentAgoMs);
  await page.goto('file://' + indexPath);
}
const save = (page: Page) => page.evaluate(() => {
  // @ts-expect-error -- bare globals from index.html
  if (!currentDocId) createDoc(); nodes = [normalizeNode({ id: 1, depth: 0, text: 'Real words' })]; nextId = 2; dirty = true; saveToStorage();
});
const prompt = (page: Page) => page.locator('#toast', { hasText: 'Your documents are only in this browser' });

test('a day after the first words, a save offers sign-in once; Sign in opens the sign-in screen', async ({ page }) => {
  await open(page, 25 * 60 * 60 * 1000);
  await save(page);
  await expect(prompt(page)).toBeVisible();
  await page.locator('#toast .toast-action-btn').click();
  await expect(page.locator('#sakura-landing-overlay')).toBeVisible();
});

test('not on the first day, and not again within 14 days', async ({ page }) => {
  await open(page, null);
  await save(page);
  await expect(prompt(page)).toHaveCount(0);
  expect(await page.evaluate(() => Number(localStorage.getItem('sakura_guest_first_content_at')))).toBeGreaterThan(0);
  await page.evaluate(() => {
    localStorage.setItem('sakura_guest_first_content_at', String(Date.now() - 3 * 24 * 60 * 60 * 1000));
    localStorage.setItem('sakura_guest_prompt_at', String(Date.now() - 2 * 24 * 60 * 60 * 1000));
  });
  await save(page);
  await expect(prompt(page)).toHaveCount(0);
});

test('signed-in people are never asked', async ({ page }) => {
  await open(page, 25 * 60 * 60 * 1000);
  await page.evaluate(() => {
    // @ts-expect-error -- bare global from index.html
    currentUser = { uid: 'u1' };
  });
  await save(page);
  await expect(prompt(page)).toHaveCount(0);
});
