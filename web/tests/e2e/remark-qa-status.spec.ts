import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Thread status from older documents: a follow-up remark becomes a Follow-up chip (Resolved once it
// was resolved) and the row marker follows the thread; Q&A linked to a row becomes a question in
// its thread, open until answered (Yes / No or a reply marked as the answer) or closed as "won't
// answer". The toolbar counts open items and filters to them; PDF exports show each entry's chips
// (the closing "Open items" summary page was removed at the owner's request).

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

// The open-items summary's parts, by their tooltips ("1 follow-up", "1 question"); the chips show only
// icons and numbers (owner, 2026-10-29).
const sumButtons = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('#marker-summary .open-items-btn .oi-part')].map(b => (b as HTMLElement).dataset.tip || b.textContent));
// Opens the summary's list and flips "Show only open items in the outline" (the one filter).
async function clickOpenItemsSwitch(page: Page) {
  await page.locator('#marker-summary .open-items-btn').click();
  await page.locator('.open-items-menu .oi-switch').click();
}
const statusNote = (page: Page, id: string) => page.locator(`.thread-entry:has(#inline-remark-text-${id}) .thread-status-note`);

test('old follow-ups become the row\'s status; the entries keep their words', async ({ page }) => {
  const errors = await open(page);
  // No status in the thread any more: the open follow-up is the row's.
  await expect(statusNote(page, 'rDone')).toHaveCount(0);
  await expect(statusNote(page, 'rOld')).toHaveCount(0);
  expect(await page.evaluate('[nodes.find(n => n.id === 2).marker, nodes.find(n => n.id === 2).markerBy]')).toEqual(['followup', undefined]);
  expect(await page.evaluate("JSON.stringify(remarks.find(r => r.id === 'rOld'))")).not.toMatch(/followUp|status/);
  expect(await sumButtons(page)).toEqual(['1 follow-up', '1 question']);

  // Agreed on the row settles it.
  await page.evaluate("setNodeMarker(2, 'confirmed'); render()");
  expect(await page.evaluate('nodes.find(n => n.id === 2).marker')).toBe('confirmed');
  expect(await sumButtons(page)).toEqual(['1 question']);
  // One undo brings the follow-up back.
  await page.evaluate('undo(); render();');
  expect(await page.evaluate('nodes.find(n => n.id === 2).marker')).toBe('followup');
  expect(errors).toEqual([]);
});

test('a question (formerly Q&A): open or answered; a reply answers it, deleting the reply reopens it (owner, 2026-10-27)', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate('inlineExpandRemarksNodeIds = new Set([2, 3, 4, 5]); render();');
  expect(await page.evaluate('qaItems.length')).toBe(0);
  // An open question is its kind icon in the accent colour; the icon's tip names the state (no words on the line).
  const q = (id: string) => page.locator(`.thread-entry:has(#inline-remark-text-${id}) .thread-kind.is-question`);
  const isOpen = (id: string) => expect(q(id)).toHaveCSS('color', 'rgb(194, 85, 61)');
  await isOpen('rqOpen');
  await expect(q('rqOpen')).toHaveAttribute('data-tip', /^Open question/);
  await expect(q('rqDone')).toHaveAttribute('data-tip', /^Question, answered/);
  // An old "won't answer" question got a reply saying so: it reads as answered.
  await expect(q('rqWont')).toHaveAttribute('data-tip', /^Question, answered/);
  await expect(page.locator('#inline-remark-text-rqWont-w')).toHaveText('Won’t answer');
  await expect(page.locator('#inline-remark-text-rqDone-a')).toHaveText('Priya');

  // A reply answers it.
  await page.evaluate("openThreadComposer(3, false, 'rqOpen')");
  await page.keyboard.type('Yes');
  await page.keyboard.press('Enter');
  await expect(q('rqOpen')).toHaveAttribute('data-tip', /^Question, answered/);
  expect(await sumButtons(page)).toEqual(['1 follow-up']);
  // Deleting the answer reopens the question.
  const ans = page.locator('.thread-entry.is-nested', { hasText: 'Yes' }).last();
  await ans.locator('.node-remark-text-inline').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Delete', { exact: true }).click();
  await expect(q('rqOpen')).toHaveAttribute('data-tip', /^Open question/);
  await isOpen('rqOpen');
  // No Won't answer in the menu any more.
  await page.locator('.thread-entry:has(#inline-remark-text-rqOpen)').click({ button: 'right' });
  await expect(page.locator('.sb-context-menu').getByText('Won’t answer', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the open-items switch filters to the rows holding open items', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => {
    // @ts-expect-error -- bare globals
    inlineExpandQaNodeIds = new Set(); inlineExpandRemarksNodeIds = new Set(); render();
  });
  const visibleRows = () => page.evaluate(() =>
    [...document.querySelectorAll('.node-row')].filter(r => (r as HTMLElement).offsetParent !== null)
      .map(r => (r as HTMLElement).dataset.id + (r.classList.contains('marker-filter-context') ? '(context)' : '')));

  await clickOpenItemsSwitch(page);
  expect(await visibleRows()).toEqual(['1(context)', '2', '3']);
  // The filter opened the matching row's thread.
  await expect(page.locator('#inline-remark-text-rqOpen')).toBeVisible();
  await expect(page.locator('#tag-filter-bar')).toContainText('Open items');

  await clickOpenItemsSwitch(page);
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
      pills: [...document.querySelectorAll('#preview-doc .pv-remark-entry .pv-status-pill')].map(p => p.textContent),
      notes: [...document.querySelectorAll('#preview-doc .pv-thread-status-note')].map(p => p.textContent),
      section: !!sec,
      tocHasOpenItems: !!document.querySelector('#preview-toc a[href="#pv-open-items-section"]'),
    };
  });
}

