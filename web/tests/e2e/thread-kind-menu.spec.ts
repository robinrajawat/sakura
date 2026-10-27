import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// A thread entry's kind icon (owner, 2026-10-23, 2026-10-27): clicking it changes the kind and
// nothing else; right-click has the rest. A status is the row's, not an entry's (owner
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

test('the icon changes only the kind; right-click is Reply, Copy, Rewrite, Delete (owner, 2026-10-27)', async ({ page }) => {
  await seed(page, THREAD);
  const labels = async () => menu(page).locator('.sb-context-item .sb-context-label').evaluateAll((els) => els.map((e) => e.childNodes[0].textContent));
  await kind(page, 'c3').click();
  expect(await labels()).toEqual(['Comment', 'Question', 'Decision']);
  await page.keyboard.press('Escape');
  await page.locator('#inline-remark-text-c3').click({ button: 'right' });
  const right = await labels();
  expect(right[0]).toBe('Reply');
  for (const gone of ['Comment', 'Question', 'Decision', 'Reply to', 'Not a reply']) expect(right).not.toContain(gone);
});

test('a reply\'s icon offers Reply or Decision, and its tip says Reply (not Answer)', async ({ page }) => {
  await seed(page, THREAD.replace("text: 'Friday evening run.',", "text: 'Friday evening run.', answerTo: 'q1',"));
  await expect(kind(page, 'c1')).toHaveClass(/is-reply/);
  await expect(kind(page, 'c1')).toHaveAttribute('data-tip', /^Reply/);
  await kind(page, 'c1').click();
  await menu(page).getByText('Decision', { exact: true }).click();
  expect(await remark(page, 'c1')).toMatchObject({ answerTo: 'q1', decision: true });
  await page.evaluate('undo()');
  expect((await remark(page, 'c1')).decision).toBeUndefined();
});

test('Decision is a mark that keeps the entry\'s place; a question made a comment keeps its replies', async ({ page }) => {
  await seed(page, THREAD.replace("text: 'Friday evening run.',", "text: 'Friday evening run.', answerTo: 'q1',"));
  await kind(page, 'c2').click();
  await menu(page).getByText('Decision', { exact: true }).click();
  const c2 = await remark(page, 'c2');
  expect([c2.status, c2.decision]).toEqual([undefined, true]);
  await kind(page, 'q1').click();
  await menu(page).getByText('Comment', { exact: true }).click();
  expect((await remark(page, 'q1')).type).toBeUndefined();
  expect((await remark(page, 'c1')).answerTo).toBe('q1');
});

test('icons are grey except an open question', async ({ page }) => {
  await seed(page, THREAD);
  const color = (id: string) => kind(page, id).evaluate((e) => (e as HTMLElement).style.color);
  expect(await color('q1')).toBe('var(--accent)');
  expect(await color('c1')).toBe('var(--hint)');
  expect(await color('c2')).toBe('var(--hint)');
  expect(await color('c3')).toBe('var(--hint)');
});
