import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// No bulk questions (owner, 2026-10-27): a paste into the reply line is one entry, and rows are
// never turned into thread questions.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function seed(page: Page, remarksJs = '[]') {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Flexible Night Delivery'), n(2, 0, 'Exclusion check')]; rebuildParentIds(); nextId = 3;
    remarks = ${remarksJs}; _threadAuthor = 'Robin';
    inlineExpandRemarksNodeIds = new Set([1]); showAllRemarksNodeIds = new Set([1]); collapsedIds = new Set(); editingId = null; undoStack = [];
    openThreadComposer(1, false); render();
  `);
  return errors;
}

const LIST = `Kristoffer
   Do we still show the option for excluded postal codes?
      It should be handled as a standard order`;

test('a pasted question list stays one entry (owner, 2026-10-27: list paste removed)', async ({ page }) => {
  const errors = await seed(page);
  const input = page.locator('.thread-composer-input');
  await input.click();
  // Plain text is left to the browser's own paste: nothing is split or added.
  const handled = await input.evaluate((elm, p) => {
    const dt = new DataTransfer(); dt.setData('text/plain', p);
    return !elm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, LIST);
  expect(handled).toBe(false);
  expect(await page.evaluate('nodeThread(1).length')).toBe(0);
  await page.keyboard.insertText(LIST);
  await input.press('Enter');
  const entries = await page.evaluate(`nodeThread(1).map(e => ({ q: e.type === 'question', text: stripHtmlToText(e.text) }))`);
  expect(entries).toHaveLength(1);
  expect(entries[0].q).toBe(false);
  expect(await page.evaluate("typeof addPastedQuestionList + typeof parseQuestionList")).toBe('undefinedundefined');
  expect(errors).toEqual([]);
});

test('a question menu has no Move to row… (owner, 2026-10-27: paste on the row it is about)', async ({ page }) => {
  await seed(page, `[{ id: 'q1', anchorNodeId: 1, person: 'Kim', date: '2026-10-20', text: 'Does tailored delivery win?', type: 'question', createdAt: 1 }]`);
  await page.locator('#inline-remark-text-q1').click({ button: 'right' });
  await expect(page.locator('.sb-context-menu')).toBeVisible();
  await expect(page.locator('.sb-context-menu').getByText('Move to row…')).toHaveCount(0);
});

test('rows are never turned into thread questions: the row menu has no Make thread questions (owner, 2026-10-27)', async ({ page }) => {
  await seed(page);
  expect(await page.evaluate("typeof makeThreadQuestionsFromBranch")).toBe('undefined');
  expect(await page.evaluate("CTX_ACTION_ORDER.includes('make-questions')")).toBe(false);
});
