import { test, expect, type Page, type Locator } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Table editing (handoff item 13, PR 2): the fuller cell menu (add/move rows and columns, sort,
// header row, alignment, delete), keyboard navigation, the "Add table…" grid picker, pasting a
// spreadsheet range, per-column alignment (explicit + automatic for numbers) in the outline and
// the PDF, and charts/Cards staying charts on a single click.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DOC_ID = 'tableeditdoc';

const PLAIN = '<table><thead><tr><th>Item</th><th>Budget</th><th>Share</th><th>Due</th></tr></thead><tbody>'
  + '<tr><td>Login</td><td>$1,200</td><td>9%</td><td>Oct 14</td></tr>'
  + '<tr><td>billing</td><td>$950</td><td>10%</td><td>Nov 3</td></tr>'
  + '<tr><td>SSO</td><td>$10,000</td><td>12.5%</td><td>Oct 2</td></tr></tbody></table>';
const CHART = '<table data-feature-chart="1" data-chart-type="bar"><thead><tr><th>Quarter</th><th>Revenue</th></tr></thead><tbody>'
  + '<tr><td>Q1</td><td>120</td></tr><tr><td>Q2</td><td>150</td></tr></tbody></table>';
const CARDS = '<table data-feature-chart="1" data-chart-type="cards"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>'
  + '<tr><td>NPS</td><td>47</td></tr><tr><td>Churn</td><td>2.1%</td></tr></tbody></table>';
// No <thead>: a pasted table whose first row is all <th>.
const PASTED = '<table><tbody><tr><th>Name</th><th>Score</th></tr><tr><td>b</td><td>2</td></tr><tr><td>a</td><td>10</td></tr></tbody></table>';
const ISO = '<table><thead><tr><th>Release</th><th>Date</th></tr></thead><tbody>'
  + '<tr><td>R3</td><td>2026-10-14</td></tr><tr><td>R1</td><td>2025-12-31</td></tr><tr><td>R2</td><td>2026-01-02</td></tr></tbody></table>';

test.beforeEach(async ({ page }) => {
  // Seeded before the first load (never write-then-reload: flaky under parallel load here).
  await page.addInitScript(({ docId, tables }) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      const n = (id: number, depth: number, text: string, parentId: number | null, t: string[] = []) =>
        ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: t, tags: [], styles: {} });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [
          n(1, 0, 'Workstreams', null, [tables.PLAIN]),
          n(2, 0, 'Revenue', null, [tables.CHART]),
          n(3, 0, 'Health', null, [tables.CARDS]),
          n(4, 0, 'Scores', null, [tables.PASTED]),
          n(5, 0, 'Releases', null, [tables.ISO]),
          n(6, 0, 'New section', null)
        ],
        nextId: 7, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Tables', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Tables', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID, tables: { PLAIN, CHART, CARDS, PASTED, ISO } });
});

async function load(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push('pageerror: ' + err.message); });
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
  await expect(page.locator('.node-row')).toHaveCount(6, { timeout: 15000 });
  await expect(page.locator('.node-table-line')).toHaveCount(5);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    undoStack = []; redoStack = [];
  });
  return errors;
}

const fig = (page: Page, i: number) => page.locator('.node-table-line').nth(i);
const stored = (page: Page, nodeIdx: number) =>
  // @ts-expect-error -- bare globals
  page.evaluate((i) => nodes[i].tables[0] as string, nodeIdx);
const undoLen = (page: Page) =>
  // @ts-expect-error -- bare global
  page.evaluate(() => undoStack.length as number);

/** Rows of a figure's (live or display) table as arrays of cell text. */
const grid = (f: Locator) => f.locator('table').evaluate((t: HTMLTableElement) =>
  [...t.rows].map((r) => [...r.cells].map((c) => (c.textContent || '').trim())));
