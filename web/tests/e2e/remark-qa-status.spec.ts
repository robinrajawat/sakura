import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Remark and Q&A status: remarks are open until resolved (older ones start open); a question is
// open until it has an answer or is closed as "won't answer". The toolbar counts open items and
// filters to them; PDF exports show each item's status and end with an "Open items" summary
// (Settings → Export & copy → "Open items summary", on by default).

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;
const DOC_ID = 'statusdoc';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ docId }) => {
    try {
      if (sessionStorage.getItem('status_seeded')) return;
      sessionStorage.setItem('status_seeded', '1');
      localStorage.setItem('sakura_welcome_seen', '1');
      sessionStorage.setItem('sakura_landing_dismissed', 'true');
      const n = (id: number, depth: number, text: string, parentId: number | null) =>
        ({ id, depth, text, parentId, isCheckbox: false, checked: false, note: '', tables: [], tags: [], styles: {} });
      localStorage.setItem('sakura_doc_v1_' + docId, JSON.stringify({
        nodes: [
          n(1, 0, 'Launch', null),
          n(2, 1, 'Pricing', 1),
          n(3, 1, 'Migration window', 1),
          n(4, 1, 'Support handover', 1),
          n(5, 1, 'Data export', 1),
        ],
        nextId: 6, selectedId: null, multiSelectedIds: [], selectionAnchorId: null, collapsed: [], title: 'Status', author: '',
        remarks: [
          { id: 'rOld', anchorNodeId: 2, person: 'Maria', date: '2026-10-09', text: 'Under 20 EUR please.', createdAt: 1 },
          { id: 'rDone', anchorNodeId: 2, person: 'Jonas', date: '2026-10-08', text: 'Old pricing idea.', createdAt: 0, resolvedAt: 5 },
        ],
        qa: [
          { id: 'qOpen', question: 'Do EU customers need 30 days notice?', answer: '', sourceNodeId: 3, createdAt: 1 },
          { id: 'qDone', question: 'Who owns tier-2 tickets?', answer: 'Priya', sourceNodeId: 4, createdAt: 2 },
          { id: 'qWont', question: 'JSON export too?', answer: '', wontAnswer: true, sourceNodeId: 5, createdAt: 3 },
        ],
      }));
      localStorage.setItem('sakura_docs_index_v1', JSON.stringify([{ id: docId, title: 'Status', updatedAt: Date.now() }]));
      localStorage.setItem('sakura_current_doc_v1', docId);
      localStorage.setItem('sakura_open_tabs_v1', JSON.stringify({ tabs: [docId], pinned: [], active: docId }));
    } catch { /* storage unavailable */ }
  }, { docId: DOC_ID });
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined" && nodes.length === 5');
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals from index.html
    inlineExpandRemarksNodeIds = new Set([2]); inlineExpandQaNodeIds = new Set([3, 4, 5]); render();
  });
  return errors;
}

const sumButtons = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('#marker-summary .disc-sum-btn')].map(b => (b as HTMLElement).getAttribute('aria-label')));

test('remarks: resolve folds a remark away, the fold line shows it again, reopen brings it back', async ({ page }) => {
  const errors = await open(page);
  // Seeded remark without resolvedAt counts as open; the resolved one is folded.
  await expect(page.locator('.node-remark-line:not(.node-remark-resolved-line)')).toHaveCount(1);
  await expect(page.locator('.node-remark-resolved-toggle')).toContainText('1 resolved remark');
  expect(await sumButtons(page)).toEqual(['1 open question', '1 open remark']);

  const line = page.locator('.node-remark-line', { hasText: 'Under 20 EUR' });
  await line.hover();
  await line.locator('.node-remark-status-btn').click();
  await expect(page.locator('.node-remark-resolved-toggle')).toContainText('2 resolved remarks');
  await expect(page.locator('.node-remark-text-inline')).toHaveCount(0);
  expect(await page.evaluate("typeof remarks.find(r => r.id === 'rOld').resolvedAt")).toBe('number');
  expect(await sumButtons(page)).toEqual(['1 open question']);
  // Row dot turns grey with no count once everything is resolved.
  await expect(page.locator('.node-remark-dot')).toHaveClass(/dot-all-closed/);

  await page.locator('.node-remark-resolved-toggle').click();
  await expect(page.locator('.node-remark-line.is-resolved')).toHaveCount(2);
  const resolvedLine = page.locator('.node-remark-line.is-resolved', { hasText: 'Under 20 EUR' });
  await resolvedLine.hover();
  await resolvedLine.locator('.node-remark-status-btn').click();
  await expect(page.locator('.node-remark-line:not(.is-resolved):not(.node-remark-resolved-line)')).toHaveCount(1);
  expect(await page.evaluate("'resolvedAt' in remarks.find(r => r.id === 'rOld')")).toBe(false);

  // One undo restores the resolved state from before the reopen.
  // @ts-expect-error -- bare global
  await page.evaluate(() => undo());
  expect(await page.evaluate("typeof remarks.find(r => r.id === 'rOld').resolvedAt")).toBe('number');
  expect(errors).toEqual([]);
});