test('PDF shows each entry\'s question state, and no Open items summary page', async ({ page }) => {
  const errors = await open(page);
  const r = await exportPdf(page);
  // No pills: question state is quiet text (an open question says so in words, for readers who don't know the icons).
  expect(r.pills).toEqual([]);
  expect(r.notes).toEqual(expect.arrayContaining(['· open question', '· question, answered']));
  expect(r.notes).not.toContain('· question, won’t answer');
  expect(r.notes).not.toContain('· follow-up');
  expect(r.pills).not.toContain('Follow-up');
  // Owner decision: the closing "Open items" summary page was removed.
  expect(r.section).toBe(false);
  expect(r.tocHasOpenItems).toBe(false);
  expect(errors).toEqual([]);
});

test('an entry\'s menu has no status: the row sets it', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate('inlineExpandRemarksNodeIds.add(4); render();');
  const line = page.locator('.thread-entry', { hasText: 'Just a comment.' });
  await line.click({ button: 'right' });
  await expect(page.locator('.sb-context-menu .sb-context-choice')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate("setNodeMarker(4, 'followup'); render()");
  expect(await page.evaluate('nodes.find(n => n.id === 4).marker')).toBe('followup');
  expect(await sumButtons(page)).toEqual(['2 follow-ups', '1 question']);
  await expect(line.locator('.thread-status-note')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a long thread shows its latest three entries; the rest fold, and the PDF prints all', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(`
    remarks.push(
      { id: 'c1', anchorNodeId: 4, person: 'A', date: '2026-10-11', text: 'Oldest comment', createdAt: 10 },
      { id: 'c2', anchorNodeId: 4, person: 'B', date: '2026-10-12', text: 'Older comment', createdAt: 11 },
      { id: 'c3', anchorNodeId: 4, person: 'C', date: '2026-10-13', text: 'Newest comment', createdAt: 12 }
    );
    inlineExpandRemarksNodeIds.add(4); render();
  `);
  const itemIds = () => page.evaluate(() => [...document.querySelectorAll('.node-row[data-id="4"] ~ .thread-entry')]
    .filter(e => e.querySelector('.node-remark-text-inline'))
    .map(e => (e as HTMLElement).dataset.remarkId).filter(id => ['rPlain', 'rqDone', 'rqDone-a', 'c1', 'c2', 'c3'].includes(id!)));
  expect(await itemIds()).toEqual(['c1', 'c2', 'c3']);
  // The header says how to see the rest; there's no extra line for it.
  const more = page.locator('.node-row[data-id="4"] ~ .thread-head .thread-head-more').first();
  await expect(more).toHaveText('· show 3 earlier');
  await expect(page.locator('.node-remark-resolved-toggle', { hasText: 'earlier entr' })).toHaveCount(0);
  await more.click();
  // By each entry's day: the old Q&A (no date) first, rPlain (Oct 7), then c1..c3.
  expect(await itemIds()).toEqual(['rqDone', 'rqDone-a', 'rPlain', 'c1', 'c2', 'c3']);

  const printed = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const txt = document.getElementById('preview-doc')!.textContent || '';
    return ['Oldest comment', 'Older comment', 'Newest comment', 'Just a comment.', 'Who owns tier-2 tickets?', 'Priya'].filter(t => !txt.includes(t));
  });
  expect(printed).toEqual([]);
  expect(errors).toEqual([]);
});
