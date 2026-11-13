import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-13: the "Auto-rewrite on" pill was louder than it needed to be. On and idle it is
// only the sparkle (a faint square like the full-screen button); words show while rows wait or
// are rewritten; after a rewrite one message says how many rows changed, with Undo.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    // @ts-expect-error -- bare globals from index.html
    createDoc(); nodes = [normalizeNode({ id: 1, depth: 0, text: 'this are a row with some words in it' })]; nextId = 2; render();
    // @ts-expect-error -- bare globals from index.html
    setAutoRewriteEnabled(true, false); updateAutoRewriteStatusChip();
    w.hasUsableAiKey = () => true;
    w.callAiApiBatch = async (texts: string[]) => texts.map(() => 'This is a row with some words in it.');
  });
});

test('on and idle: only the sparkle, no words', async ({ page }) => {
  const chip = page.locator('#sb-auto-rewrite-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/is-quiet/);
  await expect(chip).toHaveText('');
  await expect(chip).toHaveAttribute('aria-label', 'Auto-rewrite is on');
});

test('after a rewrite: "Rewrote 1 row" with Undo, which puts the words back', async ({ page }) => {
  await page.evaluate(async () => {
    // @ts-expect-error -- bare globals from index.html
    autoRewriteQueue.add(1); await flushAutoRewriteQueue();
  });
  const toast = page.locator('#toast');
  await expect(toast).toContainText('Rewrote 1 row');
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].text)).toBe('This is a row with some words in it.');
  await toast.locator('.toast-action-btn', { hasText: 'Undo' }).click();
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].text)).toBe('this are a row with some words in it');
  await expect(toast).toContainText('Rewrite undone');
});
