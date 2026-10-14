import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Line breaks and spaces at either end of a table cell are invisible but used to be stored: a
// Shift+Enter at the end of a cell left a blank line that grew the row and that Backspace couldn't
// remove (owner report: the "Integrations" cell), and trailing spaces shifted right-aligned values.
// They're trimmed from what's stored; a line break inside the text stays.

const T = '<table><tr><th>Area</th><th>Effort</th></tr><tr><td>UX/UI</td><td>3 days</td></tr><tr><td>Integrations</td><td>0 days</td></tr></table>';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page, table = T) {
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`nodes = [{ id: 1, depth: 0, text: 'Effort', parentId: null, isCheckbox: false, checked: false, note: '', tables: [${JSON.stringify(table)}], images: [], tags: [], styles: {} }]; rebuildParentIds(); nextId = 2; render();`);
}
const integrationsCell = (page: Page) => page.evaluate(`(() => { const d = document.createElement('div'); d.innerHTML = nodes[0].tables[0]; return d.querySelectorAll('td')[2].innerHTML; })()`);
const rowHeights = (page: Page) => page.evaluate(`[...document.querySelectorAll('.node-table-line tr')].map(r => Math.round(r.getBoundingClientRect().height))`);

async function editCell(page: Page, keys: (p: Page) => Promise<void>) {
  await page.locator('.node-table-line td').nth(2).click();
  await keys(page);
  await page.keyboard.press('Escape');
}

test('Shift+Enter at the end of a cell leaves no blank line behind', async ({ page }) => {
  await seed(page);
  await editCell(page, async p => { await p.keyboard.press('End'); await p.keyboard.press('Shift+Enter'); });
  expect(await integrationsCell(page)).toBe('Integrations');
  const [, uxRow, intRow] = await rowHeights(page);
  expect(intRow).toBe(uxRow);
});

test('Shift+Enter then Backspace leaves no hidden line break', async ({ page }) => {
  await seed(page);
  await editCell(page, async p => { await p.keyboard.press('End'); await p.keyboard.press('Shift+Enter'); await p.keyboard.press('Backspace'); });
  expect(await integrationsCell(page)).toBe('Integrations');
});

test('spaces typed or pasted at either end are not stored', async ({ page }) => {
  await seed(page);
  await editCell(page, async p => { await p.keyboard.press('Home'); await p.keyboard.type('  '); await p.keyboard.press('End'); await p.keyboard.type('   '); });
  expect(await integrationsCell(page)).toBe('Integrations');
  await editCell(page, async p => {
    await p.keyboard.press('Control+a');
    await p.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'Integrations\n'); document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
  });
  expect(await integrationsCell(page)).toBe('Integrations');
});

test('an emptied cell is stored empty, and a line break inside the text stays', async ({ page }) => {
  await seed(page);
  await editCell(page, async p => { await p.keyboard.press('End'); for (let i = 0; i < 14; i++) await p.keyboard.press('Backspace'); });
  expect(await integrationsCell(page)).toBe('');
  await editCell(page, async p => { await p.keyboard.type('API'); await p.keyboard.press('Shift+Enter'); await p.keyboard.type('EDI'); });
  expect(await integrationsCell(page)).toBe('API<br>EDI');
});

test('a table saved with hidden line breaks and spaces is cleaned when the document opens', async ({ page }) => {
  await seed(page);
  const cleaned = await page.evaluate(`normalizeNode({ id: 5, text: 'x', depth: 0, tables: [${JSON.stringify(T.replace('<td>Integrations</td>', '<td>Integrations<br><br></td>').replace('<td>3 days</td>', '<td>&nbsp;3 days&nbsp; </td>'))}] }).tables[0]`);
  expect(cleaned).toContain('<td>Integrations</td>');
  expect(cleaned).toContain('<td>3 days</td>');
  // An untouched table comes back as the very same string.
  expect(await page.evaluate(`tidyTableHtml(${JSON.stringify(T)}) === ${JSON.stringify(T)}`)).toBe(true);
});
