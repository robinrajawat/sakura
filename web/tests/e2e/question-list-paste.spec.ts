import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A batch of colleague questions (owner, 2026-10-27): pasted into a reply line as
// name > question > indented answer, each question becomes its own entry; a question can then be
// moved, with its answers, to the row it is about.

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

async function paste(page: Page, plain: string, html = '') {
  const input = page.locator('.thread-composer-input');
  await input.click();
  await input.evaluate((elm, [p, h]) => {
    const dt = new DataTransfer(); dt.setData('text/plain', p); if (h) dt.setData('text/html', h);
    elm.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [plain, html]);
}

const LIST = `Open Questions
   Kristoffer
      Do we still show the Flexible Night Delivery option for excluded postal codes?
         It should be handled as a standard order
      Should the webshop do a final ATP validation before sending an order to SAP?
   Chandana
      Will the crane operation be completed before the regular work day starts?
         No, tailored delivery takes precedence.
Chandana
   Will the crane operation be completed before the regular work day starts?
      No, tailored delivery takes precedence.`;

test('a pasted question list becomes questions by their askers, with answers linked and the rest open', async ({ page }) => {
  const errors = await seed(page);
  await paste(page, LIST);
  const entries = await page.evaluate(`nodeThread(1).map(e => ({ who: e.person, text: stripHtmlToText(e.text), q: e.type === 'question', to: e.answerTo ? stripHtmlToText(remarks.find(x => x.id === e.answerTo).text) : '' }))`);
  expect(entries).toEqual([
    { who: 'Kristoffer', text: 'Do we still show the Flexible Night Delivery option for excluded postal codes?', q: true, to: '' },
    { who: 'Robin', text: 'It should be handled as a standard order', q: false, to: 'Do we still show the Flexible Night Delivery option for excluded postal codes?' },
    { who: 'Kristoffer', text: 'Should the webshop do a final ATP validation before sending an order to SAP?', q: true, to: '' },
    { who: 'Chandana', text: 'Will the crane operation be completed before the regular work day starts?', q: true, to: '' },
    { who: 'Robin', text: 'No, tailored delivery takes precedence.', q: false, to: 'Will the crane operation be completed before the regular work day starts?' }
  ]);
  await expect(page.locator('#toast')).toContainText('Added 3 questions from Kristoffer, Chandana (2 answered) · 1 already there, left out');
  // Nothing went into the reply line itself, and one Undo takes the whole batch back.
  await expect(page.locator('.thread-composer-input')).toHaveText('');
  await page.locator('#toast button').click();
  expect(await page.evaluate('remarks.length')).toBe(0);
  expect(errors).toEqual([]);
});

test('a nested list copied from a web page or Word is read the same way', async ({ page }) => {
  await seed(page);
  await paste(page, 'Kim\nWhy?\nBecause\nWhen?', '<p>Kim</p><ul><li>Why?<ul><li>Because</li></ul></li><li>When?</li></ul>');
  expect(await page.evaluate(`nodeThread(1).map(e => [e.person, stripHtmlToText(e.text), !!e.answerTo])`)).toEqual([
    ['Kim', 'Why?', false], ['Robin', 'Because', true], ['Kim', 'When?', false]
  ]);
});

test('ordinary text and lists already in the thread paste as before', async ({ page }) => {
  await seed(page, `[{ id: 'q1', anchorNodeId: 1, person: 'Kim', date: '2026-10-20', text: 'Why?', type: 'question', createdAt: 1 }, { id: 'q2', anchorNodeId: 1, person: 'Kim', date: '2026-10-20', text: 'When?', type: 'question', createdAt: 2 }]`);
  await paste(page, 'Kim\n  Why?\n  When?');
  await expect(page.locator('#toast')).toContainText('Those questions are already in this thread');
  expect(await page.evaluate('remarks.length')).toBe(2);
  await paste(page, 'We met today.\nEveryone agreed.\nFollow up next week.');
  expect(await page.evaluate('remarks.length')).toBe(2);
});

test('Move to row… moves a question and its answers to the row picked by typing', async ({ page }) => {
  const errors = await seed(page, `[
    { id: 'q1', anchorNodeId: 1, person: 'Kim', date: '2026-10-20', text: 'Does tailored delivery win?', type: 'question', createdAt: 1 },
    { id: 'a1', anchorNodeId: 1, person: 'Robin', date: '2026-10-20', text: 'Yes, always.', answerTo: 'q1', createdAt: 2 },
    { id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-20', text: 'Unrelated note.', createdAt: 3 }
  ]`);
  await page.locator('#inline-remark-text-q1').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Move to row…').click();
  await page.locator('.row-picker .folder-picker-search').fill('exclu');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(`remarks.map(r => [r.id, r.anchorNodeId])`)).toEqual([['q1', 2], ['a1', 2], ['c1', 1]]);
  await expect(page.locator('#toast')).toContainText('Moved to “Exclusion check”');
  // One undo step puts both back.
  await page.evaluate('undo()');
  expect(await page.evaluate(`remarks.map(r => r.anchorNodeId)`)).toEqual([1, 1, 1]);
  expect(errors).toEqual([]);
});

async function seedBranch(page: Page, extra = '') {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    const n = (id, depth, text, x) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {}, ...(x || {}) });
    nodes = [n(1, 0, 'Open questions'), n(2, 1, 'Kristoffer'), n(3, 2, 'Do we show the option for excluded postal codes?'), n(4, 3, 'No, handle it as a standard order'),
      n(5, 2, 'Should the webshop do a final ATP validation?'), n(6, 1, 'Chandana'), n(7, 2, 'Are all products eligible?'), n(8, 0, 'Next topic')];
    ${extra}
    rebuildParentIds(); nextId = 9; remarks = []; _threadAuthor = 'Robin';
    collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
  return errors;
}

test('Make thread questions turns the rows under a row into its thread questions', async ({ page }) => {
  const errors = await seedBranch(page);
  await page.locator('.node-row[data-id="1"] .node-label').click({ button: 'right' });
  await page.locator('#context-more-toggle').click();
  await page.locator('#context-menu [data-flyout="insert"]').hover();
  await page.locator('.sb-context-menu').getByText('Make thread questions').click();
  expect(await page.evaluate('nodes.map(n => n.text)')).toEqual(['Open questions', 'Next topic']);
  expect(await page.evaluate(`nodeThread(1).map(e => [e.person, stripHtmlToText(e.text), e.type === 'question', !!e.answerTo])`)).toEqual([
    ['Kristoffer', 'Do we show the option for excluded postal codes?', true, false],
    ['Robin', 'No, handle it as a standard order', false, true],
    ['Kristoffer', 'Should the webshop do a final ATP validation?', true, false],
    ['Chandana', 'Are all products eligible?', true, false]
  ]);
  await expect(page.locator('#toast')).toContainText('Added 3 questions from Kristoffer, Chandana (1 answered)');
  await page.locator('#toast button').click();
  expect(await page.evaluate('nodes.length')).toBe(8);
  expect(await page.evaluate('remarks.length')).toBe(0);
  expect(errors).toEqual([]);
});

test('Make thread questions leaves rows that hold a note alone, and is not offered on a leaf', async ({ page }) => {
  await seedBranch(page, `nodes[3].note = 'Details';`);
  await page.evaluate('makeThreadQuestionsFromBranch(1)');
  await expect(page.locator('#toast')).toContainText('Rows under it hold 1 note');
  expect(await page.evaluate('nodes.length')).toBe(8);
  await page.evaluate('contextMenuNodeId = 8');
  expect(await page.evaluate(`ctxActionAllowed('make-questions')`)).toBe(false);
});