/** Same, for the STORED table of node `nodeIdx`, plus which rows are header rows. */
const storedGrid = (page: Page, nodeIdx: number) => page.evaluate((i) => {
  const d = document.createElement('div');
  // @ts-expect-error -- bare global
  d.innerHTML = nodes[i].tables[0];
  const t = d.querySelector('table') as HTMLTableElement;
  return {
    rows: [...t.rows].map((r) => [...r.cells].map((c) => (c.textContent || '').trim())),
    head: [...t.rows].map((r) => r.parentElement?.tagName === 'THEAD' || [...r.cells].every((c) => c.tagName === 'TH')),
    thead: !!t.tHead
  };
}, nodeIdx);

async function editCell(page: Page, figIdx: number, cell: string) {
  const f = fig(page, figIdx);
  await f.locator('td,th', { hasText: cell }).first().click();
  await expect(f).toHaveClass(/editing/);
  return f;
}
async function cellMenu(page: Page, f: Locator, cell: string) {
  await f.locator('td,th', { hasText: cell }).first().click({ button: 'right' });
  const menu = page.locator('.sb-context-menu');
  await expect(menu).toBeVisible();
  return menu;
}
async function menuAction(page: Page, f: Locator, cell: string, label: string) {
  const menu = await cellMenu(page, f, cell);
  await menu.locator('.sb-context-item', { hasText: label }).first().click();
  await expect(menu).toHaveCount(0);
}
const activeCellText = (page: Page) => page.evaluate(() => {
  const a = document.activeElement as HTMLElement | null;
  const c = a?.closest('td,th');
  return c ? { text: (c.textContent || '').trim(), row: (c.parentElement as HTMLTableRowElement).rowIndex, col: (c as HTMLTableCellElement).cellIndex } : null;
});

