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
  const textRight = await row.locator('.node-label').evaluate((l) => { const r = document.createRange(); r.setStart(l, 0); r.setEndBefore(l.querySelector('.node-row-icons')!); return r.getBoundingClientRect().right; });
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

// Owner, 2026-10-22: when the text just fills its last line, the icons wrapped onto a line of their
// own ("looks a bit strange"). The last word now goes down with them.
test('icons never sit alone on a line: the last word wraps with them', async ({ page }) => {
  const result = await page.evaluate(() => {
    const lbl = document.querySelector('.node-row[data-id="1"] .node-label') as HTMLElement;
    const icons = lbl.querySelector('.node-row-icons') as HTMLElement;
    const r = document.createRange(); r.setStart(lbl, 0); r.setEndBefore(icons);
    const textW = r.getBoundingClientRect().width;
    // Room for the text on one line, but not for the icons after it.
    lbl.style.width = (textW + 4) + 'px'; lbl.style.maxWidth = (textW + 4) + 'px'; lbl.style.flex = '0 0 auto';
    const ib = icons.getBoundingClientRect();
    const first = document.createRange(); first.setStart(lbl.firstChild!, 0); first.setEnd(lbl.firstChild!, 1);
    // The last word ("row") is the text just before the icons.
    const tail = icons.parentElement!; const word = document.createRange(); word.selectNodeContents(tail.firstChild!);
    return { iconsTop: ib.top, lastWordTop: word.getBoundingClientRect().top, firstTop: first.getBoundingClientRect().top, word: tail.firstChild!.textContent, label: lbl.textContent };
  });
  expect(result.word).toBe('row');
  expect(result.iconsTop).toBeGreaterThan(result.firstTop + 5); // the icons did wrap
  expect(Math.abs(result.lastWordTop - result.iconsTop)).toBeLessThan(8); // and took the last word along
});

test('text ending in a space still keeps its icons on the last word\'s line', async ({ page }) => {
  const text = 'Customers already activated for drop fee today will remain unchanged; no new customers will be activated for drop fee because of Flexible Night Delivery. ';
  const alone = await page.evaluate((text) => {
    // @ts-expect-error -- bare globals from index.html
    nodes[1].text = text; render();
    const lbl = document.querySelector('.node-row[data-id="2"] .node-label') as HTMLElement;
    const box = lbl.querySelector('.node-row-icons') as HTMLElement;
    lbl.style.flex = '0 0 auto';
    // At every width, the icons share a line with the text's last character.
    for (let w = 900; w > 300; w -= 3) {
      lbl.style.width = w + 'px';
      const tail = box.parentElement!.firstChild as Text;
      const r = document.createRange(); r.setStart(tail, tail.length - 1); r.setEnd(tail, tail.length);
      if (box.getBoundingClientRect().top > r.getBoundingClientRect().top + 5) return w;
    }
    return 0;
  }, text);
  expect(alone).toBe(0);
});
