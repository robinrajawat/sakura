import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Replies (owner decision 2026-10-27): any entry takes replies, one level deep, as in Slack or Google
// Docs. Replies read indented under their entry, which keeps the thread in time order otherwise. A
// reply to a question is its answer and may say Yes / No; the bottom reply line has no "to:" picker,
// no Yes / No and no quotes.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function seed(page: Page, remarksJs: string) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Cutover')]; rebuildParentIds(); nextId = 2;
    remarks = ${remarksJs};
    inlineExpandRemarksNodeIds = new Set([1]); showAllRemarksNodeIds = new Set([1]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
  return errors;
}

const TWO_QS = `[
  { id: 'q1', anchorNodeId: 1, person: 'Karsten', date: '2026-10-15', text: 'Does the EU file load before Saturday?', type: 'question', createdAt: 1 },
  { id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'Weekend works for ops.', createdAt: 2 },
  { id: 'q2', anchorNodeId: 1, person: 'Maria', date: '2026-10-15', text: 'Who tells the customers?', type: 'question', createdAt: 3 }
]`;
const entry = (page: Page, id: string) => page.locator(`.thread-entry:has(#inline-remark-text-${id})`);
const last = (page: Page) => page.evaluate('JSON.parse(JSON.stringify(remarks[remarks.length - 1]))') as Promise<Record<string, unknown>>;

const order = (page: Page) => page.evaluate(`[...document.querySelectorAll('.thread-entry')].map(e => (e.classList.contains('is-nested') ? '  ' : '') + e.dataset.remarkId)`);

test('Reply on a question opens a line under it; the answer reads there, even with plain text', async ({ page }) => {
  const errors = await seed(page, TWO_QS);
  // The bottom line: no picker, no Yes / No.
  await page.evaluate('openThreadComposer(1, false)');
  await expect(page.locator('.thread-composer .thread-btn[data-act="answer-to"]')).toHaveCount(0);
  await expect(page.locator('.thread-composer .thread-btn[data-act="yes"]')).toHaveCount(0);
  await entry(page, 'q1').locator('.thread-reply-btn').click();
  const composer = page.locator('.thread-composer.is-nested');
  await expect(composer.locator('.thread-composer-input')).toHaveAttribute('data-placeholder', 'Reply…');
  await page.keyboard.type('Friday evening run.');
  await page.keyboard.press('Enter');
  const a = await last(page);
  expect([a.answerTo, a.type]).toEqual(['q1', undefined]);
  await expect(entry(page, 'q1').locator('.thread-kind.is-question')).toHaveAttribute('data-tip', /^Question, answered/);
  expect(await order(page)).toEqual(['q1', '  ' + a.id, 'c1', 'q2']);
  await expect(page.locator('.thread-quote')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a reply line has no kind buttons and no Yes / No: its words say it', async ({ page }) => {
  await seed(page, TWO_QS);
  await page.evaluate("openThreadComposer(1, false, 'q2')");
  await expect(page.locator('.thread-composer.is-nested .thread-btn')).toHaveCount(0);
  await expect(page.locator('.thread-composer.is-nested .thread-kind.is-reply')).toHaveCount(1);
  await page.keyboard.type('Yes, the account team.');
  await page.keyboard.press('Enter');
  const a = await last(page);
  expect([a.answerTo, a.text, a.verdict]).toEqual(['q2', 'Yes, the account team.', undefined]);
});

test('a comment takes replies too; a reply to a reply joins the same entry', async ({ page }) => {
  await seed(page, TWO_QS.replace(']', `, { id: 'r1', anchorNodeId: 1, person: 'Kim', date: '2026-10-16', text: 'SAP confirmed.', answerTo: 'c1', createdAt: 4 }]`));
  expect(await order(page)).toEqual(['q1', 'c1', '  r1', 'q2']);
  await entry(page, 'r1').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Reply', { exact: true }).click();
  const composer = page.locator('.thread-composer.is-nested');
  await expect(composer.locator('.thread-composer-input')).toHaveAttribute('data-placeholder', 'Reply…');
  await page.keyboard.type('Thanks.');
  await page.keyboard.press('Enter');
  const a = await last(page);
  expect(a.answerTo).toBe('c1');
  expect(await order(page)).toEqual(['q1', 'c1', '  r1', '  ' + a.id, 'q2']);
  // Every reply has the reply icon (owner, 2026-10-27); under a comment it reads "Reply".
  await expect(entry(page, 'r1').locator('.thread-kind.is-reply')).toHaveAttribute('data-tip', /^Reply/);
});

test('one unbroken line joins the top-level entries and stops at the last one, past any replies', async ({ page }) => {
  await seed(page, `[
    { id: 'q1', anchorNodeId: 1, person: 'Karsten', date: '2026-10-15', text: 'Does the EU file load before Saturday?', type: 'question', createdAt: 1 },
    { id: 'a1', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'Yes.', answerTo: 'q1', verdict: 'yes', createdAt: 2 },
    { id: 'c1', anchorNodeId: 1, person: 'Maria', date: '2026-10-15', text: 'Ops are fine.', createdAt: 3 },
    { id: 'r1', anchorNodeId: 1, person: 'Kim', date: '2026-10-15', text: 'Noted.', answerTo: 'c1', createdAt: 4 }
  ]`);
  const spine = () => page.evaluate(`[...document.querySelectorAll('.thread-entry,.thread-composer')].map(l => (l.dataset.remarkId || 'composer') + ':' + ['spine-up','spine-down','spine-through'].filter(c => l.classList.contains(c)).join(','))`);
  // No reply line open: the line ends at Maria's icon, not under Kim's reply.
  expect(await spine()).toEqual(['q1:spine-down', 'a1:spine-through', 'c1:spine-up', 'r1:']);
  await page.evaluate('openThreadComposer(1, false)');
  expect(await spine()).toEqual(['q1:spine-down', 'a1:spine-through', 'c1:spine-up,spine-down', 'r1:spine-through', 'composer:spine-up']);
});

test('Delete thread on the header removes every entry in one step; Undo brings them back', async ({ page }) => {
  const errors = await seed(page, TWO_QS);
  await page.locator('.thread-head').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Delete thread', { exact: true }).click();
  expect(await page.evaluate('remarks.length')).toBe(0);
  await expect(page.locator('.thread-entry')).toHaveCount(0);
  await expect(page.locator('#toast')).toContainText('Thread deleted (3 entries)');
  await page.evaluate('undo()');
  expect(await page.evaluate('remarks.length')).toBe(3);
  expect(errors).toEqual([]);
});
