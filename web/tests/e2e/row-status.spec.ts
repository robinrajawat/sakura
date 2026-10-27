import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// One status, on the row (owner decision 2026-10-27): a row is Agreed, Follow-up or Out of scope,
// with who set it and when (the date says how old a follow-up is) and a Follow-up's owner. Setting
// it adds nothing to the thread; the thread holds comments, questions and decisions.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function seed(page: Page, remarksJs = '[]', nodeExtra = '{}') {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.setViewportSize({ width: 1300, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function"');
  await page.evaluate(`
    const n = (id, depth, text, x) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {}, ...(x || {}) });
    nodes = [n(1, 0, 'Shipping condition', ${nodeExtra}), n(2, 0, 'Exclusion check')]; rebuildParentIds(); nextId = 3;
    remarks = ${remarksJs};
    inlineExpandRemarksNodeIds = new Set([1]); showAllRemarksNodeIds = new Set([1]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
  return errors;
}
const row = (page: Page) => page.evaluate('({ marker: nodes[0].marker || "", by: nodes[0].markerBy || "", at: nodes[0].markerAt || 0, owner: nodes[0].markerOwner || "" })') as Promise<{ marker: string; by: string; at: number; owner: string }>;
const badge = (page: Page) => page.locator('.node-row[data-id="1"] .node-marker-badge');
const menu = (page: Page) => page.locator('.sb-context-menu');

test('an older thread with two follow-ups becomes one Follow-up row; the entries keep their words', async ({ page }) => {
  const errors = await seed(page, `[
    { id: 'f1', anchorNodeId: 1, person: 'Kristoffer', date: '2026-10-12', text: 'Can fixed-day customers book before 7 AM?', status: 'followup', createdAt: 1 },
    { id: 'c1', anchorNodeId: 1, person: 'Marlene', date: '2026-10-20', text: 'They order as they do today.', createdAt: 2 },
    { id: 'f2', anchorNodeId: 1, person: 'Robin', date: '2026-10-20', text: 'Check the extra freight price.', status: 'followup', owner: 'Ana', createdAt: 3 },
    { id: 's1', anchorNodeId: 1, person: 'Robin', date: '2026-10-20', text: '', status: 'followup', done: true, createdAt: 0 }
  ]`, `{ marker: 'followup' }`);
  expect(await row(page)).toEqual({ marker: 'followup', by: 'Robin', at: 3, owner: 'Ana' });
  // Status-only entries go; nothing in the thread holds a status any more.
  expect(await page.evaluate('remarks.map(r => r.id)')).toEqual(['f1', 'c1', 'f2']);
  expect(await page.evaluate('remarks.some(r => r.status || r.owner || r.done)')).toBe(false);
  await expect(page.locator('.thread-entry .thread-status-note')).toHaveCount(0);
  // One open item, named by row and owner, with the thread's latest line.
  await expect(page.locator('#marker-summary .open-items-btn')).toContainText('1 follow-up');
  await page.locator('#marker-summary .open-items-btn').click();
  await expect(menu(page)).toContainText('Shipping condition · Ana');
  await expect(menu(page)).toContainText('Robin: Check the extra freight price.');
  expect(errors).toEqual([]);
});

test('setting a status records who and when on the row and adds nothing to the thread', async ({ page }) => {
  await seed(page, `[{ id: 'c1', anchorNodeId: 1, person: 'Marlene', date: '2026-10-20', text: 'Looks fine.', createdAt: 1 }]`);
  await page.evaluate(`_threadAuthor = 'Robin'; setNodeMarker(1, 'confirmed'); render()`);
  const r = await row(page);
  expect(r.marker).toBe('confirmed');
  expect(r.by).toBe('Robin');
  expect(Date.now() - r.at).toBeLessThan(60_000);
  expect(await page.evaluate('remarks.length')).toBe(1);
  // Hovering the badge says who set it and when.
  expect(await badge(page).getAttribute('data-tip')).toMatch(/^Agreed · Robin, \d+ \w+ \(today\) — click/);
  // Undo takes it back.
  await page.evaluate('contextualUndo(); render()');
  expect((await row(page)).marker).toBe('');
});

test('the badge menu changes the status, names the owner (typed in place) and adds the task', async ({ page }) => {
  const errors = await seed(page, `[{ id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-20', text: 'Ask SAP', createdAt: 1 }]`, `{ marker: 'followup', markerBy: 'Robin', markerAt: Date.now() - 15 * 86400000 }`);
  expect(await badge(page).getAttribute('data-tip')).toContain('(2w)');
  await badge(page).click();
  await expect(menu(page).locator('.sb-context-heading').first()).toContainText('Follow-up · Robin');
  await menu(page).getByText('Assign follow-up').hover();
  await menu(page).getByText('Someone else…').click();
  const edit = page.locator('.node-row[data-id="1"] .row-owner-edit');
  await expect(edit).toBeFocused();
  await page.keyboard.type('Kim');
  await page.keyboard.press('Enter');
  expect((await row(page)).owner).toBe('Kim');
  expect(await badge(page).getAttribute('data-tip')).toContain('Follow-up · for Kim · Robin');

  await badge(page).click();
  await menu(page).getByText('Add to To-Dos', { exact: true }).click();
  expect(await page.evaluate('todoRefsForNode(1).map(t => t.text)')).toEqual(['@Kim Ask SAP']);
  await badge(page).click();
  await expect(menu(page).getByText('Open in To-Dos', { exact: true })).toBeVisible();
  // Agreed from the same menu; the owner goes with the follow-up.
  await menu(page).locator('.sb-context-choice', { hasText: 'Agreed' }).click();
  expect(await row(page)).toMatchObject({ marker: 'confirmed', owner: '' });
  expect(errors).toEqual([]);
});

test('the reply line has no status buttons: the status is set on the row', async ({ page }) => {
  await seed(page, '[]', `{ marker: 'followup' }`);
  await page.evaluate('openThreadComposer(1, false)');
  for (const act of ['followup', 'confirm', 'parked']) await expect(page.locator(`.thread-composer .thread-btn[data-act="${act}"]`)).toHaveCount(0);
});

test('F8 and the agenda list each Follow-up row once; the PDF prints its owner and date', async ({ page }) => {
  await seed(page, `[{ id: 'c1', anchorNodeId: 1, person: 'Ana', date: '2026-10-20', text: 'Ask SAP', createdAt: 1 }]`, `{ marker: 'followup', markerBy: 'Robin', markerAt: new Date(2026, 9, 13).getTime(), markerOwner: 'Kim' }`);
  await page.evaluate('nodes[1].marker = "followup"; render()');
  expect(await page.evaluate('openItemsInOutlineOrder().map(x => x.key)')).toEqual(['f1', 'f2']);
  const text = await page.evaluate('openItemsAgendaContent().text') as string;
  expect(text).toContain('2 follow-ups');
  expect(text).toMatch(/1\. Shipping condition\n.*Kim.*13 Oct.*\n {3}Ana: Ask SAP/);
  const label = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    return document.querySelector('#preview-doc .pv-marker-label')?.textContent;
  });
  expect(label).toBe('Follow-up for Kim · since 13 Oct');
});

test('Follow-up from the row menu sets the status and opens no thread', async ({ page }) => {
  await seed(page);
  await page.evaluate('inlineExpandRemarksNodeIds = new Set(); showAllRemarksNodeIds = new Set(); render()');
  await page.locator('.node-row[data-id="2"] .node-label').click({ button: 'right' });
  await page.locator('#context-quickbar [data-marker="followup"]').click();
  expect(await page.evaluate('nodes[1].marker')).toBe('followup');
  await expect(page.locator('.thread-composer')).toHaveCount(0);
  expect(await page.evaluate('remarks.length')).toBe(0);
});
