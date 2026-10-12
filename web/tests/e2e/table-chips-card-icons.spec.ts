import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

const SHIP = '<table><tr><th>Shipping Condition</th><th>Description</th></tr><tr><td>ZN</td><td>Night Distribution</td></tr><tr><td>ZL</td><td>KL 10:00 Fixed</td></tr></table>';
const EST = '<table data-feature-chart="1" data-chart-type="cards"><tr><th>Area</th><th>Effort</th></tr><tr><td>ERP - ABAP</td><td>6 days</td></tr><tr><td>Total</td><td>31 days</td></tr></table>';

async function openWith(page: import('@playwright/test').Page, tables: string[]) {
  await page.goto('file://' + indexPath);
  await page.evaluate((tables) => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
    // @ts-expect-error -- bare globals from index.html
    nodes = tables.map((t, i) => ({ id: i + 1, depth: 0, text: 'Node ' + (i + 1), parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [t] }));
    // @ts-expect-error
    nextId = tables.length + 1; collapsedIds = new Set(); selectedId = null; editingId = null; render();
  }, tables);
}

async function pickMenu(page: import('@playwright/test').Page, label: string) {
  await page.locator('.sb-context-menu .sb-context-item', { hasText: label }).first().click();
}

test.describe('Show a two-column table as chips', () => {
  test('menu toggles chips on and off; text-only tables qualify', async ({ page }) => {
    await openWith(page, [SHIP]);
    await page.locator('.node-table-line').first().click({ button: 'right', force: true });
    await pickMenu(page, 'Show as chips');
    const chips = page.locator('.pv-table-chip');
    await expect(chips).toHaveCount(2);
    await expect(chips.first().locator('.pv-table-chip-key')).toHaveText('ZN');
    await expect(chips.first().locator('.pv-table-chip-desc')).toHaveText('Night Distribution');
    // @ts-expect-error
    expect(await page.evaluate(() => nodes[0].tables[0])).toContain('data-table-display="chips"');
    await page.locator('.node-table-line').first().click({ button: 'right', force: true });
    await pickMenu(page, 'Show as table');
    await expect(page.locator('.pv-table-chip')).toHaveCount(0);
    await expect(page.locator('.node-table-line table')).toHaveCount(1);
  });

  test('chips and chart are mutually exclusive', async ({ page }) => {
    await openWith(page, [EST]);
    await page.locator('.pv-table-card').first().click({ button: 'right', force: true });
    await pickMenu(page, 'Show as chips');
    // @ts-expect-error
    const html = await page.evaluate(() => nodes[0].tables[0]);
    expect(html).toContain('data-table-display="chips"');
    expect(html).not.toContain('data-feature-chart');
  });

  test('chips reach the PDF', async ({ page }) => {
    await openWith(page, [SHIP.replace('<table>', '<table data-table-display="chips">')]);
    // @ts-expect-error
    await page.evaluate(() => renderPreviewBody());
    await expect(page.locator('#preview-overlay .pv-table-chip')).toHaveCount(2);
  });
});

test.describe('Card icons', () => {
  test('right-clicking a card picks an icon for that card only, and No icon clears it', async ({ page }) => {
    await openWith(page, [EST]);
    await page.locator('.pv-table-card').nth(1).click({ button: 'right', force: true });
    await pickMenu(page, 'Total');
    const cards = page.locator('.pv-table-card');
    await expect(cards.nth(1).locator('.pv-table-card-icon')).toHaveCount(1);
    await expect(cards.nth(0).locator('.pv-table-card-icon')).toHaveCount(0);
    // @ts-expect-error
    expect(await page.evaluate(() => nodes[0].tables[0])).toContain('data-card-icon-picks');
    await cards.nth(1).click({ button: 'right', force: true });
    await pickMenu(page, 'No icon');
    await expect(page.locator('.pv-table-card-icon')).toHaveCount(0);
  });
});
