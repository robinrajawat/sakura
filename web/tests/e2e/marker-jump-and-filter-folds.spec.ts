import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A row's status badge opens its menu (with Show thread), not a filter.
// Turning a filter on and off leaves the outline folded as it was.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`
    const n = (id, depth, text, extra) => Object.assign({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }, extra || {});
    nodes = [n(1, 0, 'Rollout'), n(2, 1, 'Cutover', { marker: 'followup', tags: ['ops'] }), n(3, 0, 'Scope'), n(4, 1, 'Reports', { marker: 'followup' }), n(5, 0, 'Notes')];
    rebuildParentIds(); nextId = 6;
    remarks = [
      { id: 'c1', anchorNodeId: 2, person: 'Ana', date: '2026-10-14', text: 'Weekend works for ops.', createdAt: 1 },
      { id: 'f1', anchorNodeId: 2, person: 'Karsten', date: '2026-10-15', text: 'Check the backup window.', status: 'followup', createdAt: 2 },
      { id: 'c2', anchorNodeId: 2, person: 'Ana', date: '2026-10-15', text: 'Will ask IT.', createdAt: 3 }
    ];
    qaItems = [];
    inlineExpandRemarksNodeIds = new Set(); collapsedIds = new Set([3]); editingId = null; undoStack = []; render();
  `);
  return errors;
}

test('clicking a status badge opens its menu (no Show thread, no Shift+click filter: owner, 2026-10-27)', async ({ page }) => {
  const errors = await seed(page);
  await page.locator('.node-row[data-id="2"] .node-marker-badge').click();
  await expect(page.locator('.sb-context-menu .sb-context-choice')).toHaveCount(3);
  await expect(page.locator('.sb-context-menu').getByText('Show thread', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('.node-row[data-id="2"] .node-marker-badge').click({ modifiers: ['Shift'] });
  expect(await page.evaluate('activeMarkerFilter')).toBe(null);
  expect(errors).toEqual([]);
});

test('filters fold back what they opened when cleared; folds changed meanwhile are kept', async ({ page }) => {
  const errors = await seed(page);
  const folded = () => page.evaluate('[...collapsedIds].sort()');
  // Marker filter: "Scope" unfolds to show "Reports", and folds again when cleared.
  await page.evaluate("applyOpenItemsFilter('followup')");
  await expect(page.locator('.node-row[data-id="4"]')).toBeVisible();
  expect(await folded()).toEqual([]);
  await page.evaluate("applyOpenItemsFilter('followup')");
  expect(await folded()).toEqual([3]);
  // Open items filter: same, and threads it opened close again.
  await page.evaluate("applyOpenItemsFilter('openItems')");
  expect(await folded()).toEqual([]);
  await page.evaluate("applyOpenItemsFilter('openItems')");
  expect(await folded()).toEqual([3]);
  // Tag filter unfolds too; folding "Rollout" by hand while filtering stays folded after.
  await page.evaluate("collapsedIds = new Set([1, 3]); render(); setTagFilter('ops')");
  await expect(page.locator('.node-row[data-id="2"]')).toBeVisible();
  await page.evaluate("collapsedIds.add(5); setTagFilter(null)");
  expect(await folded()).toEqual([1, 3, 5]);
  expect(errors).toEqual([]);
});

test('opening another document clears the filter and folds back what it opened', async ({ page }) => {
  const errors = await seed(page);
  await page.evaluate("currentDocId = 'docA'; applyOpenItemsFilter('followup')");
  expect(await page.evaluate('[...collapsedIds]')).toEqual([]);
  await page.evaluate("clearFiltersForDocChange()");
  expect(await page.evaluate('[activeMarkerFilter, activeTagFilter, activeDiscussionFilter]')).toEqual([null, null, null]);
  expect(await page.evaluate('[...collapsedIds]')).toEqual([3]);
  // The real path: switching documents goes through the same reset.
  await page.evaluate("setTagFilter('ops'); createDoc()");
  expect(await page.evaluate('activeTagFilter')).toBe(null);
  expect(errors).toEqual([]);
});

test('Open items shows how long each item has been open; a folded branch shows its follow-ups', async ({ page }) => {
  const errors = await seed(page);
  await page.evaluate("nodes.find(n => n.id === 2).markerAt = Date.now() - 3 * 86400000; render()");
  await page.locator('.open-items-btn').click();
  await expect(page.locator('.sb-context-item', { hasText: 'Cutover' }).locator('.sb-context-meta')).toHaveText('3d');
  await page.keyboard.press('Escape');
  // "Scope" is folded with a follow-up inside: its count turns accent-coloured and its tooltip counts it.
  await expect(page.locator('.node-row[data-id="3"] .fold-badge')).toHaveClass(/fold-badge-open/);
  await expect(page.locator('.node-row[data-id="3"] .fold-badge')).toHaveAttribute('data-tip', /1 follow-up/);
  expect(errors).toEqual([]);
});
