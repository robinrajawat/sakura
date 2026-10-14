import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Remark and Q&A status: remarks are open until resolved (older ones start open); a question is
// open until it has an answer or is closed as "won't answer". The toolbar counts open items and
// filters to them; PDF exports show each item's status (the closing "Open items" summary page
// was removed at the owner's request).

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
          { id: 'rOld', anchorNodeId: 2, person: 'Maria', date: '2026-10-09', text: 'Under 20 EUR please.', createdAt: 1, followUp: true },
          { id: 'rDone', anchorNodeId: 2, person: 'Jonas', date: '2026-10-08', text: 'Old pricing idea.', createdAt: 0, followUp: true, resolvedAt: 5 },
          { id: 'rPlain', anchorNodeId: 4, person: 'Priya', date: '2026-10-07', text: 'Just a comment.', createdAt: 2 },
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

// The toolbar open-items summary's question/remark parts ("1 question", "2 remarks").
const sumButtons = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('#marker-summary .oi-part[data-key="question"], #marker-summary .oi-part[data-key="remark"]')].map(b => (b as HTMLElement).textContent));
// Opens the summary's list and clicks the filter item of one group ("Open questions", …).
async function clickGroupFilter(page: Page, heading: string) {
  await page.locator('#marker-summary .open-items-btn').click();
  await page.evaluate((heading) => {
    const h = [...document.querySelectorAll('.open-items-menu .sb-context-heading')].find(e => (e.textContent || '').startsWith(heading))!;
    let n = h.nextElementSibling;
    while (n && !/Show only these|Clear this filter/.test(n.textContent || '')) n = n.nextElementSibling;
    (n as HTMLElement).click();
  }, heading);
}

test('remarks: resolve folds a remark away, the fold line shows it again, reopen brings it back', async ({ page }) => {
  const errors = await open(page);
  // Seeded remark without resolvedAt counts as open; the resolved one is folded.
  await expect(page.locator('.node-remark-line:not(.node-remark-resolved-line)')).toHaveCount(1);
  await expect(page.locator('.node-remark-resolved-toggle')).toContainText('1 resolved follow-up');
  expect(await sumButtons(page)).toEqual(['1 question', '1 remark']);

  const line = page.locator('.node-remark-line', { hasText: 'Under 20 EUR' });
  await line.hover();
  await line.locator('.node-remark-status-btn').click();
  await expect(page.locator('.node-remark-resolved-toggle')).toContainText('2 resolved follow-ups');
  await expect(page.locator('.node-remark-text-inline')).toHaveCount(0);
  expect(await page.evaluate("typeof remarks.find(r => r.id === 'rOld').resolvedAt")).toBe('number');
  expect(await sumButtons(page)).toEqual(['1 question']);
  // Row dot turns grey with no count once everything is resolved.
  await expect(page.locator('.node-row[data-id="2"] .node-remark-dot')).toHaveClass(/dot-all-closed/);
  // A row with only a plain comment never goes grey: there's nothing to close.
  await expect(page.locator('.node-row[data-id="4"] .node-remark-dot')).not.toHaveClass(/dot-all-closed/);

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
  expect(await sumButtons(page)).toEqual(['1 remark']);
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

test('the open-items list filters to the rows holding open items', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals
    inlineExpandQaNodeIds = new Set(); inlineExpandRemarksNodeIds = new Set(); render();
  });
  const visibleRows = () => page.evaluate(() =>
    [...document.querySelectorAll('.node-row')].filter(r => (r as HTMLElement).offsetParent !== null)
      .map(r => (r as HTMLElement).dataset.id + (r.classList.contains('marker-filter-context') ? '(context)' : '')));

  await clickGroupFilter(page, 'Open questions');
  expect(await visibleRows()).toEqual(['1(context)', '3']);
  // The filter opened the matching row's Q&A, and only open questions show.
  await expect(page.locator('#inline-qa-q-qOpen')).toBeVisible();
  await expect(page.locator('.node-qa-question')).toHaveCount(1);
  await expect(page.locator('#tag-filter-bar')).toContainText('Open questions');

  await clickGroupFilter(page, 'Open follow-up remarks');
  expect(await visibleRows()).toEqual(['1(context)', '2']);
  await expect(page.locator('.node-remark-resolved-toggle')).toHaveCount(0);

  await clickGroupFilter(page, 'Open follow-up remarks');
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

test('PDF shows each item\'s status, and no Open items summary page', async ({ page }) => {
  const errors = await open(page);
  const r = await exportPdf(page);
  expect(r.pills).toEqual(expect.arrayContaining(['Open', 'Follow-up', 'Resolved', 'Answered', 'Won’t answer']));
  // Plain comments carry no status pill.
  expect(r.pills.filter((p: string | null) => p === 'Follow-up' || p === 'Resolved')).toHaveLength(2);
  // Owner decision: the closing "Open items" summary page was removed.
  expect(r.section).toBeNull();
  expect(r.tocHasOpenItems).toBe(false);
  expect(errors).toEqual([]);
});

test('a plain comment has no status until it is marked as a follow-up (right-click)', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate('inlineExpandRemarksNodeIds.add(4); render();');
  const line = page.locator('.node-remark-line', { hasText: 'Just a comment.' });
  await line.hover();
  await expect(line.locator('.node-remark-status-btn')).toHaveCount(0);
  await expect(line.locator('.node-remark-followup-pill')).toHaveCount(0);
  expect(await sumButtons(page)).toEqual(['1 question', '1 remark']);

  await line.click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Mark as follow-up', { exact: true }).click();
  const flagged = page.locator('.node-remark-line', { hasText: 'Just a comment.' });
  await expect(flagged.locator('.node-remark-followup-pill')).toHaveText('Follow-up');
  expect(await sumButtons(page)).toEqual(['1 question', '2 remarks']);

  await flagged.click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Not a follow-up', { exact: true }).click();
  await expect(page.locator('.node-remark-line', { hasText: 'Just a comment.' }).locator('.node-remark-followup-pill')).toHaveCount(0);
  expect(await page.evaluate("'followUp' in remarks.find(r => r.id === 'rPlain')")).toBe(false);
  expect(await sumButtons(page)).toEqual(['1 question', '1 remark']);
  expect(errors).toEqual([]);
});

