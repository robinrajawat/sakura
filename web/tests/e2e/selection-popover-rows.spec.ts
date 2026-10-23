import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// The selection popover (owner, 2026-10-22: one popover everywhere): selecting words in a row
// shows the same floating bar as notes and thread entries, with the row's own formats, colour
// palettes swapped in place, and Link as an address box in the bar (rows link to rows with @). Helpers mirror
// row-rich-text.spec.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
});
test.afterEach(() => { expect(errors).toEqual([]); });

type Row = { depth?: number; text: string; marks?: unknown[] };
async function seed(page: Page, rows: Row[]) {
  await page.evaluate((rows) => {
    const w = window as any;
    w.eval(`nodes = ${JSON.stringify(rows.map((r, i) => ({ id: i + 1, depth: r.depth || 0, text: r.text, marks: r.marks, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} })))}.map(normalizeNode);
      rebuildParentIds(); nextId = ${rows.length + 1}; collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false;
      focusedId = null; editingId = null; undoStack = []; redoStack = []; render();`);
  }, rows);
}
const rows = (page: Page) =>
  page.evaluate(() => (window as any).eval('nodes.map(n => ({ text: n.text, marks: rowMarksOf(n) }))')) as Promise<{ text: string; marks: unknown[] }[]>;
async function rowId(page: Page, text: string) {
  return page.evaluate((t) => (window as any).eval(`nodes.find(n => n.text === ${JSON.stringify(t)}).id`), text);
}
// Clicks into a row and selects `word` (the first occurrence) with Shift+arrows.
async function selectWord(page: Page, rowText: string, word: string) {
  const id = await rowId(page, rowText);
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  await expect(page.locator(`#in-${id}`)).toBeFocused();
  await page.keyboard.press('Home');
  const at = rowText.indexOf(word);
  for (let i = 0; i < at; i++) await page.keyboard.press('ArrowRight');
  for (let i = 0; i < word.length; i++) await page.keyboard.press('Shift+ArrowRight');
  return id;
}


const pop = (page: Page) => page.locator('#selection-fmt-popover');
const popBtn = (page: Page, cmd: string) => page.locator(`#selection-fmt-popover [data-cmd="${cmd}"]`);

test('selecting words in a row shows the popover with the row formats; B and U format just those words', async ({ page }) => {
  await seed(page, [{ text: 'Call the vendor today' }]);
  const id = await selectWord(page, 'Call the vendor today', 'vendor');
  await expect(pop(page)).toHaveClass(/open/);
  await expect(pop(page)).toHaveAttribute('data-mode', 'row');
  await expect(popBtn(page, 'colors')).toBeVisible();
  await expect(popBtn(page, 'link')).toBeVisible();
  await popBtn(page, 'bold').click();
  await popBtn(page, 'underline').click();
  expect((await rows(page))[0].marks).toEqual([
    { s: 9, e: 15, k: 'b' },
    { s: 9, e: 15, k: 'u' }
  ]);
  // still editing, words still selected, button shows the format is on
  await expect(page.locator(`#in-${id}`)).toBeFocused();
  await expect(popBtn(page, 'bold')).toHaveClass(/active/);
  await popBtn(page, 'bold').click();
  expect((await rows(page))[0].marks).toEqual([{ s: 9, e: 15, k: 'u' }]);
});

test('A swaps the bar for one palette in place: text colours over highlights; a swatch applies and goes back', async ({ page }) => {
  await seed(page, [{ text: 'Call the vendor today' }]);
  await selectWord(page, 'Call the vendor today', 'vendor');
  await popBtn(page, 'colors').click();
  await expect(pop(page)).toHaveAttribute('data-pick', 'colors');
  await page.locator('#sfmt-swatches [data-kind="hl"][data-sw="green"]').click();
  expect((await rows(page))[0].marks).toEqual([{ s: 9, e: 15, k: 'hl', v: 'green' }]);
  await expect(pop(page)).not.toHaveAttribute('data-pick', /./);
  await popBtn(page, 'colors').click();
  await page.locator('#sfmt-swatches [data-kind="c"][data-sw="red"]').click();
  expect((await rows(page))[0].marks).toEqual([
    { s: 9, e: 15, k: 'hl', v: 'green' },
    { s: 9, e: 15, k: 'c', v: 'red' }
  ]);
  // the A previews the words' colour and highlight
  expect(await pop(page).evaluate((p) => (p as HTMLElement).style.getPropertyValue('--sfmt-a-fg'))).toBe('var(--fc-red)');
  await popBtn(page, 'colors').click();
  await page.locator('#sfmt-swatches [data-kind="hl"][data-sw="none"]').click();
  expect((await rows(page))[0].marks).toEqual([{ s: 9, e: 15, k: 'c', v: 'red' }]);
});

