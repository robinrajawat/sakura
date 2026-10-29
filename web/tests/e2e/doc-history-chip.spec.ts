import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// The node menu no longer offers "Where used…": every linked item already shows as its own dot on the row.

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

// Share is the one button on the top line (owner 2026-10-29): Version history opens from the title's
// right-click, and the window has Save a version now.
test('no History button on the top line; the title\'s right-click opens Version history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await expect(page.locator('#doc-history-chip')).toBeHidden();
  await page.locator('#header-title').click({ button: 'right' });
  await page.locator('.sb-context-menu .sb-context-item', { hasText: 'Version history…' }).click();
  await expect(page.locator('#history-modal-overlay')).toHaveClass(/open/);
  await expect(page.locator('#history-save-now-btn')).toBeVisible();
  expect(errors).toEqual([]);
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

test('Share sits at the toolbar\'s right end, so its menu lines up with the chip\'s right edge', async ({ page }) => {
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(() => {
    document.getElementById('doc-share-wrap')!.style.display = '';
    document.getElementById('share-dd-menu')!.classList.add('open');
    return {
      chip: Math.round(document.getElementById('doc-share-chip')!.getBoundingClientRect().right),
      menu: Math.round(document.getElementById('share-dd-menu')!.getBoundingClientRect().right)
    };
  });
  expect(r.menu).toBe(r.chip);
});
