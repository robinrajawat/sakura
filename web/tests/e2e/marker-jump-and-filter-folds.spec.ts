import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A row marker is its thread's status: clicking it opens the entry that set it, not a filter.
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

test('clicking a marker opens its thread at the entry that set it, and does not filter', async ({ page }) => {
  const errors = await seed(page);
  await page.locator('.node-row[data-id="2"] .node-marker-badge').click();
  await expect(page.locator('#inline-remark-text-f1')).toBeVisible();
  await expect(page.locator('#inline-remark-text-f1')).toBeFocused();
  expect(await page.evaluate('activeMarkerFilter')).toBe(null);
  // Shift+click still filters by that marker.
  await page.locator('.node-row[data-id="2"] .node-marker-badge').click({ modifiers: ['Shift'] });
  expect(await page.evaluate('activeMarkerFilter')).toBe('followup');
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
