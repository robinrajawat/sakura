import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Per-entry follow-ups (owner decision 2026-10-21): each Follow-up entry in a thread is its own open
// item, like a question. Right-click → Mark follow-up done closes just that one; the row stays
// Follow-up while any is open. Open items, the toolbar count and F8 list each one.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function seed(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    const n = (id, depth, text, x) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {}, ...(x || {}) });
    nodes = [n(1, 0, 'Shipping condition', { marker: 'followup' })]; rebuildParentIds(); nextId = 2;
    remarks = [
      { id: 'f1', anchorNodeId: 1, person: 'Kristoffer', date: '2026-10-12', text: 'Can fixed-day customers book before 7 AM?', status: 'followup', createdAt: 1 },
      { id: 'c1', anchorNodeId: 1, person: 'Marlene', date: '2026-10-20', text: 'They order as they do today.', createdAt: 2 },
      { id: 'f2', anchorNodeId: 1, person: 'Robin', date: '2026-10-20', text: 'Check the extra freight price.', status: 'followup', owner: 'Ana', createdAt: 3 }
    ];
    inlineExpandRemarksNodeIds = new Set([1]); showAllRemarksNodeIds = new Set([1]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
  return errors;
}
const entry = (page: Page, id: string) => page.locator(`.thread-entry:has(#inline-remark-text-${id})`);
const marker = (page: Page) => page.evaluate('nodes[0].marker || ""');

test('two follow-ups in one thread are two open items, closed one at a time', async ({ page }) => {
  const errors = await seed(page);
  await expect(page.locator('#marker-summary .open-items-btn')).toContainText('2 follow-ups');
  await page.locator('#marker-summary .open-items-btn').click();
  await expect(page.locator('.sb-context-menu')).toContainText('Kristoffer: Can fixed-day customers');
  await expect(page.locator('.sb-context-menu')).toContainText('Shipping condition · Ana');
  await expect(page.locator('.sb-context-menu')).toContainText('Robin: Check the extra freight price.');
  await page.keyboard.press('Escape');

  await entry(page, 'f1').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Mark follow-up done').click();
  await expect(entry(page, 'f1').locator('.thread-status-note')).toHaveText('· follow-up, done');
  await expect(page.locator('#marker-summary .open-items-btn')).toContainText('1 follow-up');
  expect(await marker(page)).toBe('followup');

  await entry(page, 'f2').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Mark follow-up done').click();
  expect(await marker(page)).toBe('');
  await expect(page.locator('#marker-summary .open-items-btn')).toHaveCount(0);

  await entry(page, 'f1').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Reopen follow-up').click();
  expect(await marker(page)).toBe('followup');
  expect(await page.evaluate('remarks[0].done')).toBeUndefined();
  expect(errors).toEqual([]);
});

test('the agenda lists each follow-up; F8 steps to each; Agreed settles them all', async ({ page }) => {
  await seed(page);
  const text = await page.evaluate('openItemsAgendaContent().text') as string;
  expect(text).toContain('2 follow-ups');
  expect(text).toMatch(/1\. Shipping condition\n.*\n {3}Kristoffer: Can fixed-day/);
  expect(text).toMatch(/2\. Shipping condition\n.*Ana.*\n {3}Robin: Check the extra freight/);
  expect(await page.evaluate('openItemsInOutlineOrder().map(x => x.key)')).toEqual(['ff1', 'ff2']);
  // The reply line still offers Follow-up while one is open, to add another.
  await page.evaluate('openThreadComposer(1, false)');
  await expect(page.locator('.thread-composer .thread-btn[data-act="followup"]')).toBeVisible();
  // Agreed on the row settles every open follow-up.
  await page.evaluate('setNodeMarker(1, "confirmed"); render()');
  expect(await page.evaluate('openFollowups(nodeThread(1)).length')).toBe(0);
  expect(await marker(page)).toBe('confirmed');
});

test('clearing the Follow-up marker takes back every open follow-up', async ({ page }) => {
  await seed(page);
  await page.evaluate('setNodeMarker(1, "followup"); render()');
  expect(await marker(page)).toBe('');
  expect(await page.evaluate('remarks.filter(r => r.status).length')).toBe(0);
  expect(await page.evaluate('remarks.length')).toBe(3);
});
