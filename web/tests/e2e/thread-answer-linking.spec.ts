import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Linking answers to questions (owner design 2026-10-15): the thread stays in time order; an answer
// says which question it answers. Right-click a question → Answer opens the reply line linked to it;
// with two or more questions the reply line shows "to: …" and lets you pick; right-click an entry →
// Mark as the answer (one question) or Answer to › (several) links or moves it. A question can have
// several answers. The ↳ quote only shows with two or more questions in the thread.

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

test('right-click a question → Answer: the reply line answers that question, even with plain text', async ({ page }) => {
  const errors = await seed(page, TWO_QS);
  await entry(page, 'q1').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Answer', { exact: true }).click();
  const composer = page.locator('.thread-composer');
  await expect(composer.locator('.thread-btn[data-act="answer-to"]')).toContainText('to: Does the EU file');
  await composer.locator('.thread-composer-input').click();
  await page.keyboard.type('Friday evening run.');
  await page.keyboard.press('Enter');
  const a = await last(page);
  expect([a.answerTo, a.verdict, a.type]).toEqual(['q1', undefined, undefined]);
  // q1 is answered (grey), q2 still open; with two questions and entries in between, the answer quotes q1.
  await expect(entry(page, 'q1').locator('.thread-q-note')).toHaveText('· question, answered');
  await expect(page.locator(`.thread-entry:has(#inline-remark-text-${a.id}) .thread-quote`)).toHaveText(/^↳ Does the EU file load/);
  expect(errors).toEqual([]);
});

test('with two open questions the reply line shows "to: …"; Yes goes to the picked question', async ({ page }) => {
  await seed(page, TWO_QS);
  await page.evaluate('openThreadComposer(1, false)');
  const composer = page.locator('.thread-composer');
  const to = composer.locator('.thread-btn[data-act="answer-to"]');
  await expect(to).toContainText('to: Who tells the customers?');
  await to.click();
  await page.locator('.sb-context-menu .sb-context-item').filter({ hasText: 'Does the EU file' }).click();
  await expect(page.locator('.thread-composer .thread-btn[data-act="answer-to"]')).toContainText('to: Does the EU file');
  await page.locator('.thread-composer .thread-btn[data-act="yes"]').click();
  const a = await last(page);
  expect([a.answerTo, a.verdict]).toEqual(['q1', 'yes']);
});

test('one question: no picker and no quote; a second answer can link to an answered question', async ({ page }) => {
  await seed(page, `[
    { id: 'q1', anchorNodeId: 1, person: 'Karsten', date: '2026-10-15', text: 'Does the EU file load before Saturday?', type: 'question', createdAt: 1 },
    { id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'Weekend works for ops.', createdAt: 2 },
    { id: 'a1', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'Yes, Friday.', answerTo: 'q1', verdict: 'yes', createdAt: 3 },
    { id: 'c2', anchorNodeId: 1, person: 'Maria', date: '2026-10-15', text: 'Only if the file is on time.', createdAt: 4 }
  ]`);
  await expect(entry(page, 'a1').locator('.thread-quote')).toHaveCount(0);
  await page.evaluate('openThreadComposer(1, false)');
  await expect(page.locator('.thread-composer .thread-btn[data-act="answer-to"]')).toHaveCount(0);
  await entry(page, 'c2').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Mark as the answer', { exact: true }).click();
  expect(await page.evaluate("remarks.filter(r => r.answerTo === 'q1').map(r => r.id)")).toEqual(['a1', 'c2']);
});

test('Answer to › moves a wrong link to another question, and Not an answer removes it', async ({ page }) => {
  await seed(page, TWO_QS.replace(']', `, { id: 'a1', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'The account team.', answerTo: 'q1', createdAt: 4 }]`));
  await entry(page, 'a1').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Answer to', { exact: true }).hover();
  const sub = page.locator('.sb-context-submenu');
  await expect(sub.locator('.sb-context-item').first()).toContainText('Who tells the customers?');
  await sub.locator('.sb-context-item').filter({ hasText: 'Who tells the customers?' }).click();
  expect(await page.evaluate("remarks.find(r => r.id === 'a1').answerTo")).toBe('q2');
  await page.keyboard.press('ControlOrMeta+Z');
  expect(await page.evaluate("remarks.find(r => r.id === 'a1').answerTo")).toBe('q1');

  await entry(page, 'a1').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Answer to', { exact: true }).hover();
  await page.locator('.sb-context-submenu').getByText('Not an answer', { exact: true }).click();
  expect(await page.evaluate("remarks.find(r => r.id === 'a1').answerTo")).toBeUndefined();
});
