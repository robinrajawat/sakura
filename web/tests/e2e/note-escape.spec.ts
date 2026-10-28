import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

test('Esc in a note leaves it with the row selected, so arrows and Enter work again', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', 'true'); } catch { /* ignore */ } });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    const n = (id: number, text: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });
    // @ts-expect-error -- bare globals from index.html
    nodes = [n(1, 'line one'), n(2, 'line two')]; collapsedIds = new Set(); nextId = 3; render();
  });
  await page.locator('.node-row[data-id="1"] .node-label').first().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('note text');
  await page.keyboard.press('Escape');
  // @ts-expect-error
  expect(await page.evaluate(() => ({ note: nodes[0].note, editing: editingId, sel: selectedId, inNote: !!document.activeElement?.closest('.node-note-line') }))).toEqual({ note: 'note text', editing: null, sel: 1, inNote: false });
  await page.keyboard.press('ArrowDown');
  // @ts-expect-error
  expect(await page.evaluate(() => selectedId)).toBe(2);
});
