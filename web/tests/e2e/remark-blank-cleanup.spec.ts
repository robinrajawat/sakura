import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// "Add remark…" creates a blank remark and focuses it. One left blank used to stay in the
// document forever, and once its row was deleted it printed as an empty entry in the PDF's
// trailing "Remarks" section. Now a blank remark is discarded when focus leaves it, and the PDF
// never prints a remark without text (older documents may already hold some).

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

test('a remark added and left blank is discarded when focus moves on', async ({ page }) => {
  await seed(page);
  await page.evaluate(`setSingleSelection(1); inlineExpandRemarksNodeIds.add(1); addRemark();`);
  await expect(page.locator('.node-remark-text-inline')).toBeFocused();
  expect(await page.evaluate('remarks.length')).toBe(1);
  // Moving to the remark's own name field, or opening its date picker, keeps it.
  await page.locator('.node-remark-person-inline').click();
  await page.waitForTimeout(50);
  expect(await page.evaluate('remarks.length')).toBe(1);
  await page.locator('.node-remark-text-inline').click();
  await page.locator('.node-remark-date-inline').click();
  await page.waitForTimeout(100);
  expect(await page.evaluate('remarks.length')).toBe(1);
  await page.keyboard.press('Escape');
  // Leaving the line with no text discards it.
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await expect.poll(() => page.evaluate('remarks.length')).toBe(0);
  await expect(page.locator('.node-remark-line')).toHaveCount(0);
});

test('a remark with text is kept when focus moves on', async ({ page }) => {
  await seed(page);
  await page.evaluate(`setSingleSelection(1); inlineExpandRemarksNodeIds.add(1); addRemark();`);
  // addRemark focuses the new line after its render; typing before that lands elsewhere, the
  // remark stays blank and is (correctly) discarded -- the old intermittent failure under load.
  await expect(page.locator('.node-remark-text-inline')).toBeFocused();
  await page.keyboard.type('Keep me');
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await page.waitForTimeout(100);
  expect(await page.evaluate('remarks.length')).toBe(1);
});

test('PDF skips blank remarks, orphaned or not', async ({ page }) => {
  await seed(page);
  await page.evaluate(`
    remarks = [
      { id: 'blankOrphan', anchorNodeId: 99, person: '', text: '', date: '2026-10-01', createdAt: 1 },
      { id: 'blankOnNode', anchorNodeId: 1, person: 'A', text: '<br>', date: '2026-10-01', createdAt: 2 },
      { id: 'real', anchorNodeId: 2, person: 'B', text: 'Real remark', date: '2026-10-02', createdAt: 3 }
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
  expect(r.entries).toEqual(['Real remark']);
  expect(r.trailing).toBe(false);
});

test('a blank item cleaned up when another row\'s item is added does not take the new one with it', async ({ page }) => {
  await seed(page);
  await page.evaluate(`(async () => { await runQuickAction('qa', 1); })()`);
  await expect(page.locator('.node-remark-text-inline')).toBeFocused();
  await page.evaluate(`(async () => { await runQuickAction('remark', 2); })()`);
  await expect.poll(() => page.evaluate('JSON.stringify(remarks.map(r => [r.anchorNodeId, r.kind || null]))')).toBe('[[2,null]]');
  // The caret stays in the new remark, ready to type.
  await expect(page.locator('.node-remark-text-inline')).toBeFocused();
  await page.keyboard.type('Kept');
  expect(await page.evaluate('remarks[0].text')).toBe('Kept');
});
