import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// Rows are rich text (owner, 2026-10-22): bold, italic, underline, strikethrough, highlight and
// text colour on the selected words. The words stay plain in node.text; formatting lives in
// node.marks (src/utils/rowMarks.ts). Driven with real keys and clicks, like
// outliner-keyboard-baseline.spec.ts, whose seed/edit helpers these mirror.
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

test('Ctrl/Cmd+B on selected words bolds just those words; undo takes it off', async ({ page }) => {
  await seed(page, [{ text: 'Call the vendor today' }]);
  const id = await selectWord(page, 'Call the vendor today', 'vendor');
  await page.keyboard.press(`${mod}+b`);
  expect(await rows(page)).toEqual([{ text: 'Call the vendor today', marks: [{ s: 9, e: 15, k: 'b' }] }]);
  await expect(page.locator(`#in-${id} b`)).toHaveText('vendor');
  await page.keyboard.press('Escape');
  await expect(page.locator(`.node-row[data-id="${id}"] .node-label b`)).toHaveText('vendor');
  // really drawn bolder: the row font is variable, so <b> needs its own weight setting
  expect(await page.locator(`.node-row[data-id="${id}"] .node-label b`).evaluate((b) => getComputedStyle(b).fontVariationSettings)).toContain('700');
  // the whole-row style is untouched
  expect(await page.evaluate(() => (window as any).eval('!!nodes[0].styles.bold'))).toBe(false);
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => rows(page)).toEqual([{ text: 'Call the vendor today', marks: [] }]);
});

test('Ctrl/Cmd+B again on the same words removes the bold', async ({ page }) => {
  await seed(page, [{ text: 'Call the vendor today', marks: [{ s: 9, e: 15, k: 'b' }] }]);
  await selectWord(page, 'Call the vendor today', 'vendor');
  await page.keyboard.press(`${mod}+b`);
  expect((await rows(page))[0].marks).toEqual([]);
});

test('with nothing selected, Ctrl/Cmd+B still bolds the whole row', async ({ page }) => {
  await seed(page, [{ text: 'Whole row' }]);
  const id = await rowId(page, 'Whole row');
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  await page.keyboard.press(`${mod}+b`);
  expect(await page.evaluate(() => (window as any).eval('!!nodes[0].styles.bold'))).toBe(true);
  expect((await rows(page))[0].marks).toEqual([]);
});

test('italic and underline shortcuts work on a selection', async ({ page }) => {
  await seed(page, [{ text: 'one two three four' }]);
  await selectWord(page, 'one two three four', 'two');
  await page.keyboard.press(`${mod}+i`);
  await page.keyboard.press('Escape');
  await selectWord(page, 'one two three four', 'three');
  await page.keyboard.press(`${mod}+u`);
  await page.keyboard.press('Escape');
  expect((await rows(page))[0].marks).toEqual([
    { s: 4, e: 7, k: 'i' },
    { s: 8, e: 13, k: 'u' }
  ]);
});

test('the selection bar colours format the selected words only', async ({ page }) => {
  await seed(page, [{ text: 'Risk: budget overrun' }]);
  const id = await selectWord(page, 'Risk: budget overrun', 'budget');
  await page.locator('#selection-fmt-popover [data-cmd="colors"]').click();
  await page.locator('#sfmt-swatches [data-kind="hl"][data-sw="green"]').click();
  await expect(page.locator(`#in-${id}`)).toBeFocused();
  await page.locator('#selection-fmt-popover [data-cmd="colors"]').click();
  await page.locator('#sfmt-swatches [data-kind="c"][data-sw="red"]').click();
  expect((await rows(page))[0].marks).toEqual([
    { s: 6, e: 12, k: 'hl', v: 'green' },
    { s: 6, e: 12, k: 'c', v: 'red' }
  ]);
  await page.keyboard.press('Escape');
  const label = page.locator(`.node-row[data-id="${id}"] .node-label`);
  await expect(label.locator('mark[data-hl="green"]')).toHaveText('budget');
  await expect(label.locator('span[data-c="red"]')).toHaveText('budget');
  expect(await page.evaluate(() => (window as any).eval('[nodes[0].styles.highlight, nodes[0].styles.color]'))).toEqual([false, false]);
});

test('typing inside bold words stays bold; the text stays plain words', async ({ page }) => {
  await seed(page, [{ text: 'a bold word', marks: [{ s: 2, e: 6, k: 'b' }] }]);
  const id = await rowId(page, 'a bold word');
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.type('XX');
  await page.keyboard.press('Escape');
  expect(await rows(page)).toEqual([{ text: 'a boXXld word', marks: [{ s: 2, e: 8, k: 'b' }] }]);
});

