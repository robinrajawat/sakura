import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

const n = (id: number, depth: number, text: string, parentId: number | null) => ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tags: [], styles: {} });

async function seed(page: import('@playwright/test').Page, list: ReturnType<typeof n>[]) {
  await page.evaluate((list) => {
    // @ts-expect-error -- bare globals from index.html
    nodes = list; collapsedIds = new Set(); selectedId = null; multiSelectedIds = []; selectAllMode = false; focusedId = null; undoStack = []; editingId = null;
    // @ts-expect-error
    nextId = list.length + 1; render();
  }, list);
}

async function open(page: import('@playwright/test').Page) {
  // Mark the welcome dialog as seen before load: it opens on a short delay, so hiding it right
  // after load raced with it and it could still pop up over later clicks.
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', 'true'); } catch { /* ignore */ } });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    const landing = document.getElementById('sakura-landing-overlay');
    if (landing) landing.style.display = 'none';
    document.getElementById('welcome-overlay')?.classList.remove('open');
  });
}

test.describe('Right-click sort row', () => {
  test('sort is one compact row, hidden when the node has no children', async ({ page }) => {
    await open(page);
    await seed(page, [n(1, 0, 'Parent', null), n(2, 1, 'b', 1), n(3, 1, 'a', 1), n(4, 0, 'Leaf', null)]);
    await page.locator('.node-row[data-id="1"]').click({ button: 'right' });
    await page.locator('#context-more-toggle').click();
    const row = page.locator('#context-sort-label');
    await expect(row).toBeVisible();
    await expect(row.locator('.context-sort-btn')).toHaveCount(3);
    const boxes = await row.locator('.context-sort-btn').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(boxes).size).toBe(1);
    await page.keyboard.press('Escape');
    await page.locator('.node-row[data-id="4"]').click({ button: 'right' });
    await expect(page.locator('#context-sort-label')).toBeHidden();
  });
});

test.describe('PDF status stamp', () => {
  test('stamps the status on the PDF header, and nothing without a status', async ({ page }) => {
    await open(page);
    await seed(page, [n(1, 0, 'Hello', null)]);
    await page.evaluate(() => {
      // @ts-expect-error
      setDocStatus('approved', false); renderPreviewBody();
    });
    const stamp = page.locator('#pv-doc-header .pv-status-stamp');
    await expect(stamp).toHaveCount(1);
    await expect(stamp).toHaveText('Approved');
    await expect(stamp).toHaveClass(/approved/);
    // @ts-expect-error
    await page.evaluate(() => { setDocStatus('', false); renderPreviewBody(); });
    await expect(page.locator('.pv-status-stamp')).toHaveCount(0);
  });
});

test.describe('Export menu width', () => {
  test('hugs its content instead of a 240px minimum', async ({ page }) => {
    await open(page);
    const minWidth = await page.locator('#export-menu').evaluate((e) => getComputedStyle(e).minWidth);
    expect(minWidth).toBe('0px');
  });
});

test.describe('Quick Assist docked in the app bar', () => {
  test('its dropdown stays inside the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page);
    // @ts-expect-error -- bare global from index.html
    await page.evaluate(() => setQaLocation('appbar', false));
    await page.locator('#qa-input').click();
    const dd = page.locator('#qa-dropdown');
    await expect(dd).toBeVisible();
    const box = await dd.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(1280);
  });
});

test.describe('Toolbar marker summary', () => {
  test('counts markers across folded branches and filters to them on click', async ({ page }) => {
    await open(page);
    await expect(page.locator('#ag-markers')).toBeHidden();
    const list = [n(1, 0, 'Parent', null), n(2, 1, 'Child A', 1), n(3, 1, 'Child B', 1), n(4, 0, 'Other', null)];
    await seed(page, list);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes[1].marker = 'followup'; nodes[2].marker = 'followup'; nodes[3].marker = 'issue';
      // @ts-expect-error
      collapsedIds = new Set([1]); render();
    });
    const btns = page.locator('#marker-summary .marker-sum-btn');
    await expect(btns).toHaveCount(2);
    await expect(btns.nth(0)).toHaveAttribute('data-marker', 'issue');
    await expect(btns.nth(1)).toHaveText('2');
    await expect(page.locator('.node-row[data-id="2"]')).toHaveCount(0);
    await btns.nth(1).click();
    await expect(page.locator('.node-row[data-id="2"]')).toBeVisible();
    await expect(page.locator('.node-row[data-id="3"]')).toBeVisible();
    await expect(page.locator('#marker-summary .marker-sum-btn.active')).toHaveAttribute('data-marker', 'followup');
    await page.locator('#marker-summary .marker-sum-btn.active').click();
    // @ts-expect-error
    expect(await page.evaluate(() => activeMarkerFilter)).toBeNull();
  });
});

test.describe('PDF markers, footer and stamp placement', () => {
  test('markers carry their name, the footer names the document and status, and the stamp is cover-only when a cover prints', async ({ page }) => {
    await open(page);
    await seed(page, [n(1, 0, 'Open questions', null), n(2, 1, 'Who owns the label layout?', 1)]);
    const res = await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes[1].marker = 'followup';
      (document.getElementById('header-title') as HTMLInputElement).value = 'Night Delivery';
      // @ts-expect-error
      setDocStatus('review', false);
      window.print = () => {};
      // @ts-expect-error
      exportPdfDirect();
      const badge = document.querySelector('#preview-overlay .pv-marker-badge');
      const css = document.getElementById('pv-print-override')?.textContent || '';
      return { badge: badge?.textContent || '', css };
    });
    expect(res.badge).toBe('Follow-up');
    expect(res.css).toContain('@bottom-left{ content:"Night Delivery · Review"');
    expect(res.css).toContain('counter(page)');
    // With a cover, the whole title block (title, meta, stamp) stays off the body pages.
    expect(res.css).toContain('has-cover-page #pv-doc-header{ display:none');
  });
});