test('dragging over the words of a row that is not being edited starts editing with them selected, and the bar shows on release', async ({ page }) => {
  await seed(page, [{ text: 'Call the vendor today' }]);
  const id = await rowId(page, 'Call the vendor today');
  const box = await page.locator(`.node-row[data-id="${id}"] .node-label`).evaluate((lbl) => {
    const t = lbl.firstChild as Text; const r = document.createRange();
    r.setStart(t, 9); r.setEnd(t, 10); const a = r.getBoundingClientRect();
    r.setStart(t, 14); r.setEnd(t, 15); const b = r.getBoundingClientRect();
    return { x1: a.left + 1, x2: b.right - 1, y: (a.top + a.bottom) / 2 };
  });
  await page.mouse.move(box.x1, box.y);
  await page.mouse.down();
  await page.mouse.move((box.x1 + box.x2) / 2, box.y, { steps: 4 });
  await expect(pop(page)).not.toHaveClass(/open/); // not while dragging
  await page.mouse.move(box.x2, box.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(`#in-${id}`)).toBeFocused();
  await expect(pop(page)).toHaveClass(/open/);
  await popBtn(page, 'bold').click();
  expect((await rows(page))[0].marks).toEqual([{ s: 9, e: 15, k: 'b' }]);
});

test('a whole-row style becomes word formatting when part of it is changed from the bar', async ({ page }) => {
  await seed(page, [{ text: 'Call the vendor today' }]);
  await page.evaluate(() => (window as any).eval(`nodes[0].styles.bold = true; nodes[0].styles.highlight = 'yellow'; render();`));
  await selectWord(page, 'Call the vendor today', 'vendor');
  await popBtn(page, 'bold').click();
  expect(await page.evaluate(() => (window as any).eval('[!!nodes[0].styles.bold, nodes[0].styles.highlight]'))).toEqual([false, 'yellow']);
  expect((await rows(page))[0].marks).toEqual([
    { s: 0, e: 9, k: 'b' },
    { s: 15, e: 21, k: 'b' }
  ]);
});

test('Link opens an address box in the bar that turns the selected words into a web link; Remove link takes it off', async ({ page, context }) => {
  await seed(page, [{ text: 'Read the docs first' }]);
  const id = await selectWord(page, 'Read the docs first', 'docs');
  await popBtn(page, 'link').click();
  await expect(pop(page)).toHaveAttribute('data-pick', 'url');
  await expect(page.locator('#sfmt-url')).toBeFocused();
  await page.keyboard.type('example.com/guide');
  await page.keyboard.press('Enter');
  await expect(pop(page)).not.toHaveClass(/open/);
  await expect.poll(() => rows(page)).toEqual([{ text: 'Read the docs first', marks: [{ s: 9, e: 13, k: 'a', v: 'https://example.com/guide' }] }]);
  const link = page.locator(`.node-row[data-id="${id}"] .node-label a.row-weblink`);
  await expect(link).toHaveText('docs');
  await expect(link).toHaveAttribute('href', 'https://example.com/guide');
  // clicking the link opens it rather than starting an edit
  await context.route('https://example.com/**', (r) => r.fulfill({ body: 'ok' }));
  const [popup] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await popup.close();
  expect(await page.evaluate(() => (window as any).eval('editingId'))).toBe(null);
  // undo removes it; redo brings it back
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(async () => (await rows(page))[0].marks).toEqual([]);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect.poll(async () => (await rows(page))[0].marks.length).toBe(1);
  await selectWord(page, 'Read the docs first', 'docs');
  await popBtn(page, 'link').click();
  await expect(page.locator('#sfmt-url')).toHaveValue('https://example.com/guide');
  await page.locator('#sfmt-swatches [data-sw="unlink"]').click();
  await expect.poll(async () => (await rows(page))[0].marks).toEqual([]);
});

