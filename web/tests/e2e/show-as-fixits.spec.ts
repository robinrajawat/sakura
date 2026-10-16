import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Show as ›: a display that doesn't fit says why on a visible second line (disabled items get no
// hover, so a tooltip was never seen), and two fix-its open displays to tables that didn't fit as
// they stood: "Lanes by …" (a board grouped by a column whose values repeat) and "Use … as the date"
// (a timeline dated by a column other than the first). Both mark the column on its header cell.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const RELEASE = '<table><thead><tr><th>Release / Phase</th><th>Channel / System</th><th>Scope / Dependency</th></tr></thead><tbody>'
  + '<tr><td>Current Release</td><td>SAP</td><td>In scope</td></tr>'
  + '<tr><td>Current Release</td><td>Old Webshop</td><td>Subject to estimates</td></tr>'
  + '<tr><td>Current Release</td><td>Old Mobile App</td><td>Subject to estimates</td></tr>'
  + '<tr><td>Separate Release</td><td>New Webshop</td><td>To be considered separately</td></tr>'
  + '<tr><td>Separate Release</td><td>New Mobile App</td><td>To be considered separately</td></tr>'
  + '<tr><td>Phase 2</td><td>EDI</td><td>Planned for Phase 2</td></tr></tbody></table>';
const GOLIVE = '<table><thead><tr><th>System</th><th>Go-live</th><th>Note</th></tr></thead><tbody>'
  + '<tr><td>SAP</td><td>2026-11-02</td><td>Cutover weekend</td></tr>'
  + '<tr><td>Webshop</td><td>2026-09-14</td><td></td></tr>'
  + '<tr><td>EDI</td><td>TBD</td><td>Phase 2</td></tr></tbody></table>';

function seed(page: Page, table: string) {
  return page.addInitScript((t) => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const docId = 'fixdoc';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Channel scope', parentId: null, isCheckbox: false, checked: false, note: '', tables: [t], tags: [], styles: {} }],
        nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Fix-its', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Fix-its', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, table);
}

async function openShowAs(page: Page) {
  await page.locator('.node-table-line').click({ button: 'right', position: { x: 5, y: 5 } });
  await page.locator('.sb-context-menu').getByText('Show as', { exact: true }).hover();
  return page.locator('.sb-context-submenu');
}

// The submenu as [label, reason line] rows, in order (headings as '# Heading').
function menuRows(sub: import('@playwright/test').Locator) {
  return sub.evaluate((m) => [...m.querySelectorAll('.sb-context-heading, .sb-context-item')].map((el) => el.classList.contains('sb-context-heading')
    ? ['# ' + el.textContent, '']
    : [(el.querySelector('.sb-context-label')?.firstChild?.textContent || '').trim(), el.querySelector('.sb-context-sub')?.textContent || '']));
}

const storedTable = (page: Page) => page.evaluate('nodes[0].tables[0]') as Promise<string>;

test('disabled displays show their reason; Lanes by Release / Phase groups the table and undoes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1200, height: 800 });
  await seed(page, RELEASE);
  await page.goto('file://' + indexPath);
  const sub = await openShowAs(page);

  await expect(sub.locator('.sb-context-item').first()).toBeVisible();
  const rows = await menuRows(sub);
  const chart = rows.findIndex((r) => r[0] === '# Chart');
  // A run of items disabled for the same reason says it once: only the first chart shape.
  expect(rows.slice(chart + 1).map((r) => r[1])).toEqual(['Needs a column of numbers', ...rows.slice(chart + 2).map(() => '')]);
  expect(rows.slice(0, chart)).toEqual([
    ['# Layout', ''], ['Table', ''],
    ['Chips', 'Needs 2 columns; this has 3'], ['Inline', ''],
    ['Cards', 'Cards need numbers in the second column'],
    ['Progress bars', 'Needs a % or number column'],
    ['Status board', 'A status board needs a Status column'],
    // Only the repeating column is offered, with a preview of its lanes.
    ['Lanes by Release / Phase', '3 lanes: Current Release, Separate Release, Phase 2'],
    ['Pros & cons', 'Needs 2 columns; this has 3'],
    ['# Timeline', ''], ['Vertical', 'A timeline needs a date column'], ['Horizontal', '']
  ]);
  await expect(sub.locator('.sb-context-item', { hasText: 'Chips' }).first()).toBeDisabled();
  const lanesItem = sub.locator('.sb-context-item', { hasText: 'Lanes by Release / Phase' });
  await lanesItem.click();
  const lanes = await page.locator('.pv-board .pv-board-lane').evaluateAll((els) => els.map((l) => [
    l.querySelector('.pv-board-label')?.textContent,
    [...l.querySelectorAll('.pv-board-item')].map((i) => i.textContent).join('|'),
    [...l.querySelectorAll('.pv-board-note')].map((i) => i.textContent).join('|')
  ]));
  expect(lanes).toEqual([
    ['Current Release', 'SAP|Old Webshop|Old Mobile App', 'In scope|Subject to estimates|Subject to estimates'],
    ['Separate Release', 'New Webshop|New Mobile App', 'To be considered separately|To be considered separately'],
    ['Phase 2', 'EDI', 'Planned for Phase 2']
  ]);
  // Stored as a marker on the column's header cell, beside the board display.
  expect(await storedTable(page)).toMatch(/<th data-board-by="1">Release \/ Phase<\/th>/);
  expect(await storedTable(page)).toContain('data-table-display="board"');
  // Neutral lanes: they're groups, not statuses.
  await expect(page.locator('.pv-board-lane[data-group="lane"]')).toHaveCount(3);

  // The menu shows it as current; switching back to Table drops the marker.
  const sub2 = await openShowAs(page);
  await expect(sub2.locator('.sb-context-item', { hasText: 'Lanes by Release / Phase' }).locator('svg')).toHaveCount(1);
  await sub2.getByText('Table', { exact: true }).click();
  expect(await storedTable(page)).not.toContain('data-board-by');

  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => storedTable(page)).toContain('data-board-by');
  expect(errors).toEqual([]);
});

