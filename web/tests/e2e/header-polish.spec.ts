import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Header polish (owner-approved mockup): toolbar groups have no grey box (dividers only, button
// hover backgrounds stay), marker summary counts use the text colour with only the icon tinted,
// and the line under the title is a quiet byline — sentence case, no pills, status shown as a
// soft tag (it is the one state there), "·" separators.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
    // @ts-expect-error -- bare globals from index.html
    nodes = [{ id: 1, depth: 0, text: 'Pricing', parentId: null, isCheckbox: false, checked: false, note: '', tags: [], styles: {}, tables: [], marker: 'followup' }];
    // @ts-expect-error
    nextId = 2; collapsedIds = new Set(); selectedId = null; editingId = null; setDocStatus('review', false); render(); updateMarkerSummary();
  });
});

test('toolbar groups have no background box', async ({ page }) => {
  const bgs = await page.locator('#quick-bar .action-group .ag-buttons').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(bgs.length).toBeGreaterThan(2);
  for (const bg of bgs) expect(bg).toBe('rgba(0, 0, 0, 0)');
});

test('the open-items words are grey like the other toolbar buttons; only the icon is tinted', async ({ page }) => {
  const part = page.locator('#marker-summary .oi-part').first();
  await expect(part).toBeVisible();
  const c = await part.evaluate((b) => ({
    text: getComputedStyle(b).color,
    icon: getComputedStyle(b.querySelector('svg')!).color,
    fg: getComputedStyle(document.body).getPropertyValue('--muted').trim()
  }));
  expect(c.icon).not.toBe(c.text);
  const probe = await page.evaluate((fg) => { const d = document.createElement('div'); d.style.color = fg; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v; }, c.fg);
  expect(c.text).toBe(probe);
});

test('the title byline is sentence case; status is the one soft tag, History has no pill background', async ({ page }) => {
  const s = await page.evaluate(() => {
    const status = document.getElementById('doc-status-chip')!;
    const hist = document.getElementById('doc-history-chip')!;
    return {
      statusText: status.textContent,
      transform: getComputedStyle(status).textTransform,
      statusBg: getComputedStyle(status).backgroundColor,
      statusDot: getComputedStyle(status, '::before').content,
      histTransform: getComputedStyle(hist).textTransform,
      histBg: getComputedStyle(hist).backgroundColor,
      sep: (() => { const a = getComputedStyle(document.getElementById('doc-status-wrap')!, '::after'); return [a.width, a.height, a.borderRadius].join(' '); })()
    };
  });
  expect(s.statusText).toBe('Review');
  expect(s.transform).toBe('none');
  expect(s.statusBg).not.toBe('rgba(0, 0, 0, 0)');
  expect(s.statusDot).toBe('none');
  expect(s.histTransform).toBe('none');
  expect(s.histBg).toBe('rgba(0, 0, 0, 0)');
  // A drawn, centred dot (the '·' glyph sat low next to the status pill).
  expect(s.sep).toBe('3px 3px 50%');
});

test('the byline is Status · author · link; History and Share close the toolbar, Share last', async ({ page }) => {
  const s = await page.evaluate(() => {
    const dot = (id: string, pseudo: string) => { const a = getComputedStyle(document.getElementById(id)!, pseudo); return [a.width, a.height, a.borderRadius].join(' '); };
    const fold = document.querySelector('#ag-fold .ag-buttons')!;
    return {
      linkSep: dot('doc-link-wrap', '::before'),
      inByline: ['doc-history-chip', 'doc-share-wrap', 'doc-presence-chip'].filter((id) => document.getElementById(id)!.closest('#editor-meta-row')),
      order: [...fold.children].map((c) => c.id || c.className),
      menuRight: getComputedStyle(document.getElementById('share-dd-menu')!).right
    };
  });
  expect(s.linkSep).toBe('3px 3px 50%');
  expect(s.inByline).toEqual([]);
  expect(s.order).toEqual(['qb-collapse', 'qb-zoom', 'tb-sep', 'doc-history-chip', 'doc-presence-chip', 'doc-share-wrap']);
  // Share sits at the right edge, so its menu opens leftwards from there.
  expect(s.menuRight).toBe('0px');
});

test('open items and decisions are separated by a dot, not a rule', async ({ page }) => {
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    documentDecisions = () => [{}]; updateMarkerSummary();
  });
  await expect(page.locator('#marker-summary > .oi-sep')).toHaveText('\u00B7');
  await expect(page.locator('#marker-summary .oi-divider')).toHaveCount(0);
});

test('the editor runs the full width, the toolbar edge to edge', async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 700 });
  const m = await page.evaluate(() => {
    const r = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    return { undo: r('undo-btn').left - r('quick-bar').left, page: r('editor-pane-inner').width, pane: r('editor-pane').width };
  });
  expect(m.undo).toBeLessThanOrEqual(16);
  // Only the page margins (up to 96px each side since 2026-10-29) sit beside the page; no width cap.
  expect(m.pane - m.page).toBeLessThanOrEqual(192);
});

test('Share is the one labelled button, with no fill; a shared document says Shared · N', async ({ page }) => {
  const label = page.locator('#doc-share-chip-label');
  await expect(label).toHaveText('Share');
  const bg = await page.locator('#doc-share-chip').evaluate((b) => getComputedStyle(b).backgroundColor);
  expect(bg).toBe('rgba(0, 0, 0, 0)');
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    docShareStatusCache[currentDocId] = [{}, {}]; renderDocShareChip(currentDocId);
  });
  await expect(label).toHaveText('Shared \u00B7 2');
  await expect(page.locator('#doc-share-chip')).toHaveAttribute('aria-label', /Shared with 2 people/);
});

test('signed in on your own document, Share also offers Invite people…', async ({ page }) => {
  const labels = await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    currentUser = { uid: 'u1' }; currentDocId = currentDocId || 'd1'; sharedDocMeta = {};
    // @ts-expect-error
    return shareMenuItems().map((i: { label: string }) => i.label);
  });
  expect(labels).toEqual(['Download PDF', 'Export', 'Invite people…']);
});