test('Escape in the address box closes it without linking', async ({ page }) => {
  await seed(page, [{ text: 'Read the docs first' }]);
  await selectWord(page, 'Read the docs first', 'docs');
  await popBtn(page, 'link').click();
  await page.keyboard.type('example.com');
  await page.keyboard.press('Escape');
  await expect(pop(page)).not.toHaveClass(/open/);
  expect(await rows(page)).toEqual([{ text: 'Read the docs first', marks: [] }]);
});

test('a script address is refused', async ({ page }) => {
  await seed(page, [{ text: 'Read the docs first' }]);
  await selectWord(page, 'Read the docs first', 'docs');
  await popBtn(page, 'link').click();
  await page.keyboard.type('javascript:alert(1)');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await rows(page))[0].marks).toEqual([]);
});

test('a web link survives rich copy and the PDF preview', async ({ page }) => {
  await seed(page, [{ text: 'Read the docs first', marks: [{ s: 9, e: 13, k: 'a', v: 'https://example.com' }] }]);
  const html = await page.evaluate(() => (window as any).eval('serializeClipboardHtml([nodes[0]])'));
  expect(html).toContain('<a href="https://example.com">docs</a>');
  const pdf = await page.evaluate(() => (window as any).eval('previewNodeInnerHtml(nodes[0], nodes[0].text)'));
  expect(pdf).toContain('href="https://example.com"');
});

test('Rewrite on selected words keeps the formatting around and on them', async ({ page }) => {
  await seed(page, [{ text: 'Call the vendor today', marks: [{ s: 0, e: 4, k: 'b' }, { s: 9, e: 15, k: 'i' }] }]);
  await page.evaluate(() => (window as any).eval('callAiApi = async () => "supplier"'));
  await selectWord(page, 'Call the vendor today', 'vendor');
  await page.evaluate(() => (window as any).eval('rewriteSubTextSelection()'));
  await expect.poll(() => rows(page)).toEqual([
    { text: 'Call the supplier today', marks: [{ s: 0, e: 4, k: 'b' }, { s: 9, e: 17, k: 'i' }] }
  ]);
});

test('notes get the same bar; their palette has highlights only', async ({ page }) => {
  await seed(page, [{ text: 'Row' }]);
  await page.evaluate(() => (window as any).eval(`nodes[0].note = 'Some note words'; selectedId = 1; openInlineNoteAndFocus(1);`));
  const line = page.locator('.node-note-line[data-node-id="1"]');
  await expect(line).toBeFocused();
  await page.keyboard.press('End');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
  await expect(pop(page)).toHaveClass(/open/);
  await expect(pop(page)).toHaveAttribute('data-mode', 'rich');
  await popBtn(page, 'underline').click();
  await expect(line.locator('u')).toHaveText('words');
  await popBtn(page, 'colors').click();
  await expect(page.locator('#sfmt-swatches [data-kind="c"]')).toHaveCount(0);
  await expect(page.locator('#sfmt-swatches [data-kind="hl"]')).toHaveCount(5);
});

test('a web address pasted over selected words in a note links them', async ({ page }) => {
  await seed(page, [{ text: 'Row' }]);
  await page.evaluate(() => (window as any).eval(`nodes[0].note = 'See the guide'; selectedId = 1; openInlineNoteAndFocus(1);`));
  const line = page.locator('.node-note-line[data-node-id="1"]');
  await expect(line).toBeFocused();
  await page.keyboard.press('End');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'www.example.com/guide');
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(line.locator('a')).toHaveText('guide');
  await expect(line.locator('a')).toHaveAttribute('href', 'https://www.example.com/guide');
  await expect.poll(() => page.evaluate(() => (window as any).eval('nodes[0].note'))).toContain('href="https://www.example.com/guide"');
});

