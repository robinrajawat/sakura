import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Links in a thread entry (owner, 2026-10-19: "if I add a link in the thread, it doesn't work, no
// way to navigate or edit"): a plain click opens it while the entry isn't being edited,
// Ctrl/Cmd+click while it is; right-click edits or removes it; a pasted bare URL becomes a link.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function seed(page: Page) {
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Cutover')]; rebuildParentIds(); nextId = 2;
    remarks = [{ id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-19', text: 'See <a href="https://example.com/a" target="_blank" rel="noopener noreferrer">the plan</a> first', createdAt: 1 }];
    inlineExpandRemarksNodeIds = new Set([1]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
}
const stored = (page: Page) => page.evaluate("remarks.find(r => r.id === 'c1').text") as Promise<string>;

test('a link in an entry opens on click, and with Ctrl/Cmd+click while editing', async ({ page, context }) => {
  await seed(page);
  let opened = 0;
  context.on('page', (p) => { opened++; p.close().catch(() => {}); });
  const link = page.locator('#inline-remark-text-c1 a');
  await link.click();
  await expect.poll(() => opened).toBe(1);
  // Now editing: a plain click places the caret, Ctrl/Cmd+click opens.
  await page.locator('#inline-remark-text-c1').click({ position: { x: 2, y: 5 } });
  await link.click();
  await page.waitForTimeout(300);
  expect(opened).toBe(1);
  await link.click({ modifiers: ['ControlOrMeta'] });
  await expect.poll(() => opened).toBe(2);
});

test('right-click a link in an entry: edit it, undo, remove it', async ({ page }) => {
  await seed(page);
  const link = page.locator('#inline-remark-text-c1 a');
  await link.click({ button: 'right' });
  const menu = page.locator('.sb-context-menu');
  await expect(menu).toContainText('Open link');
  await expect(menu).toContainText('Add to thread');
  await menu.getByText('Edit link…').click();
  // The same Link box as the selection bar, over the link.
  await expect(page.locator('#selection-fmt-popover')).toHaveAttribute('data-pick', 'url');
  await expect(page.locator('#sfmt-link-text')).toHaveValue('the plan');
  await expect(page.locator('#sfmt-url')).toBeFocused();
  await page.locator('#sfmt-url').fill('https://example.com/b');
  await page.keyboard.press('Enter');
  await expect.poll(() => stored(page)).toContain('href="https://example.com/b"');
  await page.keyboard.press('ControlOrMeta+Z');
  await expect.poll(() => stored(page)).toContain('href="https://example.com/a"');
  await page.locator('#inline-remark-text-c1 a').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Remove link').click();
  await expect.poll(() => stored(page)).toBe('See the plan first');
});

test('a bare web address pasted into the reply line becomes a link', async ({ page }) => {
  await seed(page);
  await page.evaluate('openThreadComposer(1, false)');
  await page.evaluate(async () => { await navigator.clipboard.writeText('https://example.com/c'); });
  await page.locator('.thread-composer .thread-composer-input').click();
  await page.keyboard.press('ControlOrMeta+V');
  await page.keyboard.press('Enter');
  const last = await page.evaluate('remarks[remarks.length - 1].text');
  expect(last).toContain('<a href="https://example.com/c"');
  await expect(page.locator('.node-remark-text-inline a', { hasText: 'https://example.com/c' })).toHaveCount(1);
});
