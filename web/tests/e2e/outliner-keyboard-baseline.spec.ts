import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// The outliner's keyboard behaviour, driven with real keys, pinned before rows move to rich text
// (owner, 2026-10-22: "make sure that we are not putting the outliner at risk"). Each test types and
// presses keys the way a person does and checks the resulting rows (text + depth), then undo/redo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => { document.getElementById('sakura-landing-overlay')?.remove(); document.getElementById('welcome-overlay')?.remove(); });
});
test.afterEach(() => { expect(errors).toEqual([]); });

async function seed(page: Page, rows: [number, string][]) {
  await page.evaluate((rows) => {
    const w = window as any;
    w.eval(`nodes = ${JSON.stringify(rows.map(([depth, text], i) => ({ id: i + 1, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {} })))}.map(normalizeNode);
      rebuildParentIds(); nextId = ${rows.length + 1}; collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false;
      focusedId = null; editingId = null; undoStack = []; redoStack = []; render();`);
  }, rows);
}
const outline = (page: Page) => page.evaluate(() => (window as any).eval('nodes.map(n => n.depth + ":" + n.text)')) as Promise<string[]>;
// Clicks into a row's text and puts the caret right after `after` (or at the end).
async function editAt(page: Page, rowText: string, after?: string) {
  const id = await page.evaluate((t) => (window as any).eval(`nodes.find(n => n.text === ${JSON.stringify(t)}).id`), rowText);
  await page.locator(`.node-row[data-id="${id}"] .node-label`).click();
  const input = page.locator(`#in-${id}`);
  await expect(input).toBeFocused();
  await page.keyboard.press('End');
  if (after !== undefined) {
    const back = rowText.length - (rowText.indexOf(after) + after.length);
    for (let i = 0; i < back; i++) await page.keyboard.press('ArrowLeft');
  }
}
async function undoRedoRoundTrip(page: Page, before: string[], after: string[]) {
  await page.keyboard.press('Escape');
  await page.keyboard.press(`${mod}+z`);
  await expect.poll(() => outline(page)).toEqual(before);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect.poll(() => outline(page)).toEqual(after);
}

test('typing into a row and Enter at the end adds an empty row below', async ({ page }) => {
  await seed(page, [[0, 'Alpha']]);
  await editAt(page, 'Alpha');
  await page.keyboard.type(' one');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Beta');
  await page.keyboard.press('Escape');
  expect(await outline(page)).toEqual(['0:Alpha one', '0:Beta']);
});

test('Enter in the middle splits the row at the caret', async ({ page }) => {
  await seed(page, [[0, 'Hello World'], [0, 'Next']]);
  await editAt(page, 'Hello World', 'Hello');
  await page.keyboard.press('Enter');
  const after = ['0:Hello', '0: World', '0:Next'];
  await expect.poll(() => outline(page)).toEqual(after);
  await undoRedoRoundTrip(page, ['0:Hello World', '0:Next'], after);
});

test('Backspace at the start merges the row into the one above', async ({ page }) => {
  await seed(page, [[0, 'Hello'], [0, ' World']]);
  await editAt(page, ' World', '');
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  const after = ['0:Hello World'];
  await expect.poll(() => outline(page)).toEqual(after);
  await undoRedoRoundTrip(page, ['0:Hello', '0: World'], after);
});

test('Delete at the end pulls the next row up into this one', async ({ page }) => {
  await seed(page, [[0, 'Hello'], [0, ' World']]);
  await editAt(page, 'Hello');
  await page.keyboard.press('Delete');
  const after = ['0:Hello World'];
  await expect.poll(() => outline(page)).toEqual(after);
  await undoRedoRoundTrip(page, ['0:Hello', '0: World'], after);
});

test('Tab indents and Shift+Tab outdents while editing, children move along', async ({ page }) => {
  await seed(page, [[0, 'Parent'], [0, 'Child'], [1, 'Grandchild']]);
  await editAt(page, 'Child');
  await page.keyboard.press('Tab');
  await expect.poll(() => outline(page)).toEqual(['0:Parent', '1:Child', '2:Grandchild']);
  await expect(page.locator('.node-input')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => outline(page)).toEqual(['0:Parent', '0:Child', '1:Grandchild']);
  await page.keyboard.press('Tab');
  await undoRedoRoundTrip(page, ['0:Parent', '0:Child', '1:Grandchild'], ['0:Parent', '1:Child', '2:Grandchild']);
});

test('Alt+Arrow moves a row with its children past its siblings', async ({ page }) => {
  await seed(page, [[0, 'One'], [0, 'Two'], [1, 'Two child'], [0, 'Three']]);
  await editAt(page, 'Two');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+ArrowUp');
  const up = ['0:Two', '1:Two child', '0:One', '0:Three'];
  await expect.poll(() => outline(page)).toEqual(up);
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => outline(page)).toEqual(['0:One', '0:Three', '0:Two', '1:Two child']);
});

test('pasting several lines at the end of a row makes one row per line, after it', async ({ page }) => {
  await seed(page, [[0, 'List:']]);
  await editAt(page, 'List:');
  await page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'First\nSecond\nThird');
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('Escape');
  await expect.poll(() => outline(page)).toEqual(['0:List:', '0:First', '0:Second', '0:Third']);
});

test('typed formatting markup survives split and merge unchanged', async ({ page }) => {
  await seed(page, [[0, 'Keep **bold** here and __this__ too']]);
  await editAt(page, 'Keep **bold** here and __this__ too', 'here');
  await page.keyboard.press('Enter');
  await expect.poll(() => outline(page)).toEqual(['0:Keep **bold** here', '0: and __this__ too']);
  await page.keyboard.press('Home');
  await page.keyboard.press('Backspace');
  await expect.poll(() => outline(page)).toEqual(['0:Keep **bold** here and __this__ too']);
});