test('Clear formatting removes every format on the selected words but keeps links', async ({ page }) => {
  await seed(page, [{ text: 'Read the docs first', marks: [
    { s: 0, e: 13, k: 'b' }, { s: 5, e: 13, k: 'hl', v: 'yellow' }, { s: 9, e: 13, k: 'a', v: 'https://example.com' }, { s: 9, e: 13, k: 'c', v: 'red' }
  ] }]);
  await selectWord(page, 'Read the docs first', 'the docs');
  await popBtn(page, 'clear').click();
  expect((await rows(page))[0].marks).toEqual([
    { s: 0, e: 5, k: 'b' },
    { s: 9, e: 13, k: 'a', v: 'https://example.com' }
  ]);
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(async () => (await rows(page))[0].marks.length).toBe(4);
});

test('Clear formatting in a note removes bold and highlight', async ({ page }) => {
  await seed(page, [{ text: 'Row' }]);
  await page.evaluate(() => (window as any).eval(`nodes[0].note = 'Some <b>note</b> <span style="background-color: rgba(234, 179, 8, 0.35);">words</span>'; selectedId = 1; openInlineNoteAndFocus(1);`));
  const line = page.locator('.node-note-line[data-node-id="1"]');
  await expect(line).toBeFocused();
  await page.keyboard.press('End');
  for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowLeft');
  await popBtn(page, 'clear').click();
  await expect(line.locator('b')).toHaveCount(0);
  await expect.poll(() => line.evaluate((l) => l.innerHTML)).not.toContain('background');
});

// Owner, 2026-10-23: faint dividers group the bar, and the same bar formats whole rows when rows
// (not words) are selected, instead of formatting buttons back in the toolbar.
test('the bar is grouped by three faint dividers', async ({ page }) => {
  await seed(page, [{ text: 'Call the vendor today' }]);
  await selectWord(page, 'Call the vendor today', 'vendor');
  const pop = page.locator('#selection-fmt-popover');
  await expect(pop).toHaveClass(/open/);
  await expect(pop.locator('.sfmt-sep:visible')).toHaveCount(3);
});

test('selecting whole rows shows the same bar; it formats every word of them, without Link', async ({ page }) => {
  await seed(page, [{ text: 'Alpha one' }, { text: 'Beta two' }, { text: 'Gamma' }]);
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('Escape');
  await page.locator('.node-row[data-id="2"] .node-label').click({ modifiers: ['Shift'] });
  await expect.poll(() => page.evaluate(() => (window as any).eval('multiSelectedIds.length'))).toBe(2);
  const pop = page.locator('#selection-fmt-popover');
  await expect(pop).toHaveClass(/open/);
  await expect(pop).toHaveAttribute('data-mode', 'rows');
  await expect(pop.locator('#sfmt-link')).toBeHidden();
  await pop.locator('[data-cmd="bold"]').click();
  expect((await rows(page)).map((r) => r.marks)).toEqual([[{ s: 0, e: 9, k: 'b' }], [{ s: 0, e: 8, k: 'b' }], []]);
  await expect(pop.locator('[data-cmd="bold"]')).toHaveClass(/active/);
  await pop.locator('[data-cmd="colors"]').click();
  await pop.locator('[data-kind="hl"][data-sw="yellow"]').click();
  expect((await rows(page))[1].marks).toEqual([{ s: 0, e: 8, k: 'b' }, { s: 0, e: 8, k: 'hl', v: 'yellow' }]);
  await pop.locator('[data-cmd="clear"]').click();
  expect((await rows(page)).map((r) => r.marks)).toEqual([[], [], []]);
  await page.keyboard.press(`${mod}+z`);
  expect((await rows(page))[0].marks).toEqual([{ s: 0, e: 9, k: 'b' }, { s: 0, e: 9, k: 'hl', v: 'yellow' }]);
});