test('Q&A: status pill tracks the answer live, and won\'t answer closes and reopens', async ({ page }) => {
  const errors = await open(page);
  const pill = (id: string) => page.locator(`.node-qa-line:has(#inline-qa-q-${id}) .node-qa-status`);
  await expect(pill('qOpen')).toHaveText('Open');
  await expect(pill('qDone')).toHaveText('Answered');
  await expect(pill('qWont')).toHaveText('Won’t answer');

  // Typing an answer flips the pill without re-rendering (caret stays in the answer).
  await page.locator('#inline-qa-a-qOpen').click();
  await page.keyboard.type('Yes');
  await expect(pill('qOpen')).toHaveText('Answered');
  await expect(page.locator('#inline-qa-a-qOpen')).toBeFocused();
  expect(await sumButtons(page)).toEqual(['1 open remark']);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await expect(pill('qOpen')).toHaveText('Open');

  // Won't answer via the hover button, then reopen it.
  const row = page.locator('.node-qa-line:has(#inline-qa-q-qOpen)');
  await row.hover();
  await row.locator('.node-qa-wont-btn').click();
  await expect(pill('qOpen')).toHaveText('Won’t answer');
  expect(await page.evaluate("qaItems.find(q => q.id === 'qOpen').wontAnswer")).toBe(true);
  await row.hover();
  await row.locator('.node-qa-wont-btn').click();
  await expect(pill('qOpen')).toHaveText('Open');
  expect(errors).toEqual([]);
});

test('toolbar open counts filter to the rows holding open items', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals
    inlineExpandQaNodeIds = new Set(); inlineExpandRemarksNodeIds = new Set(); render();
  });
  const visibleRows = () => page.evaluate(() =>
    [...document.querySelectorAll('.node-row')].filter(r => (r as HTMLElement).offsetParent !== null)
      .map(r => (r as HTMLElement).dataset.id + (r.classList.contains('marker-filter-context') ? '(context)' : '')));

  await page.locator('#marker-summary .disc-sum-btn[data-disc="openQa"]').click();
  expect(await visibleRows()).toEqual(['1(context)', '3']);
  // The filter opened the matching row's Q&A, and only open questions show.
  await expect(page.locator('#inline-qa-q-qOpen')).toBeVisible();
  await expect(page.locator('.node-qa-question')).toHaveCount(1);
  await expect(page.locator('#tag-filter-bar')).toContainText('Open questions');

  await page.locator('#marker-summary .disc-sum-btn[data-disc="openRemarks"]').click();
  expect(await visibleRows()).toEqual(['1(context)', '2']);
  await expect(page.locator('.node-remark-resolved-toggle')).toHaveCount(0);

  await page.locator('#marker-summary .disc-sum-btn[data-disc="openRemarks"]').click();
  expect((await visibleRows()).length).toBe(5);
  await expect(page.locator('#tag-filter-bar')).toBeHidden();
  expect(errors).toEqual([]);
});

async function exportPdf(page: Page) {
  return page.evaluate(async () => {
    const w = window as any;
    w.__printed = false;
    w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const sec = document.getElementById('pv-open-items-section');
    return {
      pills: [...document.querySelectorAll('#preview-doc .pv-status-pill')].map(p => p.textContent),
      section: sec ? {
        sub: sec.querySelector('.pv-open-items-sub')?.textContent,
        nodes: [...sec.querySelectorAll('.pv-open-items-node')].map(e => e.textContent),
        rows: [...sec.querySelectorAll('.pv-open-items-row')].map(e => (e.textContent || '').trim()),
      } : null,
      tocHasOpenItems: !!document.querySelector('#preview-toc a[href="#pv-open-items-section"]'),
    };
  });
}

test('PDF shows each item\'s status and ends with an Open items summary', async ({ page }) => {
  const errors = await open(page);
  const r = await exportPdf(page);
  expect(r.pills).toEqual(expect.arrayContaining(['Open', 'Resolved', 'Answered', 'Won’t answer']));
  expect(r.section).toEqual({
    sub: '1 open question · 1 open remark',
    nodes: ['Pricing', 'Migration window'],
    rows: ['MAMaria · Oct 9Under 20 EUR please.', 'QDo EU customers need 30 days notice?'],
  });
  expect(errors).toEqual([]);
});

test('PDF Open items summary: off by setting, and absent when nothing is open', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    // @ts-expect-error -- bare global
    setPdfOpenItemsSummary(false);
  });
  expect((await exportPdf(page)).section).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sakura_v001_prefs') || '{}').pdfOpenItemsSummary)).toBe(false);

  await page.evaluate(() => {
    // @ts-expect-error -- bare globals
    setPdfOpenItemsSummary(true);
  });
  await page.evaluate('remarks.forEach(x => { x.resolvedAt = 1; }); qaItems.forEach(x => { x.wontAnswer = true; });');
  const r = await exportPdf(page);
  expect(r.section).toBeNull();
  expect(r.tocHasOpenItems).toBe(false);
  expect(errors).toEqual([]);
});