test('Enter inside formatted words splits the formatting with the text; undo restores it', async ({ page }) => {
  const before = [{ text: 'Hello brave World', marks: [{ s: 6, e: 11, k: 'b' }, { s: 12, e: 17, k: 'i' }] }];
  await seed(page, before);
  const id = await rowId(page, 'Hello brave World');
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  const after = [
    { text: 'Hello br', marks: [{ s: 6, e: 8, k: 'b' }] },
    { text: 'ave World', marks: [{ s: 0, e: 3, k: 'b' }, { s: 4, e: 9, k: 'i' }] }
  ];
  await expect.poll(() => rows(page)).toEqual(after);
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => rows(page)).toEqual(before);
});

test('Backspace at the start merges rows and keeps both rows\' formatting', async ({ page }) => {
  await seed(page, [
    { text: 'Hello', marks: [{ s: 0, e: 5, k: 'b' }] },
    { text: ' World', marks: [{ s: 1, e: 6, k: 'c', v: 'red' }] }
  ]);
  const id = await rowId(page, ' World');
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect.poll(() => rows(page)).toEqual([
    { text: 'Hello World', marks: [{ s: 0, e: 5, k: 'b' }, { s: 6, e: 11, k: 'c', v: 'red' }] }
  ]);
});

test('Delete at the end pulls the next row up with its formatting', async ({ page }) => {
  await seed(page, [{ text: 'Hello' }, { text: ' World', marks: [{ s: 1, e: 6, k: 'u' }] }]);
  const id = await rowId(page, 'Hello');
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  await expect.poll(() => rows(page)).toEqual([{ text: 'Hello World', marks: [{ s: 6, e: 11, k: 'u' }] }]);
});

test('formatting follows the words when the text is changed elsewhere (find and replace)', async ({ page }) => {
  await seed(page, [{ text: 'fix the bug now', marks: [{ s: 8, e: 11, k: 'b' }] }]);
  await page.evaluate(() => (window as any).eval(`nodes[0].text = 'please fix the bug now'; render();`));
  expect((await rows(page))[0].marks).toEqual([{ s: 15, e: 18, k: 'b' }]);
  await expect(page.locator('.node-label b')).toHaveText('bug');
});

test('a [[link]] inside formatted words still renders as one link', async ({ page }) => {
  await seed(page, [{ text: 'Target' }, { text: 'see [[Target]] here', marks: [{ s: 0, e: 19, k: 'b' }] }]);
  const id = await rowId(page, 'see [[Target]] here');
  const label = page.locator(`.node-row[data-id="${id}"] .node-label`);
  await expect(label).toContainText('see Target here');
  await expect(label).not.toContainText('[[');
});

test('duplicate and save/reload keep formatting; rows without formatting store nothing extra', async ({ page }) => {
  await seed(page, [{ text: 'plain' }, { text: 'styled', marks: [{ s: 0, e: 6, k: 's' }] }]);
  const saved = await page.evaluate(() => (window as any).eval('JSON.parse(JSON.stringify(nodes)).map(normalizeNode)'));
  expect('marks' in saved[0]).toBe(false);
  expect(saved[1].marks).toEqual([{ s: 0, e: 6, k: 's' }]);
  const id = await rowId(page, 'styled');
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => (window as any).eval('duplicateSelected()'));
  expect((await rows(page)).map((r) => r.marks)).toEqual([[], [{ s: 0, e: 6, k: 's' }], [{ s: 0, e: 6, k: 's' }]]);
});

test('copying rows and pasting them back keeps formatting', async ({ page }) => {
  await seed(page, [{ text: 'Alpha' }, { text: 'Beta gamma', marks: [{ s: 5, e: 10, k: 'hl', v: 'yellow' }] }]);
  await page.evaluate(() =>
    (window as any).eval(`(() => {
      const payload = buildNodeClipboardPayload(nodes.slice(1));
      selectedId = nodes[0].id;
      pasteParsedNodes([{ text: 'Beta gamma', depth: 0 }], 'Pasted', payload.extras);
    })()`)
  );
  expect((await rows(page)).map((r) => r.marks)).toEqual([[], [{ s: 5, e: 10, k: 'hl', v: 'yellow' }], [{ s: 5, e: 10, k: 'hl', v: 'yellow' }]]);
});

test('the PDF preview prints the formatting', async ({ page }) => {
  await seed(page, [{ text: 'Ship it Friday', marks: [{ s: 8, e: 14, k: 'b' }] }]);
  const html = await page.evaluate(() => (window as any).eval('previewNodeInnerHtml(nodes[0])'));
  expect(html).toBe('Ship it <b>Friday</b>');
});

test('a saved document with formatting opens with it (marks read while the page starts up)', async ({ page }) => {
  await page.addInitScript(() => {
    const docId = 'rtdoc';
    localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
      nodes: [{ id: 1, depth: 0, text: 'Saved bold words', marks: [{ s: 6, e: 10, k: 'b' }], marksText: 'Saved bold words', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} }],
      nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'RT', author: ''
    }));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'RT', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', docId);
    localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined" && nodes.length > 0');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
  await expect.poll(() => rows(page)).toEqual([{ text: 'Saved bold words', marks: [{ s: 6, e: 10, k: 'b' }] }]);
  await expect(page.locator('.node-label b')).toHaveText('bold');
});

