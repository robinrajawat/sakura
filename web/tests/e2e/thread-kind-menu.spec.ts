import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// A thread entry's kind icon (owner, 2026-10-23): clicking it changes what the entry is -- Comment,
// Question, Answer or Decision -- one choice, undoable. A status is the row's, not an entry's (owner
// decision 2026-10-27). Icons are grey except an open question (accent).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');
const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

let errors: string[] = [];
async function seed(page: Page, remarksJs: string) {
  errors = [];
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
}
test.afterEach(() => { expect(errors).toEqual([]); });

const THREAD = `[
  { id: 'q1', anchorNodeId: 1, person: 'Karsten', date: '2026-10-15', text: 'Does the EU file load before Saturday?', type: 'question', createdAt: 1 },
  { id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'Friday evening run.', createdAt: 2 },
  { id: 'c2', anchorNodeId: 1, person: 'Maria', date: '2026-10-15', text: 'Ops to send the notice.', status: 'followup', createdAt: 3 },
  { id: 'c3', anchorNodeId: 1, person: 'Ana', date: '2026-10-15', text: 'Go with the weekend.', decision: true, createdAt: 4 }
]`;
const kind = (page: Page, id: string) => page.locator(`.thread-entry:has(#inline-remark-text-${id}) .thread-kind`);
const menu = (page: Page) => page.locator('.sb-context-menu');
const remark = (page: Page, id: string) => page.evaluate(`JSON.parse(JSON.stringify(remarks.find(r => r.id === '${id}')))`) as Promise<Record<string, unknown>>;

test('the menu lists the four kinds with the current one ticked', async ({ page }) => {
  await seed(page, THREAD);
  await kind(page, 'c3').click();
  const labels = await menu(page).locator('.sb-context-item .sb-context-label').evaluateAll((els) => els.map((e) => e.childNodes[0].textContent));
  expect(labels).toEqual(['Comment', 'Question', 'Answer', 'Decision']);
  await expect(menu(page).locator('.sb-context-item', { hasText: 'Decision' }).locator('.sb-context-meta')).toHaveText('✓');
});

test('Comment → Answer links to the question before it, then Yes; undo takes it back', async ({ page }) => {
  await seed(page, THREAD);
  await kind(page, 'c1').click();
  await menu(page).getByText('Answer', { exact: true }).click();
  expect((await remark(page, 'c1')).answerTo).toBe('q1');
  await kind(page, 'c1').click();
  await menu(page).getByText('Yes', { exact: true }).click();
  expect((await remark(page, 'c1')).verdict).toBe('yes');
  await page.evaluate('undo(); undo()');
  const c1 = await remark(page, 'c1');
  expect([c1.answerTo, c1.verdict]).toEqual([undefined, undefined]);
});

test('picking a kind replaces the old one: Comment → Decision, Question → Comment unlinks its answers', async ({ page }) => {
  await seed(page, THREAD.replace("text: 'Friday evening run.',", "text: 'Friday evening run.', answerTo: 'q1',"));
  await kind(page, 'c2').click();
  await menu(page).getByText('Decision', { exact: true }).click();
  const c2 = await remark(page, 'c2');
  expect([c2.status, c2.decision]).toEqual([undefined, true]);
  await kind(page, 'q1').click();
  await menu(page).getByText('Comment', { exact: true }).click();
  expect((await remark(page, 'q1')).type).toBeUndefined();
  expect((await remark(page, 'c1')).answerTo).toBeUndefined();
});

test('the first entry cannot be an answer (no question before it)', async ({ page }) => {
  await seed(page, THREAD);
  await kind(page, 'q1').click();
  await expect(menu(page).locator('.sb-context-item.disabled', { hasText: 'Answer' })).toContainText('No question before it');
});

test('icons are grey except an open question', async ({ page }) => {
  await seed(page, THREAD);
  const color = (id: string) => kind(page, id).evaluate((e) => (e as HTMLElement).style.color);
  expect(await color('q1')).toBe('var(--accent)');
  expect(await color('c1')).toBe('var(--hint)');
  expect(await color('c2')).toBe('var(--hint)');
  expect(await color('c3')).toBe('var(--hint)');
});
