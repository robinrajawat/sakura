import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Four table/Cards/PDF bugs:
//  1. A section node `[Release 2.4] Plan` printed as "Release 2.4] Plan" in the PDF heading and
//     Contents (only a leading `[` and a trailing `]` were stripped).
//  2. Clicking into a table to edit it snapped every column to an equal width (words wrapped mid-
//     word) and that even split was saved, so Esc didn't bring the natural layout back.
//  3. A chart's/Cards' right-click menu had no way to see or edit the underlying numbers.
//  4. A long table in the PDF didn't repeat its header row on each page it spans.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DOC_ID = 'tablespdfdoc';

const PLAIN = '<table><thead><tr><th>Workstream</th><th>Owner</th><th>Status</th><th>Due</th></tr></thead><tbody>'
  + '<tr><td>Login</td><td>Sam</td><td>In progress</td><td>Oct 14</td></tr>'
  + '<tr><td>Billing export</td><td>Priya</td><td>Blocked</td><td>Oct 18</td></tr>'
  + '<tr><td>SSO (Okta)</td><td>Sam</td><td>Not started</td><td>Oct 25</td></tr></tbody></table>';
const CHART = '<table data-feature-chart="1" data-chart-type="bar"><thead><tr><th>Quarter</th><th>Revenue</th></tr></thead><tbody>'
  + '<tr><td>Q1</td><td>120</td></tr><tr><td>Q2</td><td>150</td></tr></tbody></table>';
const CARDS = '<table data-feature-chart="1" data-chart-type="cards"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>'
  + '<tr><td>NPS</td><td>47</td></tr><tr><td>Churn</td><td>2.1%</td></tr></tbody></table>';
// No <thead>: the first row is all <th> (the shape of a pasted table).
const LONG = '<table><tbody><tr><th>Ticket</th><th>Owner</th></tr>'
  + Array.from({ length: 70 }, (_, i) => `<tr><td>Ticket ${1000 + i}</td><td>Sam</td></tr>`).join('') + '</tbody></table>';

test.beforeEach(async ({ page }) => {
  // Seeded before the first load (never write-then-reload: flaky under parallel load here).
  await page.addInitScript(({ docId, tables }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      const n = (id: number, depth: number, text: string, parentId: number | null, t: string[] = [], note = '') =>
        ({ id, depth, text, parentId, isCheckbox: false, checked: false, note, tables: t, tags: [], styles: {} });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [
          n(1, 0, '[Release 2.4] Plan', null),
          n(2, 1, 'Workstreams', 1, [tables.PLAIN]),
          n(3, 1, 'Budget', 1, [tables.CHART]),
          n(4, 1, 'Health', 1, [tables.CARDS]),
          n(5, 0, '[Risks]', null),
          n(6, 0, 'Plan [draft]', null),
          n(7, 1, 'All tickets', 6, [tables.LONG])
        ],
        nextId: 8, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Tables', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Tables', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID, tables: { PLAIN, CHART, CARDS, LONG } });
});

async function load(page: import('@playwright/test').Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
  await expect(page.locator('.node-row')).toHaveCount(7, { timeout: 15000 });
  await expect(page.locator('.node-table-line')).toHaveCount(4);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    undoStack = []; redoStack = [];
  });
  return errors;
}

const storedTable = (page: import('@playwright/test').Page, nodeIdx: number) =>
  // @ts-expect-error -- bare globals
  page.evaluate((i) => nodes[i].tables[0] as string, nodeIdx);

test('PDF section headings and Contents keep an old leading [label] intact: "Release 2.4 · Plan" (converted once to text)', async ({ page }) => {
  const errors = await load(page);
  const r = await page.evaluate(() => {
    // @ts-expect-error -- bare global
    renderPreviewBody();
    return {
      sections: [...document.querySelectorAll('#preview-body .pv-section')].map((e) => e.textContent),
      toc: [...document.querySelectorAll('#preview-toc .pv-toc-label')].map((e) => e.textContent)
    };
  });
  expect(r.sections).toEqual(['Release 2.4 · Plan', 'Risks', 'Plan [draft]']);
  // typed brackets are plain text since rows became rich text, so "[draft]" stays as written
  expect(r.toc).toEqual(['Release 2.4 · Plan', 'Risks', 'Plan [draft]']);
  expect(errors).toEqual([]);
});

test('clicking into a table keeps its column widths and wrapping, and Esc / click outside restore the display untouched', async ({ page }) => {
  const errors = await load(page);
  const fig = page.locator('.node-table-line').first();
  const measure = () => page.evaluate(() => {
    const t = document.querySelector('.node-table-line table') as HTMLTableElement;
    const th = t.rows[0].cells[0];
    const range = document.createRange(); range.selectNodeContents(th.firstChild as Node);
    return {
      widths: [...t.rows[0].cells].map((c) => Math.round(c.getBoundingClientRect().width)),
      height: Math.round(t.getBoundingClientRect().height),
      // "Workstream" on one line: a word broken mid-way would produce two line boxes.
      headerLines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    };
  });
  const before = await measure();
  expect(before.headerLines).toBe(1);
  const original = await storedTable(page, 1);

  await fig.locator('td').nth(1).click();
  await expect(fig).toHaveClass(/editing/);
  const editing = await measure();
  expect(editing).toEqual(before);

  await page.keyboard.press('Escape');
  await expect(fig).not.toHaveClass(/editing/);
  expect(await measure()).toEqual(before);
  // Nothing typed: nothing saved (no even-split <colgroup> baked in) and no undo step.
  expect(await storedTable(page, 1)).toBe(original);
  // @ts-expect-error -- bare global
  expect(await page.evaluate(() => undoStack.length)).toBe(0);

  // Leaving by clicking elsewhere restores the display the same way.
  await fig.locator('td').nth(2).click();
  await expect(fig).toHaveClass(/editing/);
  await page.locator('#editor-pane').click({ position: { x: 5, y: 5 } });
  await expect(fig).not.toHaveClass(/editing/);
  expect(await measure()).toEqual(before);
  expect(await storedTable(page, 1)).not.toContain('<colgroup');
  expect(errors).toEqual([]);
});

