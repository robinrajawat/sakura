import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Short values are typed where they're shown, not in a dialog (owner, 2026-10-23: unified UI,
// inline editing over popups): document name (sidebar), chart / Cards title, AI outline topic.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(() => (window as any).eval(`ensureDocumentForEditing();
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });
    nodes = [n(1, 0, 'Alpha'), n(2, 0, 'Bravo')].map(normalizeNode); rebuildParentIds(); nextId = 3;
    el('header-title').value = 'Plan'; saveToStorage(); renderTabStrip(); renderSidebar(); collapsedIds = new Set(); selectedId = null; editingId = null; render();`));
});
test.afterEach(() => { expect(errors).toEqual([]); });

const box = (page: Page) => page.locator('.inline-edit-input');
const title = (page: Page) => page.evaluate(() => (window as any).eval('loadDocsIndex().find(d => d.id === currentDocId).title'));

test('sidebar F2 renames in place; Esc leaves the name as it was', async ({ page }) => {
  const nb = page.locator('.sdoc-name-btn[data-doc-id]').first();
  await nb.focus();
  await page.keyboard.press('F2');
  await expect(box(page)).toBeFocused();
  await page.keyboard.type('Nope');
  await page.keyboard.press('Escape');
  await expect(box(page)).toHaveCount(0);
  expect(await title(page)).toBe('Plan');
});

test('the AI outline topic is a line in the document, not a dialog; Esc drops it', async ({ page }) => {
  await page.evaluate(() => (window as any).eval(`setFeatureEnabled('ai', true, false); window.__topic = null; callAiApiOutline = async (t) => { window.__topic = t; return '- One\\n- Two'; };`));
  await page.locator('.node-row[data-id="1"]').click();
  await page.keyboard.press('Escape');
  const run = page.evaluate(() => (window as any).eval('generateOutlineWithAi()'));
  await expect(page.locator('.inline-edit-input.inline-edit-ask')).toBeFocused();
  await expect(page.locator('#sakura-modal-overlay.open')).toHaveCount(0);
  await page.keyboard.type('Cutover steps');
  await page.keyboard.press('Enter');
  await run;
  expect(await page.evaluate(() => (window as any).__topic)).toBe('Cutover steps');
  const again = page.evaluate(() => (window as any).eval('generateOutlineWithAi()'));
  await expect(page.locator('.inline-edit-input.inline-edit-ask')).toBeFocused();
  await page.keyboard.press('Escape');
  await again;
  await expect(page.locator('.inline-edit-input')).toHaveCount(0);
});

test('a chart title is typed over the chart, not in a dialog', async ({ page }) => {
  await page.evaluate(() => (window as any).eval(`nodes[0].tables = ['<table data-feature-chart="1" data-chart-type="bar"><tr><th>Q</th><th>Sales</th></tr><tr><td>Q1</td><td>4</td></tr><tr><td>Q2</td><td>7</td></tr></table>']; render();`));
  const fig = page.locator('.pv-table-chart-figure').first();
  await fig.click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Add title' }).click();
  await expect(box(page)).toBeFocused();
  await expect(page.locator('#sakura-modal-overlay.open')).toHaveCount(0);
  await page.keyboard.type('Sales by quarter');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).eval('nodes[0].tables[0]'))).toContain('data-chart-title="Sales by quarter"');
});
