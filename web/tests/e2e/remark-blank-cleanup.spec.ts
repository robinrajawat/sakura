import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Blank thread entries never pile up or print: the reply box adds nothing when empty, an entry
// emptied and left is removed, and the PDF never prints an entry without text or a chip (older
// documents may already hold some).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`
    nodes = [
      { id: 1, depth: 0, text: 'First', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} },
      { id: 2, depth: 0, text: 'Second', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }
    ];
    nextId = 3; remarks = []; qaItems = []; collapsedIds = new Set(); editingId = null; selectedId = null; render();
  `);
}

test('the reply box adds nothing when empty; an entry emptied and left is removed', async ({ page }) => {
  await seed(page);
  await page.evaluate(`runQuickAction('remark', 1)`);
  const box = page.locator('.thread-composer-input[data-node-id="1"]');
  await expect(box).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await page.evaluate('remarks.length')).toBe(0);
  await page.keyboard.type('Keep me');
  await page.keyboard.press('Enter');
  expect(await page.evaluate('remarks.length')).toBe(1);

  // Moving to the entry's own author field keeps it while it is empty.
  const text = page.locator('.thread-entry .node-remark-text-inline');
  await text.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.locator('.thread-entry .node-remark-person-inline').click();
  await page.waitForTimeout(50);
  expect(await page.evaluate('remarks.length')).toBe(1);
  // Leaving it empty removes it.
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await expect.poll(() => page.evaluate('remarks.length')).toBe(0);
  await expect(page.locator('.thread-entry')).toHaveCount(0);
});

test('PDF skips blank entries, orphaned or not', async ({ page }) => {
  await seed(page);
  await page.evaluate(`
    remarks = [
      { id: 'blankOrphan', anchorNodeId: 99, person: '', text: '', date: '2026-10-01', createdAt: 1 },
      { id: 'blankOnNode', anchorNodeId: 1, person: 'A', text: '<br>', date: '2026-10-01', createdAt: 2 },
      { id: 'real', anchorNodeId: 2, person: 'B', text: 'Real comment', date: '2026-10-02', createdAt: 3 }
    ];
  `);
  const r = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    return {
      entries: [...document.querySelectorAll('#preview-doc .pv-remark-entry .pv-remark-text')].map(e => e.textContent),
      trailing: !!document.getElementById('pv-remarks-section'),
    };
  });
  expect(r.entries).toEqual(['Real comment']);
  expect(r.trailing).toBe(false);
});

test('adding to another row moves the reply box there, ready to type', async ({ page }) => {
  await seed(page);
  await page.evaluate(`runQuickAction('qa', 1)`);
  await expect(page.locator('.thread-composer-input[data-node-id="1"]')).toBeFocused();
  await page.evaluate(`runQuickAction('remark', 2)`);
  // Row 1 has no entries, so its empty box closes; row 2's is focused and asks nothing.
  await expect(page.locator('.thread-composer-input[data-node-id="1"]')).toHaveCount(0);
  await expect(page.locator('.thread-composer-input[data-node-id="2"]')).toBeFocused();
  await page.keyboard.type('Kept');
  await page.keyboard.press('Enter');
  expect(await page.evaluate('JSON.stringify(remarks.map(r => [r.anchorNodeId, r.type || null, r.text]))')).toBe('[[2,null,"Kept"]]');
});