test('more than two remarks or questions under a row: the latest remarks and open questions show, the rest fold', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(`
    remarks.push(
      { id: 'c1', anchorNodeId: 4, person: 'A', date: '2026-10-01', text: 'Oldest comment', createdAt: 10 },
      { id: 'c2', anchorNodeId: 4, person: 'B', date: '2026-10-02', text: 'Older comment', createdAt: 11 },
      { id: 'c3', anchorNodeId: 4, person: 'C', date: '2026-10-03', text: 'Newest comment', createdAt: 12 },
      { id: 'c4', anchorNodeId: 4, person: 'D', date: '2026-10-04', text: 'Old follow-up', createdAt: 1, followUp: true }
    );
    qaItems.push(
      { id: 'qa2', question: 'Second answered?', answer: 'Yes', sourceNodeId: 4, createdAt: 5 },
      { id: 'qa3', question: 'Still open?', answer: '', sourceNodeId: 4, createdAt: 6 }
    );
    inlineExpandRemarksNodeIds.add(4); render();
  `);
  const remarkIds = () => page.evaluate(() => [...document.querySelectorAll('.node-remark-text-inline')].map(e => (e as HTMLElement).dataset.remarkId));
  const qaIds = () => page.evaluate(() => [...document.querySelectorAll('.node-qa-question')].map(e => (e as HTMLElement).dataset.qaId));
  // Row 4 now has five remarks (rPlain + four): the two newest, plus the open follow-up, show.
  expect((await remarkIds()).filter(id => ['rPlain', 'c1', 'c2', 'c3', 'c4'].includes(id!))).toEqual(['c3', 'c2', 'c4']);
  const more = page.locator('.node-inline-more-toggle', { hasText: 'earlier remark' });
  await expect(more).toHaveText(/2 earlier remarks/);
  await more.click();
  expect((await remarkIds()).filter(id => ['rPlain', 'c1', 'c2', 'c3', 'c4'].includes(id!))).toEqual(['c3', 'c2', 'c1', 'rPlain', 'c4']);
  await expect(page.locator('.node-inline-more-toggle', { hasText: 'Hide earlier remarks' })).toBeVisible();

  // Row 4's questions: open first, the two answered ones folded.
  expect((await qaIds()).filter(id => ['qDone', 'qa2', 'qa3'].includes(id!))).toEqual(['qa3']);
  await page.locator('.node-inline-more-toggle', { hasText: '2 answered questions' }).click();
  expect((await qaIds()).filter(id => ['qDone', 'qa2', 'qa3'].includes(id!))).toEqual(['qa3', 'qDone', 'qa2']);

  // The PDF prints every one of them.
  const printed = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const txt = document.getElementById('preview-doc')!.textContent || '';
    return ['Oldest comment', 'Older comment', 'Newest comment', 'Old follow-up', 'Just a comment.', 'Second answered?', 'Still open?', 'Who owns tier-2 tickets?'].filter(t => !txt.includes(t));
  });
  expect(printed).toEqual([]);
  expect(errors).toEqual([]);
});