test('the cell menu lists every action in dividered groups, with no empty divider', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'billing');
  const menu = await cellMenu(page, f, 'billing');
  const entries = await menu.evaluate((m) => [...m.children].map((c) => c.classList.contains('sb-context-divider') ? '---' : (c.textContent || '').trim()));
  expect(entries).toEqual([
    'Add row above', 'Add row below', 'Add column left', 'Add column right', '---',
    'Move row up', 'Move row down', 'Move column left', 'Move column right', '---',
    'Sort A → Z', 'Sort Z → A', 'Turn header row off', '---',
    'Align column left', 'Align column center', 'Align column right', '---',
    'Show as', 'Heat-map', 'Add title…', 'Chart size', '---',
    'Delete row', 'Delete column', 'Delete table'
  ]);
  // On the header row, rows can't be added above it or moved.
  await page.keyboard.press('Escape');
  const head = await cellMenu(page, f, 'Budget');
  for (const label of ['Add row above', 'Move row up', 'Move row down']) {
    await expect(head.locator('.sb-context-item', { hasText: label })).toBeDisabled();
  }
  await expect(head.locator('.sb-context-item', { hasText: 'Move column left' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('add row above/below and column left/right, keeping the header in the header', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'billing');
  await menuAction(page, f, 'billing', 'Add row above');
  expect(await activeCellText(page)).toEqual({ text: '', row: 2, col: 0 });
  await page.keyboard.type('above');
  await menuAction(page, f, 'billing', 'Add row below');
  await page.keyboard.type('below');
  await menuAction(page, f, 'Budget', 'Add column left');
  await page.keyboard.type('L');
  await menuAction(page, f, 'Due', 'Add column right');
  // Header cells added "around" the header row's add-row land at the top of the body.
  await menuAction(page, f, 'Item', 'Add row below');
  await page.keyboard.type('top');
  await page.keyboard.press('Escape');
  const s = await storedGrid(page, 0);
  expect(s.rows.map((r) => r[0])).toEqual(['Item', 'top', 'Login', 'above', 'billing', 'below', 'SSO']);
  expect(s.rows[0]).toEqual(['Item', 'ColumnL', 'Budget', 'Share', 'Due', 'Column']);
  expect(s.head).toEqual([true, false, false, false, false, false, false]);
  expect(s.rows.every((r) => r.length === 6)).toBe(true);
  // One editing session = one undo step.
  expect(await undoLen(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('move rows and columns, never across the header', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'SSO');
  await menuAction(page, f, 'SSO', 'Move row up');
  await menuAction(page, f, 'SSO', 'Move row up');
  expect(await activeCellText(page)).toMatchObject({ text: 'SSO', row: 1 });
  await expect((await cellMenu(page, f, 'SSO')).locator('.sb-context-item', { hasText: 'Move row up' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await menuAction(page, f, 'Login', 'Move row down');
  await menuAction(page, f, 'Share', 'Move column left');
  await menuAction(page, f, 'Item', 'Move column right');
  await page.keyboard.press('Escape');
  const s = await storedGrid(page, 0);
  expect(s.rows).toEqual([
    ['Share', 'Item', 'Budget', 'Due'],
    ['12.5%', 'SSO', '$10,000', 'Oct 2'],
    ['10%', 'billing', '$950', 'Nov 3'],
    ['9%', 'Login', '$1,200', 'Oct 14']
  ]);
  expect(s.head).toEqual([true, false, false, false]);
  expect(errors).toEqual([]);
});

test('sorting is numeric-, percent-, currency- and date-aware, and leaves the header alone', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'Login');
  const col = async (i: number) => (await grid(f)).slice(1).map((r) => r[i]);
  await menuAction(page, f, '$950', 'Sort A → Z');
  expect(await col(1)).toEqual(['$950', '$1,200', '$10,000']);
  await menuAction(page, f, '9%', 'Sort Z → A');
  expect(await col(2)).toEqual(['12.5%', '10%', '9%']);
  await menuAction(page, f, 'Oct 14', 'Sort A → Z');
  expect(await col(3)).toEqual(['Oct 2', 'Oct 14', 'Nov 3']);
  await menuAction(page, f, 'Login', 'Sort A → Z');
  expect(await col(0)).toEqual(['billing', 'Login', 'SSO']);
  expect((await grid(f))[0]).toEqual(['Item', 'Budget', 'Share', 'Due']);
  await page.keyboard.press('Escape');
  expect((await storedGrid(page, 0)).thead).toBe(true);

  // ISO dates; and a pasted table whose header is a first row of <th> (no <thead>).
  const iso = await editCell(page, 4, 'R1');
  await menuAction(page, iso, '2026-10-14', 'Sort A → Z');
  expect((await grid(iso)).map((r) => r[0])).toEqual(['Release', 'R1', 'R2', 'R3']);
  await page.keyboard.press('Escape');
  const pasted = await editCell(page, 3, 'b');
  await menuAction(page, pasted, '10', 'Sort A → Z');
  await page.keyboard.press('Escape');
  const s = await storedGrid(page, 3);
  expect(s.rows).toEqual([['Name', 'Score'], ['b', '2'], ['a', '10']]);
  expect(s.head).toEqual([true, false, false]);
  expect(errors).toEqual([]);
});

test('header row toggles off and on without moving any row', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'Login');
  await menuAction(page, f, 'Login', 'Turn header row off');
  await expect(f.locator('th')).toHaveCount(0);
  await menuAction(page, f, 'Item', 'Turn header row on');
  await expect(f.locator('thead th')).toHaveCount(4);
  await menuAction(page, f, 'Item', 'Turn header row off');
  await page.keyboard.press('Escape');
  let s = await storedGrid(page, 0);
  expect(s.thead).toBe(false);
  expect(s.head).toEqual([false, false, false, false]);
  expect(s.rows[0]).toEqual(['Item', 'Budget', 'Share', 'Due']);
  // A sort with no header sorts every row.
  const f2 = await editCell(page, 0, 'Login');
  await menuAction(page, f2, 'Login', 'Sort A → Z');
  await menuAction(page, f2, 'billing', 'Turn header row on');
  await page.keyboard.press('Escape');
  s = await storedGrid(page, 0);
  expect(s.rows.map((r) => r[0])).toEqual(['billing', 'Item', 'Login', 'SSO']);
  expect(s.head).toEqual([true, false, false, false]);
  // Pasted table: first row of <th> counts as the header.
  const p = await editCell(page, 3, 'a');
  const menu = await cellMenu(page, p, 'a');
  await expect(menu.locator('.sb-context-item', { hasText: 'Turn header row off' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('delete row, column and table; each session undoes in one step', async ({ page }) => {
  const errors = await load(page);
  const original = await stored(page, 0);
  const f = await editCell(page, 0, 'billing');
  await menuAction(page, f, 'billing', 'Delete row');
  await expect(f).toHaveClass(/editing/);
  await menuAction(page, f, 'Share', 'Delete column');
  await page.keyboard.press('Escape');
  expect((await storedGrid(page, 0)).rows).toEqual([['Item', 'Budget', 'Due'], ['Login', '$1,200', 'Oct 14'], ['SSO', '$10,000', 'Oct 2']]);
  expect(await undoLen(page)).toBe(1);
  await page.keyboard.press('Control+z');
  expect(await stored(page, 0)).toBe(original);

  const f2 = await editCell(page, 0, 'billing');
  await menuAction(page, f2, 'billing', 'Delete table');
  await expect(page.locator('.node-table-line')).toHaveCount(4);
  // @ts-expect-error -- bare global
  expect(await page.evaluate(() => nodes[0].tables.length)).toBe(0);
  await page.locator('#editor-pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.node-table-line')).toHaveCount(5);
  expect(await stored(page, 0)).toBe(original);
  expect(errors).toEqual([]);
});

test('keyboard: Tab/Shift+Tab wrap across cells, Tab and Enter add rows at the end, Shift+Enter breaks a line', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'Oct 14');
  await page.keyboard.press('Tab');
  expect(await activeCellText(page)).toEqual({ text: 'billing', row: 2, col: 0 });
  // Caret at the end of the cell's text.
  await page.keyboard.type('!');
  expect((await grid(f))[2][0]).toBe('billing!');
  await page.keyboard.press('Shift+Tab');
  expect(await activeCellText(page)).toEqual({ text: 'Oct 14', row: 1, col: 3 });
  await page.keyboard.press('Enter');
  expect(await activeCellText(page)).toEqual({ text: 'Nov 3', row: 2, col: 3 });
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  // Enter in the last row added a row and moved into the same column.
  expect(await activeCellText(page)).toEqual({ text: '', row: 4, col: 3 });
  await page.keyboard.type('Dec 1');
  // Tab in the last cell adds another row and moves to its first cell.
  await page.keyboard.press('Tab');
  expect(await activeCellText(page)).toEqual({ text: '', row: 5, col: 0 });
  await page.keyboard.type('line one');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('line two');
  expect(await f.locator('table').evaluate((t: HTMLTableElement) => t.rows[5].cells[0].querySelectorAll('br').length)).toBeGreaterThan(0);
  // Shift+Tab from the first cell never leaves the table.
  const first = f.locator('th').first();
  await first.click();
  await page.keyboard.press('Shift+Tab');
  expect(await activeCellText(page)).toMatchObject({ row: 0, col: 0 });
  await expect(f).toHaveClass(/editing/);
  // Tab never moves focus out to the outline either: 30 presses stay inside.
  for (let i = 0; i < 30; i++) await page.keyboard.press('Tab');
  expect(await activeCellText(page)).not.toBeNull();
  await page.keyboard.press('Escape');
  const s = await storedGrid(page, 0);
  expect(s.rows[4]).toEqual(['', '', '', 'Dec 1']);
  expect(s.rows[5][0]).toBe('line oneline two');
  expect(await stored(page, 0)).toMatch(/line one<br>line two/);
  // @ts-expect-error -- bare global; Tab didn't indent the node
  expect(await page.evaluate(() => nodes[0].depth)).toBe(0);
  expect(await undoLen(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('ArrowUp/ArrowDown move between cells on a cell\'s first/last line and stay native inside', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'billing');
  await page.keyboard.press('ArrowDown');
  expect(await activeCellText(page)).toMatchObject({ text: 'SSO', row: 3 });
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  expect(await activeCellText(page)).toMatchObject({ text: 'Login', row: 1 });
  // A two-line cell: ArrowUp from its second line stays inside it.
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('more');
  await page.keyboard.press('ArrowUp');
  expect(await activeCellText(page)).toMatchObject({ row: 1, col: 0 });
  await page.keyboard.press('ArrowUp');
  expect(await activeCellText(page)).toMatchObject({ row: 0, col: 0 });
  await expect(f).toHaveClass(/editing/);
  expect(errors).toEqual([]);
});

async function openAddTable(page: Page) {
  await page.locator('.node-row[data-id="6"]').click({ button: 'right' });
  await page.locator('#context-quickbar [data-action="table"], #context-more-panel [data-action="table"]').first().click();
  const picker = page.locator('.table-grid-picker');
  await expect(picker).toBeVisible();
  return picker;
}

test('"Add table…" opens a grid picker: hover + click inserts that size with a header and starts editing', async ({ page }) => {
  const errors = await load(page);
  const picker = await openAddTable(page);
  await expect(picker.locator('.table-grid-picker-readout')).toHaveText('3 × 3');
  await picker.locator('.table-grid-picker-cell[data-r="4"][data-c="5"]').hover();
  await expect(picker.locator('.table-grid-picker-readout')).toHaveText('5 × 4');
  await expect(picker.locator('.table-grid-picker-cell.on')).toHaveCount(20);
  await picker.locator('.table-grid-picker-cell[data-r="4"][data-c="5"]').click();
  await expect(picker).toHaveCount(0);
  const f = page.locator('.node-table-line[data-node-id="6"]');
  await expect(f).toHaveClass(/editing/);
  await expect(f.locator('thead th')).toHaveCount(5);
  await expect(f.locator('tbody tr')).toHaveCount(3);
  // First header cell's placeholder text is selected: typing replaces it.
  await page.keyboard.type('Task');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Owner');
  await page.keyboard.press('Escape');
  // @ts-expect-error -- bare global
  const t = await page.evaluate(() => nodes[5].tables[0] as string);
  expect(t).toContain('<th contenteditable="true">Task</th>');
  expect(t).toMatch(/Owner/);
  expect(errors).toEqual([]);
});

test('grid picker is keyboard accessible: arrows resize, Enter inserts, Esc cancels', async ({ page }) => {
  const errors = await load(page);
  let picker = await openAddTable(page);
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  // @ts-expect-error -- bare global
  expect(await page.evaluate(() => (nodes[5].tables || []).length)).toBe(0);
  expect(await undoLen(page)).toBe(0);

  picker = await openAddTable(page);
  for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowUp', 'ArrowUp']) await page.keyboard.press(k);
  await expect(picker.locator('.table-grid-picker-readout')).toHaveText('4 × 1');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  await expect(picker.locator('.table-grid-picker-readout')).toHaveText('8 × 1');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(picker).toHaveCount(0);
  const f = page.locator('.node-table-line[data-node-id="6"]');
  await expect(f).toHaveClass(/editing/);
  await expect(f.locator('th')).toHaveCount(8);
  await expect(f.locator('tbody tr')).toHaveCount(1);
  expect(await activeCellText(page)).toMatchObject({ text: 'Column 1', row: 0, col: 0 });
  // Undo removes the new table.
  await page.keyboard.press('Escape');
  await page.locator('#editor-pane').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  // @ts-expect-error -- bare global
  expect(await page.evaluate(() => (nodes[5].tables || []).length)).toBe(0);
  expect(errors).toEqual([]);
});

async function pasteInto(page: Page, data: Record<string, string>) {
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    Object.entries(d).forEach(([k, v]) => dt.setData(k, v));
    const target = document.activeElement as HTMLElement;
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
}

test('pasting a spreadsheet range fills cells from the caret, grows the table, and undoes in one step', async ({ page }) => {
  const errors = await load(page);
  const original = await stored(page, 0);
  const f = await editCell(page, 0, 'SSO');
  await pasteInto(page, { 'text/plain': 'Alpha\t1\t2\t3\t4\nBeta\t5\t6\t7\t8\n"Gamma\nline"\t9\t\t\t\n' });
  const g = await grid(f);
  expect(g.length).toBe(6);
  expect(g.every((r) => r.length === 5)).toBe(true);
  expect(g[3]).toEqual(['Alpha', '1', '2', '3', '4']);
  expect(g[4]).toEqual(['Beta', '5', '6', '7', '8']);
  expect(g[0]).toEqual(['Item', 'Budget', 'Share', 'Due', 'Column']);
  await page.keyboard.press('Escape');
  const s = await storedGrid(page, 0);
  expect(s.rows.length).toBe(6);
  expect(s.rows[5][0]).toBe('Gammaline');
  expect(await stored(page, 0)).toContain('Gamma<br>line');
  expect(await undoLen(page)).toBe(1);
  await page.keyboard.press('Control+z');
  expect(await stored(page, 0)).toBe(original);
  expect(errors).toEqual([]);
});

test('pasting an HTML table range fills cells; single-line text pastes into the cell normally', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'Login');
  await pasteInto(page, {
    'text/html': '<meta charset="utf-8"><table><tr><td>X1</td><td>Y1</td></tr><tr><td>X2</td><td>Y<br>2</td></tr></table>',
    'text/plain': 'X1\tY1\nX2\t"Y\n2"'
  });
  let g = await grid(f);
  expect(g[1].slice(0, 2)).toEqual(['X1', 'Y1']);
  expect(g[2].slice(0, 2)).toEqual(['X2', 'Y2']);
  await f.locator('td', { hasText: 'SSO' }).click();
  await page.keyboard.press('End');
  await pasteInto(page, { 'text/plain': ' (Okta)' });
  g = await grid(f);
  expect(g[3][0]).toBe('SSO (Okta)');
  expect(g.length).toBe(4);
  await page.keyboard.press('Escape');
  // Outside editing, pasting an external table onto a selected node still adds a new table object.
  await page.locator('.node-row[data-id="6"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<table><tr><th>A</th></tr><tr><td>1</td></tr></table>');
    dt.setData('text/plain', 'A\n1');
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  // @ts-expect-error -- bare global
  await expect.poll(() => page.evaluate(() => (nodes[5].tables || []).length)).toBe(1);
  expect(errors).toEqual([]);
});

const aligns = (root: Locator) => root.locator('table').first().evaluate((t: HTMLTableElement) =>
  [...t.rows].map((r) => [...r.cells].map((c) => getComputedStyle(c).textAlign)));

test('alignment: numeric columns right-align automatically; explicit alignment wins, is stored, and shows in the PDF', async ({ page }) => {
  const errors = await load(page);
  const f = fig(page, 0);
  const R = ['left', 'right', 'right', 'left'];
  expect(await aligns(f)).toEqual([R, R, R, R]);
  // While editing too.
  await editCell(page, 0, 'Login');
  expect(await aligns(f)).toEqual([R, R, R, R]);
  // Typing text into a numeric column turns its automatic alignment off.
  await f.locator('td', { hasText: '9%' }).click();
  await page.keyboard.type(' approx');
  expect((await aligns(f))[1][2]).toBe('left');
  await page.keyboard.press('Backspace');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
  expect((await aligns(f))[1][2]).toBe('right');
  await menuAction(page, f, 'Login', 'Align column center');
  await menuAction(page, f, '$950', 'Align column left');
  const menu = await cellMenu(page, f, '$950');
  await expect(menu.locator('.sb-context-item', { hasText: 'Align column left (current)' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const want = ['center', 'left', 'right', 'left'];
  expect(await aligns(f)).toEqual([want, want, want, want]);
  const html = await stored(page, 0);
  expect(html).toContain('data-align="center"');
  expect(html).toContain('data-align="left"');
  expect(html).not.toContain('data-auto-align');
  // Survives the sanitizer (load path) and renders the same in the PDF body.
  // @ts-expect-error -- bare global
  expect(await page.evaluate((h) => sakuraSanitizeRichHtml(h) === h, html)).toBe(true);
  await page.evaluate(() => {
    // @ts-expect-error -- bare global
    renderPreviewBody();
  });
  const pdf = page.locator('#preview-body .pv-table-figure').first();
  await page.evaluate(() => { const b = document.getElementById('preview-body'); if (b) { b.style.display = 'block'; (b.closest('[id]') as HTMLElement).style.display = 'block'; } });
  expect(await aligns(pdf)).toEqual([want, want, want, want]);
  // Automatic numeric alignment in the PDF too (Releases table has none; the chart-less Scores has a numeric column).
  const scores = page.locator('#preview-body .pv-table-figure').filter({ hasText: 'Score' }).first();
  expect(await aligns(scores)).toEqual([['left', 'right'], ['left', 'right'], ['left', 'right']]);
  expect(errors).toEqual([]);
});

test('alignment travels with a moved column and is inherited by added rows; "automatically" clears it', async ({ page }) => {
  const errors = await load(page);
  const f = await editCell(page, 0, 'Login');
  await menuAction(page, f, 'Login', 'Align column right');
  await menuAction(page, f, 'Login', 'Move column right');
  await menuAction(page, f, 'Login', 'Add row below');
  await page.keyboard.press('Escape');
  const t = await page.evaluate(() => {
    const d = document.createElement('div');
    // @ts-expect-error -- bare global
    d.innerHTML = nodes[0].tables[0];
    return [...(d.querySelector('table') as HTMLTableElement).rows].map((r) => [...r.cells].map((c) => c.getAttribute('data-align')));
  });
  expect(t.every((r) => r[1] === 'right' && r[0] === null)).toBe(true);
  expect(t.length).toBe(5);
  const f2 = await editCell(page, 0, 'Login');
  await menuAction(page, f2, 'Login', 'Align column automatically');
  await page.keyboard.press('Escape');
  expect(await stored(page, 0)).not.toContain('data-align');
  expect(errors).toEqual([]);
});

test('a single click leaves a chart or Cards figure rendered; double-click and "Edit data" open its table', async ({ page }) => {
  const errors = await load(page);
  const chart = fig(page, 1);
  const cards = fig(page, 2);
  await expect(chart.locator('svg')).toBeVisible();
  await expect(cards.locator('.pv-table-cards-grid')).toBeVisible();
  await chart.click();
  await cards.click();
  await page.waitForTimeout(150);
  await expect(chart).not.toHaveClass(/editing/);
  await expect(cards).not.toHaveClass(/editing/);
  await expect(chart.locator('svg')).toBeVisible();
  await expect(cards.locator('.pv-table-cards-grid')).toBeVisible();
  expect(await undoLen(page)).toBe(0);

  await chart.dblclick();
  await expect(chart).toHaveClass(/editing/);
  await expect(chart.locator('table')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chart.locator('svg')).toBeVisible();

  await cards.click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Edit data' }).click();
  await expect(cards).toHaveClass(/editing/);
  await expect(cards.locator('table')).toBeVisible();
  // The fuller cell menu works on chart data too.
  await menuAction(page, cards, 'NPS', 'Sort A → Z');
  expect((await grid(cards)).slice(1).map((r) => r[0])).toEqual(['Churn', 'NPS']);
  await page.keyboard.press('Escape');
  await expect(cards.locator('.pv-table-cards-grid')).toBeVisible();
  // Plain tables keep single-click-to-edit.
  await fig(page, 0).locator('td').first().click();
  await expect(fig(page, 0)).toHaveClass(/editing/);
  expect(errors).toEqual([]);
});
