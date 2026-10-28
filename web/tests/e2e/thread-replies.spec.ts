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
  // Sending a reply closes its line; nothing jumps to the end of the thread (owner, 2026-10-27).
  await expect(page.locator('.thread-composer')).toHaveCount(0);
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

test('no line joins the entries (owner, 2026-10-27: cleaner)', async ({ page }) => {
  await seed(page, TWO_QS);
  const drawn = await page.evaluate(`[...document.querySelectorAll('.thread-entry')].some(l => ['::before', '::after'].some(p => getComputedStyle(l, p).content !== 'none' && getComputedStyle(l, p).width === '1px'))`);
  expect(drawn).toBe(false);
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

test('the day shows only where it changes; hovering an entry shows it again (owner, 2026-10-27)', async ({ page }) => {
  await seed(page, TWO_QS.replace("{ id: 'q2', anchorNodeId: 1, person: 'Maria', date: '2026-10-15'", "{ id: 'q2', anchorNodeId: 1, person: 'Maria', date: '2026-10-16'"));
  const time = (id: string) => entry(page, id).locator('.thread-time');
  await expect(time('q1')).not.toHaveClass(/is-same-day/);
  await expect(time('c1')).toHaveClass(/is-same-day/);
  await expect(time('c1')).toHaveCSS('opacity', '0');
  await expect(time('q2')).not.toHaveClass(/is-same-day/);
  await entry(page, 'c1').hover();
  await expect(time('c1')).toHaveCSS('opacity', '1');
});

test('the PDF indents replies under their entry, as the editor does, and shows each day once', async ({ page }) => {
  const d = Date.UTC(2026, 9, 15, 9);
  await seed(page, `[
    { id: 'q1', anchorNodeId: 1, person: 'Karsten', text: 'Does the EU file load before Saturday?', type: 'question', createdAt: ${d} },
    { id: 'a1', anchorNodeId: 1, person: 'Ana', text: 'Yes.', answerTo: 'q1', createdAt: ${d + 60000} },
    { id: 'c1', anchorNodeId: 1, person: 'Maria', text: 'Weekend works.', decision: true, createdAt: ${d + 86400000} }
  ]`);
  await page.evaluate('_applyNodeContentExportState(); previewActive = true; renderPreviewBody()');
  const rows = await page.evaluate(`[...document.querySelectorAll('#preview-body .pv-thread-body .pv-remark-entry')].map(e => ({ indent: getComputedStyle(e).marginLeft, meta: e.querySelector('.pv-remark-meta').textContent }))`) as { indent: string; meta: string }[];
  expect(rows.map((r) => r.indent)).toEqual(['0px', '20px', '0px']);
  // The day shows where it changes, with no times (as in the editor).
  expect(rows.map((r) => /2026/.test(r.meta))).toEqual([true, false, true]);
  expect(rows.some((r) => /\d:\d\d/.test(r.meta))).toBe(false);
  await expect(page.locator('#preview-body .pv-inline-label-remark span')).toHaveText('Thread · 3');
});

test('a folded long thread still shows every open question', async ({ page }) => {
  const d = Date.UTC(2026, 9, 15, 9);
  await seed(page, `[
    { id: 'old-q', anchorNodeId: 1, person: 'Kristoffer', text: 'OQ-3: ATP validation?', type: 'question', createdAt: ${d} },
    { id: 'c1', anchorNodeId: 1, person: 'Ana', text: 'one', createdAt: ${d + 1000} },
    { id: 'c2', anchorNodeId: 1, person: 'Ana', text: 'two', createdAt: ${d + 2000} },
    { id: 'c3', anchorNodeId: 1, person: 'Ana', text: 'three', createdAt: ${d + 3000} },
    { id: 'c4', anchorNodeId: 1, person: 'Ana', text: 'four', createdAt: ${d + 4000} },
    { id: 'c5', anchorNodeId: 1, person: 'Ana', text: 'five', createdAt: ${d + 5000} }
  ]`);
  await page.evaluate('showAllRemarksNodeIds = new Set(); render()');
  expect(await order(page)).toEqual(['old-q', 'c3', 'c4', 'c5']);
  await expect(page.locator('.thread-head-more')).toHaveText('· show 2 earlier');

  // Answering it keeps it (and its answer) on screen, so it doesn't vanish into the fold
  // (owner, 2026-10-28); hiding and reopening the thread folds it like any answered question.
  await entry(page, 'old-q').locator('.thread-reply-btn').click();
  await page.keyboard.type('Done in staging.');
  await page.keyboard.press('Enter');
  const a = await last(page);
  expect(await order(page)).toEqual(['old-q', '  ' + a.id, 'c3', 'c4', 'c5']);
  await page.locator('.thread-head').click();
  await page.evaluate('inlineExpandRemarksNodeIds.add(1); render()');
  expect(await order(page)).toEqual(['c3', 'c4', 'c5']);
});

test('Rewrite from the reply line\'s right-click puts the rewritten words back in the line', async ({ page }) => {
  const errors = await seed(page, TWO_QS);
  await page.evaluate(`featureAiEnabled = true; callAiApi = async (t) => 'Rewritten: ' + t; openThreadComposer(1, false)`);
  const input = page.locator('.thread-composer-input');
  await input.click();
  await page.keyboard.type('draft words');
  await page.evaluate(`showSbContextMenu = (x, y, items) => { window.__items = items; }`);
  await page.evaluate(`(() => { const el = document.querySelector('.thread-composer-input'); const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.right + 40, clientY: r.top + 4 })); })()`);
  await page.evaluate(`window.__items.find(i => i.label === 'Rewrite').onClick()`);
  await expect(page.locator('.thread-composer-input')).toHaveText('Rewritten: draft words');
  await expect(page.locator('.thread-composer-input')).toBeFocused();
  expect(errors).toEqual([]);
});
