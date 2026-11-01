import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// On paper: the footer lines up with the text column, a note is a soft grey panel behind its
// text (no border, rule or "Note" label), and names in a table's Person column print as plain text.
test('PDF: footer inside the text column, plain notes, plain names in Person columns', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    const table = '<table><thead><tr><th>Wave</th><th>Owner</th></tr></thead><tbody><tr><td>Europe</td><td>Ana</td></tr><tr><td>Asia</td><td>Ben</td></tr><tr><td>Americas</td><td>Chen</td></tr></tbody></table>';
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: 'Scope', parentId: null, isCheckbox: false, checked: false, note: '<p>Only customer data.</p>', noteTitle: '', tables: [], tags: [], styles: {} },
      { id: 2, depth: 0, text: 'Waves', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tables: [table], tags: [], styles: {} },
      { id: 3, depth: 0, text: 'Risks', parentId: null, isCheckbox: false, checked: false, note: '<p>See the log.</p>', noteTitle: 'Background', tables: [], tags: [], styles: {} },
    ];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; editingId = null; nextId = 4;
    // @ts-expect-error
    render();
    // @ts-expect-error
    window.__printed = false; window.print = () => { window.__printed = true; };
    // @ts-expect-error
    exportPdfDirect();
  });
  await page.waitForFunction(() => (window as unknown as { __printed: boolean }).__printed, null, { timeout: 15000 });
  await page.emulateMedia({ media: 'print' });

  const css = await page.locator('#pv-print-override').evaluate(el => el.textContent || '');
  expect(css).toMatch(/@bottom-left\{[^}]*padding-left:40px/);
  expect(css).toMatch(/@bottom-right\{[^}]*padding-right:40px/);

  const out = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('#preview-body .pv-inline-label-note')] as HTMLElement[];
    const body = document.querySelector('#preview-body .pv-inline-note-body') as HTMLElement;
    const person = document.querySelector('#preview-body .tbl-person') as HTMLElement | null;
    const bs = getComputedStyle(body);
    return {
      labelsShown: labels.map(l => getComputedStyle(l).display !== 'none' ? (l.innerText || '').trim() : null),
      noteBg: bs.backgroundColor, noteBorderTop: bs.borderTopStyle, noteRule: bs.borderLeftWidth,
      person: person ? { bg: getComputedStyle(person).backgroundImage + '|' + getComputedStyle(person).backgroundColor, shadow: getComputedStyle(person).boxShadow } : null,
    };
  });
  // Untitled note: no label. Titled note: only the title.
  expect(out.labelsShown).toEqual([null, 'Background']);
  expect(out.noteBg).toBe('rgb(246, 245, 242)');
  expect(out.noteBorderTop).toBe('none');
  expect(out.noteRule).toBe('0px');
  expect(out.person).not.toBeNull();
  expect(out.person!.bg).toBe('none|rgba(0, 0, 0, 0)');
  expect(out.person!.shadow).toBe('none');
});

test('PDF: API body and response boxes use the same soft grey panel as notes', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sakura_welcome_seen', '1'));
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const l = document.getElementById('sakura-landing-overlay');
    if (l) l.style.display = 'none';
    const api = '<table data-table-display="api"><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>'
      + '<tr><td>Method</td><td>POST</td></tr><tr><td>URL</td><td>{{baseUrl}}/orders</td></tr>'
      + '<tr><td>Body</td><td>{"id":"4711"}</td></tr><tr><td>Status</td><td>201 Created</td></tr>'
      + '<tr><td>Response</td><td>{"status":"accepted"}</td></tr></tbody></table>';
    // @ts-expect-error -- bare globals from index.html
    nodes = [
      { id: 1, depth: 0, text: 'Scope', parentId: null, isCheckbox: false, checked: false, note: '<p>Only customer data.</p>', noteTitle: '', tables: [], tags: [], styles: {} },
      { id: 2, depth: 0, text: 'Create order', parentId: null, isCheckbox: false, checked: false, note: '', noteTitle: '', tables: [api], tags: [], styles: {} },
    ];
    // @ts-expect-error
    collapsedIds = new Set(); selectedId = null; editingId = null; nextId = 3;
    // @ts-expect-error
    render();
    // @ts-expect-error
    window.__printed = false; window.print = () => { window.__printed = true; };
    // @ts-expect-error
    exportPdfDirect();
  });
  await page.waitForFunction(() => (window as unknown as { __printed: boolean }).__printed, null, { timeout: 15000 });
  await page.emulateMedia({ media: 'print' });
  const out = await page.evaluate(() => ({
    note: getComputedStyle(document.querySelector('#preview-body .pv-inline-note-body')!).backgroundColor,
    code: [...document.querySelectorAll('#preview-body .pv-api-code')].map(c => getComputedStyle(c).backgroundColor),
  }));
  expect(out.code).toHaveLength(2);
  for (const bg of out.code) expect(bg).toBe(out.note);
});
