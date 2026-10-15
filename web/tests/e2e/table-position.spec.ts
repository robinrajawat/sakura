import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Position › Left / Center (owner request): a table, chart, chips, inline list or vertical timeline
// can sit centred, in the outline and the PDF. Displays that fill the width list Position greyed out
// with the reason.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const PLAIN = '<table><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody><tr><td>Pallets</td><td>12</td></tr><tr><td>Boxes</td><td>40</td></tr></tbody></table>';

async function open(page: Page, table: string) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate((t) => {
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: '', tables: [t], images: [], tags: [], styles: {} }];
    // @ts-expect-error
    nextId = 2; collapsedIds = new Set(); editingId = null; undoStack = []; render();
  }, table);
  return errors;
}

async function menu(page: Page) {
  await page.locator('.node-table-line').click({ button: 'right', position: { x: 5, y: 5 } });
  return page.locator('.sb-context-menu').first();
}

const offsetLeft = (page: Page, sel: string) => page.evaluate((s) => {
  const fig = document.querySelector('.node-table-line')!.getBoundingClientRect();
  const el = document.querySelector(s)!.getBoundingClientRect();
  return { left: Math.round(el.left - fig.left), right: Math.round(fig.right - el.right) };
}, sel);

test('Position › Center centres a plain table in the outline and the PDF; Left and Undo put it back', async ({ page }) => {
  const errors = await open(page, PLAIN);
  expect((await offsetLeft(page, '.node-table-line table')).left).toBeLessThan(4);
  const m = await menu(page);
  await m.getByText('Position', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('Center', { exact: true }).click();
  expect(await page.evaluate('nodes[0].tables[0]')).toContain('data-position="center"');
  const c = await offsetLeft(page, '.node-table-line table');
  expect(Math.abs(c.left - c.right)).toBeLessThan(4);

  // PDF figure is centred too.
  const pdf = await page.evaluate(() => {
    // @ts-expect-error
    renderPreviewBody();
    const fig = document.querySelector('#preview-doc .pv-table-figure');
    return !!fig?.classList.contains('pos-center');
  });
  expect(pdf).toBe(true);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => page.evaluate('nodes[0].tables[0]')).not.toContain('data-position');
  expect(errors).toEqual([]);
});

test('a centred chart draws in the middle; Cards list Position greyed out with the reason', async ({ page }) => {
  await open(page, PLAIN.replace('<table>', '<table data-feature-chart="1" data-chart-type="bar" data-chart-size="small" data-position="center">'));
  const c = await offsetLeft(page, '.node-table-line svg.pv-table-chart-svg');
  expect(c.left).toBeGreaterThan(100);
  expect(Math.abs(c.left - c.right)).toBeLessThan(4);

  await page.evaluate(`nodes[0].tables[0] = ${JSON.stringify('<table data-feature-chart="1" data-chart-type="cards" data-position="center"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody><tr><td>Orders</td><td>1,240</td></tr><tr><td>Returns</td><td>32</td></tr></tbody></table>')}; render();`);
  // A display that fills the width ignores the stored position.
  await expect(page.locator('.node-table-line')).not.toHaveClass(/pos-center/);
  const m = await menu(page);
  const pos = m.locator('.sb-context-item', { hasText: 'Position' });
  await expect(pos).toBeDisabled();
  await expect(pos.locator('.sb-context-sub')).toHaveText('Fills the full width');
});