test('a date column that isn\'t first is offered as the timeline\'s date', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await seed(page, GOLIVE);
  await page.goto('file://' + indexPath);
  const sub = await openShowAs(page);
  await expect(sub.locator('.sb-context-item').first()).toBeVisible();
  const rows = await menuRows(sub);
  expect(rows.slice(rows.findIndex((r) => r[0] === '# Timeline'), rows.findIndex((r) => r[0] === '# Chart'))).toEqual([
    ['# Timeline', ''], ['Vertical', 'A timeline needs a date column'], ['Horizontal', ''],
    ['Use \u201cGo-live\u201d as the date', 'Vertical timeline, in date order']
  ]);
  await sub.getByText('Use “Go-live” as the date').click();

  const items = await page.locator('.pv-timeline .pv-tl-item').evaluateAll((els) => els.map((e) => [
    e.querySelector('.pv-tl-date')?.textContent, e.querySelector('.pv-tl-event')?.textContent?.replace('Next', ''), e.querySelector('.pv-tl-detail')?.textContent || ''
  ]));
  expect(items).toEqual([['2026-09-14', 'Webshop', ''], ['2026-11-02', 'SAP', 'Cutover weekend'], ['TBD', 'EDI', 'Phase 2']]);
  expect(await storedTable(page)).toMatch(/<th data-timeline-date="1">Go-live<\/th>/);

  // Horizontal now fits too, and keeps the date column.
  const sub2 = await openShowAs(page);
  await expect(sub2.getByText('Use “Go-live” as the date')).toHaveCount(0);
  await sub2.getByText('Horizontal', { exact: true }).click();
  await expect(page.locator('.pv-timeline.horizontal .pv-tl-date').first()).toHaveText('2026-09-14');
  expect(await storedTable(page)).toContain('data-timeline-date="1"');
});

test('numbers further right are offered as column 2, so Cards, Progress bars and charts use them', async ({ page }) => {
  const EFFORT = '<table><thead><tr><th>Task</th><th>Owner</th><th>Effort</th></tr></thead><tbody>'
    + '<tr><td>Build</td><td>Ana</td><td>5</td></tr><tr><td>Test</td><td>Sam</td><td>3</td></tr></tbody></table>';
  await page.setViewportSize({ width: 1200, height: 800 });
  await seed(page, EFFORT);
  await page.goto('file://' + indexPath);
  const sub = await openShowAs(page);
  await expect(sub.locator('.sb-context-item').first()).toBeVisible();
  const rows = await menuRows(sub);
  const at = rows.findIndex((r) => r[0] === 'Progress bars');
  expect(rows[at + 1]).toEqual(['Move “Effort” to column 2', 'So Cards, Progress bars and charts use its numbers']);
  await sub.getByText('Move “Effort” to column 2').click();
  expect(await storedTable(page)).toMatch(/<th>Task<\/th><th>Effort<\/th><th>Owner<\/th>/);
  const sub2 = await openShowAs(page);
  await expect(sub2.getByText('Move “Effort” to column 2')).toHaveCount(0);
  await expect(sub2.locator('.sb-context-item', { hasText: 'Cards' }).first()).toBeEnabled();
});
