import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Show as › Pros & cons: a two-column Pros / Cons table (or Advantages / Disadvantages, ...) as two
// side-by-side lists. And ticks / crosses: comparison columns of yes / no / partial show icons.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const PC = '<table><thead><tr><th>Cons</th><th>Pros</th></tr></thead><tbody>'
  + '<tr><td>3-month migration</td><td>Cheaper rates</td></tr>'
  + '<tr><td>No weekend support</td><td>Good API docs</td></tr>'
  + '<tr><td></td><td>Faster printing</td></tr></tbody></table>';
const CMP = '<table><thead><tr><th>Criteria</th><th>Carrier A</th><th>Carrier B</th></tr></thead><tbody>'
  + '<tr><td>Weekend support</td><td>yes</td><td>no</td></tr>'
  + '<tr><td>API</td><td>✓</td><td>partial</td></tr>'
  + '<tr><td>Tracking</td><td>Yes, from Q2</td><td>✗</td></tr></tbody></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript((tables) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const docId = 'pcdoc';
      const n = (id: number, text: string, t: string) => ({ id, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [t], tags: [], styles: {} });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [n(1, 'Decision', tables[0]), n(2, 'Carriers', tables[1])],
        nextId: 3, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'PC', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'PC', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, [PC, CMP]);
});

test('Show as › Pros & cons lists pros and cons side by side', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.locator('.node-table-line').first().click({ button: 'right', position: { x: 5, y: 5 } });
  await page.locator('.sb-context-menu').getByText('Show as', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('Pros & cons', { exact: true }).click();

  const pc = page.locator('.pv-proscons');
  // Pros first even though the table has Cons in column A; headings as written.
  await expect(pc.locator('.pv-pc-col').first()).toHaveClass(/pros/);
  await expect(pc.locator('.pros .pv-pc-label')).toHaveText('Pros');
  await expect(pc.locator('.pros li')).toHaveText(['Cheaper rates', 'Good API docs', 'Faster printing']);
  await expect(pc.locator('.cons li')).toHaveText(['3-month migration', 'No weekend support']);
  await expect(pc.locator('.pv-pc-count')).toHaveText(['3', '2']);
  // Side by side.
  const [a, b] = await pc.locator('.pv-pc-col').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
  expect(Math.abs(a - b)).toBeLessThan(2);
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[0].tables[0])).toContain('data-table-display="proscons"');
  // @ts-expect-error -- bare global from index.html
  await page.evaluate(() => renderPreviewBody());
  await expect(page.locator('#preview-overlay .pv-proscons li')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('Pros & cons is greyed out for other tables', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => {
    const d = document.createElement('div');
    d.innerHTML = '<table><tr><th>Pros</th><th>Notes</th></tr><tr><td>a</td><td>b</td></tr></table>';
    const item = (window as any).buildChartFeatureItems(d.querySelector('table'), () => {}).find((i: any) => i.label === 'Show as').submenu.find((i: any) => i.label === 'Pros & cons');
    return { disabled: item.disabled, title: item.title };
  });
  expect(r.disabled).toBe(true);
  expect(r.title).toContain('Pros / Cons');
});

test('comparison columns show ticks, crosses and partly as icons; free text stays', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const t = page.locator('.node-table-line').nth(1);
  const checks = await t.locator('tbody tr').evaluateAll((rows) => rows.map((r) => [...r.querySelectorAll('td')].slice(1).map((c) => c.querySelector('.tbl-check')?.getAttribute('data-check') ?? c.textContent)));
  expect(checks).toEqual([['yes', 'no'], ['yes', 'partial'], ['Yes, from Q2', 'no']]);
  await expect(t.locator('.tbl-check').first()).toHaveAttribute('data-tip', 'yes');
  // Display only.
  // @ts-expect-error -- bare global from index.html
  expect(await page.evaluate(() => nodes[1].tables[0])).not.toContain('tbl-check');
  // A column set to Text keeps its words.
  // @ts-expect-error -- bare globals from index.html
  await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = nodes[1].tables[0]; const tb = d.querySelector('table')!; tableSetColumnType(tb, tb.rows[0].cells[1], 'text'); nodes[1].tables[0] = tb.outerHTML; render(); });
  await expect(page.locator('.node-table-line').nth(1).locator('tbody td:nth-child(2) .tbl-check')).toHaveCount(0);
  await expect(page.locator('.node-table-line').nth(1).locator('tbody td:nth-child(3) .tbl-check')).toHaveCount(3);
});
