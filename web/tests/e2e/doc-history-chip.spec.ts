import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// The document's version history is one click from its title: the History chip opens a small menu
// (recent versions to restore, Save a version now, All versions…) like the Link and Share chips, and the node menu no longer offers "Where used…" -- every linked item already
// shows as its own dot on the row.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const docId = 'historychipdoc';
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [{ id: 1, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} }],
        nextId: 2, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Plan', author: ''
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Plan', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  });
});

test('the History chip opens a small menu like Link and Share; "All versions…" opens the full window', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  const chip = page.locator('#editor-meta-row #doc-history-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute('aria-label', 'Version history');

  await chip.click();
  const menu = page.locator('.history-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.sb-context-item', { hasText: 'No earlier versions yet' })).toBeDisabled();
  await expect(page.locator('#history-modal-overlay')).not.toHaveClass(/open/);
  // A second click on the chip closes the menu.
  await chip.click();
  await expect(page.locator('.history-menu')).toHaveCount(0);

  // Save a version, then it is listed and restorable from the menu.
  await chip.click();
  await menu.locator('.sb-context-item', { hasText: 'Save a version now' }).click();
  await chip.click();
  await expect(menu.locator('.sb-context-heading')).toHaveText('Restore an earlier version');
  await expect(menu.locator('.sb-context-item', { hasText: /^Today .* · / })).toHaveCount(1);

  await menu.locator('.sb-context-item', { hasText: 'All versions…' }).click();
  await expect(page.locator('#history-modal-overlay')).toHaveClass(/open/);
  expect(errors).toEqual([]);
});

test('the byline separates facts from actions with a thin rule', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const rule = await page.evaluate(() => {
    const st = getComputedStyle(document.getElementById('doc-link-wrap')!, '::before');
    return { content: st.content, width: st.width, height: st.height };
  });
  expect(rule).toEqual({ content: '""', width: '1px', height: '14px' });
});

test('"Where used…" is gone from the node menu', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => ({
    // @ts-expect-error -- bare globals from index.html
    meta: 'where-used' in CTX_ACTION_META, order: CTX_ACTION_ORDER.includes('where-used'),
    popover: typeof (window as any).openWhereUsedPopover
  }));
  expect(r).toEqual({ meta: false, order: false, popover: 'undefined' });
});

test('byline dropdowns open from their chip\'s left edge (Share used to open leftwards over the title)', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => {
    document.getElementById('doc-share-wrap')!.style.display = '';
    document.getElementById('share-dd-menu')!.classList.add('open');
    return {
      chip: Math.round(document.getElementById('doc-share-chip')!.getBoundingClientRect().left),
      menu: Math.round(document.getElementById('share-dd-menu')!.getBoundingClientRect().left)
    };
  });
  expect(r.menu).toBe(r.chip);
});
