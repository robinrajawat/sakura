import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Owner, 2026-10-20: row icons sat at the far right edge, far from their text. They now follow the text,
// at the end of the last line when it wraps.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay'); if (landing) landing.style.display = 'none';
    const n = (id: number, depth: number, text: string, parentId: number | null, x: object = {}) => ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', noteTitle: '', tags: [], styles: {}, ...x });
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 0, 'Short row', null, { note: 'a note', tags: ['ops'], marker: 'followup' }),
      n(2, 0, 'A long row that keeps going and going so that it has to wrap onto a second line at this window width, and maybe even a third', null, { note: 'b' }),
      n(3, 0, 'Folded parent', null), n(4, 1, 'Hidden child', 3)].map(normalizeNode);
    // @ts-expect-error
    collapsedIds = new Set([3]); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null; nextId = 5;
    // @ts-expect-error
    render();
  });
});

test('icons sit right after a short row\'s text, in text order', async ({ page }) => {
  const row = page.locator('.node-row[data-id="1"]');
  const icons = row.locator('.node-label .node-row-icons');
  await expect(icons.locator('.node-marker-badge, .node-note-dot, .node-tag-chip')).toHaveCount(3);
  const textRight = await row.locator('.node-label').evaluate((l) => { const r = document.createRange(); r.selectNodeContents(l.firstChild!); return r.getBoundingClientRect().right; });
  const iconsLeft = (await icons.boundingBox())!.x;
  expect(iconsLeft - textRight).toBeGreaterThanOrEqual(0);
  expect(iconsLeft - textRight).toBeLessThan(12);
  // The row's own height is unchanged by the icons (one text line).
  const h = (await row.boundingBox())!.height;
  expect(h).toBeLessThan(32);
});

test('a wrapped row ends its last line with the icons; folded "+N" joins them', async ({ page }) => {
  const lbl = page.locator('.node-row[data-id="2"] .node-label');
  const lb = (await lbl.boundingBox())!;
  const ib = (await lbl.locator('.node-row-icons').boundingBox())!;
  expect(lb.height).toBeGreaterThan(30); // it wraps
  expect(ib.y + ib.height).toBeGreaterThan(lb.y + lb.height - 22); // on the last line
  await expect(page.locator('.node-row[data-id="3"] .node-row-icons .fold-badge')).toHaveText('+1');
});

test('clicking the text still edits at the click point; clicking an icon does its own thing', async ({ page }) => {
  const lbl = page.locator('.node-row[data-id="1"] .node-label');
  const b = (await lbl.boundingBox())!;
  await page.mouse.click(b.x + 3, b.y + b.height / 2);
  await expect(page.locator('.node-row[data-id="1"] .node-input')).toBeVisible();
  // Editing shows the plain text, with no icon text mixed in.
  await expect(page.locator('.node-row[data-id="1"] .node-input')).toHaveText('Short row');
  await page.keyboard.press('Escape');
  await page.locator('.node-row[data-id="3"] .fold-badge').click();
  await expect(page.locator('.node-row[data-id="4"]')).toBeVisible();
});
