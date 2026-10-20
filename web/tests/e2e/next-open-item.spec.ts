import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-20: F8 / Shift+F8 step through follow-ups and open questions in outline order,
// unfolding folded branches on the way.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay'); if (l) l.style.display = 'none';
    const n = (id: number, depth: number, text: string, parentId: number | null, x: object = {}) => ({ id, depth, text, parentId, styles: {}, ...x });
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 0, 'Intro', null), n(2, 0, 'Scope', null), n(3, 1, 'Asked', 2), n(4, 0, 'Plan', null, { marker: 'followup' }), n(5, 0, 'Done', null)].map(normalizeNode);
    // @ts-expect-error
    remarks = [{ id: 'q1', anchorNodeId: 3, text: 'Who signs off?', type: 'question', createdAt: 1 },
      { id: 'f1', anchorNodeId: 4, text: 'Check budget', status: 'followup', createdAt: 2 }];
    // @ts-expect-error
    collapsedIds = new Set([2]); selectedId = 1; render();
  });
});

test('F8 goes to the next open item, unfolding its branch; Shift+F8 goes back; it wraps around', async ({ page }) => {
  // @ts-expect-error
  const sel = () => page.evaluate(() => selectedId);
  await page.keyboard.press('F8');
  expect(await sel()).toBe(3);
  // @ts-expect-error
  expect(await page.evaluate(() => collapsedIds.has(2))).toBe(false);
  await expect(page.locator('#toast')).toContainText('Open item 1 of 2');
  await page.keyboard.press('F8');
  expect(await sel()).toBe(4);
  await page.keyboard.press('F8');
  expect(await sel()).toBe(3); // wraps
  await page.keyboard.press('Shift+F8');
  expect(await sel()).toBe(4);
});

test('with nothing open, F8 says so', async ({ page }) => {
  // @ts-expect-error
  await page.evaluate(() => { remarks = []; nodes.forEach((x) => { delete x.marker; }); render(); });
  await page.keyboard.press('F8');
  await expect(page.locator('#toast')).toContainText('Nothing open');
});