test('a chart\'s "Edit data" shows its table for editing, re-renders the chart with the new values, and undoes in one step', async ({ page }) => {
  const errors = await load(page);
  const chart = page.locator('.node-table-line').nth(1);
  await expect(chart.locator('svg')).toBeVisible();
  await chart.click({ button: 'right' });
  const menu = page.locator('.sb-context-menu');
  await menu.getByText('Edit data', { exact: true }).click();
  await expect(chart).toHaveClass(/editing/);
  await expect(chart.locator('table')).toBeVisible();
  await expect(chart.locator('svg')).toHaveCount(0);

  // The table's own row/column menu is available while editing.
  await chart.locator('td').nth(1).click({ button: 'right' });
  await expect(menu.getByText('Insert', { exact: true })).toBeVisible();
  // Two edits in one session. Esc closes the (tall) cell menu without ending the session.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await chart.locator('td').nth(1).click();
  await expect(chart).toHaveClass(/editing/);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('400');
  await chart.locator('td').nth(3).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('90');
  await page.keyboard.press('Escape');
  await expect(chart).not.toHaveClass(/editing/);
  await expect(chart).toHaveClass(/pv-table-chart-figure/);
  await expect(chart.locator('svg')).toBeVisible();
  const stored = await storedTable(page, 2);
  expect(stored).toContain('data-feature-chart="1"');
  expect(stored).toMatch(/<td[^>]*>400<\/td>/);
  expect(stored).toMatch(/<td[^>]*>90<\/td>/);
  await expect(chart.locator('svg')).toContainText('400');

  // One undo step for the whole session, restoring the original values.
  // @ts-expect-error -- bare global
  expect(await page.evaluate(() => undoStack.length)).toBe(1);
  await page.evaluate(() => {
    // @ts-expect-error -- bare global (what Ctrl/Cmd+Z in the outline runs)
    contextualUndo();
  });
  const restored = await storedTable(page, 2);
  expect(restored).toMatch(/<td[^>]*>120<\/td>/);
  expect(restored).toMatch(/<td[^>]*>150<\/td>/);
  await expect(page.locator('.node-table-line').nth(1).locator('svg')).toBeVisible();
  expect(errors).toEqual([]);
});

test('double-clicking a Cards figure opens Edit data; leaving it shows the cards with the edited value', async ({ page }) => {
  const errors = await load(page);
  const cards = page.locator('.node-table-line').nth(2);
  await expect(cards).toContainText('47');
  await cards.click({ button: 'right' });
  await expect(page.locator('.sb-context-menu').getByText('Edit data', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await cards.dblclick();
  await expect(cards).toHaveClass(/editing/);
  await expect(cards.locator('table td').first()).toHaveAttribute('contenteditable', 'true');
  await cards.locator('td').nth(1).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('52');
  await page.locator('#editor-pane').click({ position: { x: 5, y: 5 } });
  await expect(cards).not.toHaveClass(/editing/);
  await expect(cards.locator('table')).toHaveCount(0);
  await expect(cards).toContainText('52');
  expect(await storedTable(page, 3)).toContain('data-chart-type="cards"');
  expect(errors).toEqual([]);
});

test('PDF: table header rows repeat on every page (incl. a first row of <th> without <thead>), rows don\'t split', async ({ page }) => {
  const errors = await load(page);
  const storedBefore = await storedTable(page, 6);
  await page.evaluate(() => {
    window.print = () => {};
    // @ts-expect-error -- bare global
    exportPdfDirect();
  });
  await page.emulateMedia({ media: 'print' });
  const r = await page.evaluate(() => {
    const figs = [...document.querySelectorAll('#preview-body .pv-table-figure:not(.pv-table-chart-figure)')];
    return figs.map((f) => {
      const t = f.querySelector('table') as HTMLTableElement;
      const thead = t.tHead;
      return {
        headText: thead ? thead.textContent : null,
        theadDisplay: thead ? getComputedStyle(thead).display : null,
        trBreak: getComputedStyle(t.rows[1]).breakInside,
        figBreak: getComputedStyle(f).breakInside,
        rowBreakBefore: getComputedStyle(f.parentElement as Element).breakBefore
      };
    });
  });
  expect(r).toHaveLength(2);
  expect(r[0]).toEqual({ headText: 'WorkstreamOwnerStatusDue', theadDisplay: 'table-header-group', trBreak: 'avoid', figBreak: 'auto', rowBreakBefore: 'avoid' });
  expect(r[1]).toEqual({ headText: 'TicketOwner', theadDisplay: 'table-header-group', trBreak: 'avoid', figBreak: 'auto', rowBreakBefore: 'avoid' });
  // The <thead> promotion is PDF-only: stored data is untouched.
  expect(await storedTable(page, 6)).toBe(storedBefore);

  // A real print: the long table spans several pages.
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
  expect(pages).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});