test('rich copy of rows keeps the formatting for other apps (fixed colours, no app styles)', async ({ page }) => {
  await seed(page, [{ text: 'Call vendor today', marks: [{ s: 5, e: 11, k: 'b' }, { s: 12, e: 17, k: 'c', v: 'green' }] }]);
  const html = await page.evaluate(() => (window as any).eval('serializeClipboardHtml(nodes)'));
  expect(html).toContain('Call <b>vendor</b> <span style="color:#27824f;">today</span>');
  expect(html).not.toContain('var(--');
});

// PR 4: the typed syntax goes. Documents saved before (no rowFormat) are converted once.
async function openSavedDoc(page: Page, docId: string, doc: Record<string, unknown>) {
  await page.addInitScript(({ docId, doc }) => {
    if (sessionStorage.getItem('seeded-' + docId)) return;
    sessionStorage.setItem('seeded-' + docId, '1');
    localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify(doc));
    localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Old', updatedAt: Date.now() }]));
    localStorage.setItem('sakura_current_doc_v1', docId);
    localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
  }, { docId, doc });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined" && nodes.length > 0');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
}
const row = (id: number, depth: number, text: string) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });

test('an old document converts once: **bold**/__italic__ to formatting, a [Label] row to the Section format, old text kept in history', async ({ page }) => {
  await openSavedDoc(page, 'legacydoc', {
    nodes: [row(1, 0, '[Release 2.4] Plan'), row(2, 1, 'Ship **today** or __never__'), row(3, 1, '[Intro]'), row(4, 1, 'plain [x] text')],
    nextId: 5, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Old', author: ''
  });
  await expect.poll(() => rows(page)).toEqual([
    { text: 'Release 2.4 · Plan', marks: [] },
    { text: 'Ship today or never', marks: [{ s: 5, e: 10, k: 'b' }, { s: 14, e: 19, k: 'i' }] },
    { text: 'Intro', marks: [] },
    { text: 'plain [x] text', marks: [] }
  ]);
  expect(await page.evaluate(() => (window as any).eval('nodes[2].styles.heading'))).toBe(7);
  await expect(page.locator('.node-row[data-id="3"]')).toHaveClass(/is-section/);
  await expect.poll(() => page.evaluate(() => (window as any).eval(`(async () => (await loadDocRevisions('legacydoc')).map(r => r.reason + ':' + r.nodes[1].text))()`))).toContain('Before rich text rows:Ship **today** or __never__');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_doc_v1_legacydoc') || '{}'));
  expect(stored.rowFormat).toBe(2);
  expect(stored.nodes[1].text).toBe('Ship today or never');
});

test('in a converted document, typed ** and [ ] stay plain text', async ({ page }) => {
  await openSavedDoc(page, 'newdoc', {
    rowFormat: 2,
    nodes: [row(1, 1, '2 **x** 3'), row(2, 1, '[Not a section]')],
    nextId: 3, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'New', author: ''
  });
  expect(await rows(page)).toEqual([{ text: '2 **x** 3', marks: [] }, { text: '[Not a section]', marks: [] }]);
  await expect(page.locator('.node-row[data-id="1"] .node-label')).toHaveText('2 **x** 3');
  await expect(page.locator('.node-row[data-id="2"]')).not.toHaveClass(/is-section/);
  // typing them while editing keeps them too
  await page.locator('.node-row[data-id="1"] .node-label').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' __y__');
  await page.keyboard.press('Escape');
  expect((await rows(page))[0]).toEqual({ text: '2 **x** 3 __y__', marks: [] });
});

test('Headings menu → Section makes a row a section', async ({ page }) => {
  await seed(page, [{ depth: 1, text: 'Scope' }]);
  const id = await rowId(page, 'Scope');
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  await page.keyboard.press('Escape');
  await page.locator('#heading-toggle-btn').click();
  await page.locator('#heading-palette .heading-option[data-level="7"]').click();
  await expect(page.locator(`.node-row[data-id="${id}"]`)).toHaveClass(/is-section/);
  const saved = await page.evaluate(() => (window as any).eval('JSON.parse(JSON.stringify(nodes)).map(normalizeNode)[0].styles.heading'));
  expect(saved).toBe(7);
});

test('pasted Markdown-style **bold** / __italic__ lines become formatting', async ({ page }) => {
  await seed(page, [{ text: 'Top' }]);
  await page.evaluate(() => (window as any).eval(`selectedId = nodes[0].id; pasteParsedNodes(parseTextToTreeNodes('**Goal** one\\n__note__ two'))`));
  expect((await rows(page)).slice(1)).toEqual([
    { text: 'Goal one', marks: [{ s: 0, e: 4, k: 'b' }] },
    { text: 'note two', marks: [{ s: 0, e: 4, k: 'i' }] }
  ]);
});
