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
    await expect(row.locator('[data-action^="sort-"]')).toHaveCount(3);
    const boxes = await row.locator('[data-action^="sort-"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
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

test.describe('Import & Export menu', () => {
  // Owner, 2026-10-23 (one menu everywhere): Export ▾ is the shared menu, opened under its button.
  test('Import & Export is the shared menu, right-aligned under its button, and a second click closes it', async ({ page }) => {
    await open(page);
    const btn = page.locator('#appbar-more-toggle');
    await btn.click();
    const menu = page.locator('#appbar-more-menu');
    await expect(menu).toHaveClass(/sb-context-menu/);
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    const b = (await btn.boundingBox())!, m = (await menu.boundingBox())!;
    expect(Math.abs(m.x + m.width - (b.x + b.width))).toBeLessThan(2);
    expect(m.y).toBeGreaterThan(b.y + b.height - 1);
    await btn.click();
    await expect(menu).toHaveCount(0);
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
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

test.describe('Toolbar open-items summary', () => {
  test('names what needs attention, lists it (folded branches included), jumps and filters from the list', async ({ page }) => {
    await open(page);
    await expect(page.locator('#ag-markers')).toBeHidden();
    const list = [n(1, 0, 'Parent', null), n(2, 1, 'Child A', 1), n(3, 1, 'Child B', 1), n(4, 0, 'Other', null), n(5, 0, 'Done row', null)];
    await seed(page, list);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes[1].marker = 'followup'; nodes[2].marker = 'followup'; nodes[3].marker = 'followup'; nodes[4].marker = 'confirmed';
      // @ts-expect-error
      collapsedIds = new Set([1]); render();
    });
    const btn = page.locator('#marker-summary .open-items-btn');
    await expect(btn).toHaveText('3 follow-ups');
    await expect(btn).toHaveAttribute('aria-label', 'Needs attention: 3 follow-ups.');
    await expect(page.locator('.node-row[data-id="2"]')).toHaveCount(0);

    await btn.click();
    const menu = page.locator('.open-items-menu');
    expect(await menu.locator('.sb-context-heading').allTextContents()).toEqual(['Follow-ups · 3']);
    // Jump: opens the folded branch and selects the row.
    await menu.locator('.sb-context-item', { hasText: 'Child B' }).click();
    await expect(page.locator('.open-items-menu')).toHaveCount(0);
    await expect(page.locator('.node-row[data-id="3"]')).toBeVisible();
    // @ts-expect-error
    expect(await page.evaluate(() => selectedId)).toBe(3);

    // A second click on the summary closes the list instead of reopening it.
    await btn.click();
    await expect(menu).toHaveCount(1);
    await btn.click();
    await expect(page.locator('.open-items-menu')).toHaveCount(0);

    // One way to filter (owner, 2026-10-15): the switch below; group headings have no filter icons.
    await btn.click();
    await expect(menu.locator('.sb-context-heading-action')).toHaveCount(0);
    await btn.click();

    // The switch at the top shows every open item at once (here: the three follow-ups).
    await btn.click();
    await menu.locator('.oi-switch').click();
    // @ts-expect-error
    expect(await page.evaluate(() => [activeDiscussionFilter, activeMarkerFilter])).toEqual(['openItems', null]);
    const shown = await page.evaluate(() => [...document.querySelectorAll('.node-row:not(.tag-filtered-out):not(.marker-filter-context)')].map(r => (r as HTMLElement).dataset.id));
    expect(shown).toEqual(['2', '3', '4']);
    await expect(page.locator('#tag-filter-bar')).toContainText('Open items');
    await btn.click();
    await expect(menu.locator('.oi-switch')).toHaveAttribute('aria-checked', 'true');
    await menu.locator('.oi-switch').click();
    // @ts-expect-error
    expect(await page.evaluate(() => activeDiscussionFilter)).toBeNull();

    // Open items only (owner, 2026-10-15): no progress bar, no Settled / Out of scope / Decisions folds.
    await btn.click();
    await expect(menu.locator('.sb-context-fold')).toHaveCount(0);
    await expect(menu).not.toContainText('Done row');
    await expect(menu).not.toContainText('settled');
  });

  test('a long list stays on screen (it scrolls inside instead)', async ({ page }) => {
    await page.setViewportSize({ width: 1300, height: 360 });
    await open(page);
    await seed(page, Array.from({ length: 24 }, (_, i) => n(i + 1, 0, 'Row ' + (i + 1), null)));
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes.forEach((x: any) => { x.marker = 'followup'; }); render();
    });
    await page.locator('#marker-summary .open-items-btn').click();
    const m = await page.evaluate(() => {
      const el = document.querySelector('.open-items-menu') as HTMLElement;
      const r = el.getBoundingClientRect();
      return { bottom: r.bottom, vh: window.innerHeight, scrolls: el.scrollHeight > el.clientHeight };
    });
    expect(m.bottom).toBeLessThanOrEqual(m.vh);
    expect(m.scrolls).toBe(true);
  });

  test('hides when nothing is open (owner, 2026-10-15)', async ({ page }) => {
    await open(page);
    await seed(page, [n(1, 0, 'Agreed', null), n(2, 0, 'Set aside', null)]);
    // @ts-expect-error -- bare globals from index.html
    await page.evaluate(() => { nodes[0].marker = 'confirmed'; nodes[1].marker = 'parked'; render(); });
    await expect(page.locator('#ag-markers')).toBeHidden();
    await expect(page.locator('#marker-summary .open-items-btn')).toHaveCount(0);
  });

  // Owner (2026-10-15): the list is open items only (no "N of M settled" bar: a follow-up closed by
  // removing its marker dropped out of the count); an open question names its row and who asked.
  test('no progress bar; a question shows its row and who asked', async ({ page }) => {
    await open(page);
    await seed(page, [n(1, 0, 'Pricing', null), n(2, 0, 'Legacy EDI', null), n(3, 0, 'Customer comms', null)]);
    await page.evaluate(() => {
      // @ts-expect-error -- bare globals from index.html
      nodes[0].marker = 'confirmed'; nodes[1].marker = 'parked'; render();
    });
    const btn = page.locator('#marker-summary .open-items-btn');
    await expect(btn).toHaveCount(0);
    const menu = page.locator('.open-items-menu');

    await page.evaluate(() => {
      // @ts-expect-error
      remarks = [{ id: 'q1', anchorNodeId: 3, person: 'Maria', date: '2026-10-15', text: 'Who tells the customers?', type: 'question', createdAt: 1 }];
      // @ts-expect-error
      render();
    });
    await expect(btn).toHaveAttribute('aria-label', 'Needs attention: 1 open question.');
    await btn.click();
    await expect(menu).not.toContainText('settled');
    await expect(menu).not.toContainText('Legacy EDI');
    const q = menu.locator('.sb-context-item', { hasText: 'Who tells the customers?' });
    await expect(q.locator('.sb-context-sub')).toHaveText('Customer comms · Maria');
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

test.describe('Open-items summary shortcut', () => {
  test('right-click or Shift+click toggles "show only open items" without opening the list', async ({ page }) => {
    await open(page);
    await seed(page, [n(1, 0, 'Open thing', null), n(2, 0, 'Done thing', null), n(3, 0, 'Plain', null)]);
    // @ts-expect-error -- bare globals from index.html
    await page.evaluate(() => { nodes[0].marker = 'followup'; nodes[1].marker = 'confirmed'; render(); });
    const btn = page.locator('#marker-summary .open-items-btn');
    await expect(btn).toHaveAttribute('data-tip', /right-click \(or Shift\+click\) to show only open items/);

    await btn.click({ button: 'right' });
    await expect(page.locator('.open-items-menu')).toHaveCount(0);
    await expect(page.locator('.sb-context-menu')).toHaveCount(0);
    // @ts-expect-error
    expect(await page.evaluate(() => activeDiscussionFilter)).toBe('openItems');
    await expect(btn).toHaveClass(/active/);
    const shown = () => page.evaluate(() => [...document.querySelectorAll('.node-row:not(.tag-filtered-out)')].map((r) => (r as HTMLElement).dataset.id));
    expect(await shown()).toEqual(['1']);

    await btn.click({ button: 'right' });
    // @ts-expect-error
    expect(await page.evaluate(() => activeDiscussionFilter)).toBeNull();

    await btn.click({ modifiers: ['Shift'] });
    await expect(page.locator('.open-items-menu')).toHaveCount(0);
    // @ts-expect-error
    expect(await page.evaluate(() => activeDiscussionFilter)).toBe('openItems');
    await btn.click({ modifiers: ['Shift'] });
    // @ts-expect-error
    expect(await page.evaluate(() => activeDiscussionFilter)).toBeNull();

    // A plain click still opens the list.
    await btn.click();
    await expect(page.locator('.open-items-menu')).toHaveCount(1);
  });

  test('with nothing open, the shortcut says so instead of filtering everything away', async ({ page }) => {
    await open(page);
    await seed(page, [n(1, 0, 'Agreed', null)]);
    // @ts-expect-error -- bare globals from index.html
    await page.evaluate(() => { nodes[0].marker = 'confirmed'; render(); quickToggleOpenItemsFilter(); });
    // @ts-expect-error
    expect(await page.evaluate(() => activeDiscussionFilter)).toBeNull();
  });
});
