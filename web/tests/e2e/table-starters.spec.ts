import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Table › (owner request): wherever "Add table" is offered, a menu opens with Blank table… (the
// size grid, as before) and "Start from" starters, each naming the columns it makes and showing as
// its display right away, so people can see what shape a display needs.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    nodes = [{ id: 1, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }];
    nextId = 2; collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
  return errors;
}

const tableMenu = (page: Page) => page.evaluate('_ctxNodeId = 1; runQuickAction("table", 1)');

test('Add table opens Table ›: Blank table… then starters with their columns', async ({ page }) => {
  const errors = await open(page);
  await tableMenu(page);
  const rows = await page.locator('.sb-context-menu').evaluate((m) => [...m.querySelectorAll('.sb-context-heading, .sb-context-item')].map((el) => el.classList.contains('sb-context-heading')
    ? '# ' + el.textContent
    : (el.querySelector('.sb-context-label')?.firstChild?.textContent || '').trim() + ' | ' + (el.querySelector('.sb-context-sub')?.textContent || '')));
  expect(rows).toEqual([
    'Blank table… | Pick a size', '# Start from',
    'Status board | Item · Status · Owner · Due', 'Timeline | Date · Milestone · Note', 'Cards | Metric · Value · Change',
    'Progress bars | Workstream · Done %', 'Pros & cons | Pros · Cons', 'Codes (chips) | Code · Meaning', 'Bar chart | Label · Value'
  ]);
  // Blank table… is the size grid, as before; the new table opens into editing.
  await page.locator('.sb-context-menu').getByText('Blank table…').click();
  await expect(page.locator('.table-grid-picker')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.node-table-line table th').first()).toHaveText('Column 1');
  expect(await page.evaluate('nodes[0].tables.length')).toBe(1);
  expect(errors).toEqual([]);
});

test('every starter shows as its display right away, and Undo removes it', async ({ page }) => {
  const errors = await open(page);
  const shows: Record<string, string> = {
    'Status board': '.pv-board .pv-board-lane',
    'Timeline': '.pv-timeline .pv-tl-item',
    'Cards': '.pv-table-cards-grid',
    'Progress bars': '.pv-table-progress',
    'Pros & cons': '.pv-proscons',
    'Codes (chips)': '.pv-table-chips',
    'Bar chart': 'svg.pv-table-chart-svg'
  };
  for (const [label, sel] of Object.entries(shows)) {
    await tableMenu(page);
    await page.locator('.sb-context-menu .sb-context-item').filter({ hasText: label }).first().click();
    await expect(page.locator('.node-table-line').last().locator(sel).first(), label).toBeVisible();
  }
  expect(await page.evaluate('nodes[0].tables.length')).toBe(7);
  // Not opened for editing: the starter shows as its display.
  expect(await page.evaluate('!!document.querySelector(".node-table-line [contenteditable=true]")')).toBe(false);
  await page.keyboard.press('ControlOrMeta+Z');
  expect(await page.evaluate('nodes[0].tables.length')).toBe(6);
  expect(errors).toEqual([]);
});
