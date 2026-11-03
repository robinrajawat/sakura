import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner report 2026-11-03: tab-separated text pasted into a row should become a table, and several
// ├── └── trees separated by blank lines should keep their shape instead of gluing each tree's
// heading onto the line before it.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => {
    const w = window as any;
    w.eval('ensureDocumentForEditing();');
    w.eval(`nodes = [{ id: 1, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }]; rebuildParentIds(); nextId = 2; render();`);
  });
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await expect(page.locator('.node-row[data-id="1"] .node-input')).toBeVisible();
});

async function paste(page: Page, text: string, html = '') {
  await page.evaluate(([text, html]) => {
    const dt = new DataTransfer(); dt.setData('text/plain', text); if (html) dt.setData('text/html', html);
    (document.activeElement || document.body).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [text, html]);
}

const TABLE = [
  'Business Requirement / Scenario\tSAP Fit / Solution\tChange Required',
  'Less-than-full pallet stock removal\tExisting FIFO stock removal strategy\tNo change required',
  'Configuration\tActivate Consider Stock on Resource\tRequired',
].join('\n');

test('tab-separated text becomes a table on the row', async ({ page }) => {
  await paste(page, TABLE);
  expect(await page.evaluate('nodes.length')).toBe(1);
  expect(await page.evaluate('nodes[0].tables.length')).toBe(1);
  await expect(page.locator('.node-table-line table tr')).toHaveCount(3);
  await expect(page.locator('.node-table-line table tr').first().locator('td, th')).toHaveCount(3);
});

const TREES = `Business Requirement
├── Avoid stock removal from several different partial pallets
└── Continue picking from the same pallet where possible across waves

Current Setup
├── Less-than-full pallet stock uses FIFO
└── FIFO should remain unchanged

Analysis
├── Standard SAP EWM provides "Consider Stock on Resource"
│   └── Allows stock located on the resource to be considered during stock removal
└── Existing FIFO continues to determine the stock/pallet selection`;

const EXPECTED = [
  ['Business Requirement', 0],
  ['Avoid stock removal from several different partial pallets', 1],
  ['Continue picking from the same pallet where possible across waves', 1],
  ['Current Setup', 0],
  ['Less-than-full pallet stock uses FIFO', 1],
  ['FIFO should remain unchanged', 1],
  ['Analysis', 0],
  ['Standard SAP EWM provides "Consider Stock on Resource"', 1],
  ['Allows stock located on the resource to be considered during stock removal', 2],
  ['Existing FIFO continues to determine the stock/pallet selection', 1],
];

test('several trees keep their shape (plain text)', async ({ page }) => {
  await paste(page, TREES);
  expect(await page.evaluate('nodes.map(n => [n.text, n.depth])')).toEqual(EXPECTED);
});

test('several trees keep their shape when the HTML copy drops the blank lines', async ({ page }) => {
  const html = TREES.split('\n').filter(l => l.trim()).map(l => `<div>${l}</div>`).join('');
  await paste(page, TREES, html);
  expect(await page.evaluate('nodes.map(n => [n.text, n.depth])')).toEqual(EXPECTED);
});
