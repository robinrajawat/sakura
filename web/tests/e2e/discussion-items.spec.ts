import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Q&A and remarks are one inline object: a Discussion item under the row, of one kind -- Comment,
// Question (answered Yes / No, typed, or "won't answer"), Follow-up or Decision. Q&A linked to a
// row becomes a question item; section headers and unlinked Q&A stay in the Q&A list.

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
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Rollout'), n(2, 1, 'Cutover')];
    rebuildParentIds(); nextId = 3;
    remarks = [{ id: 'c1', anchorNodeId: 2, person: 'Ana', date: '2026-10-14', text: 'Weekend works for ops.', createdAt: 1 }];
    qaItems = [
      { id: 'sec', type: 'section', question: 'Open points' },
      { id: 'q1', question: 'Does this cover EU customers?', answer: '', sourceNodeId: 2, createdAt: 2 },
      { id: 'q2', question: 'Unlinked question', answer: '', sourceNodeId: null, createdAt: 3 }
    ];
    inlineExpandRemarksNodeIds = new Set([2]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
  return errors;
}

test('linked Q&A becomes a question item; section headers and unlinked questions stay in Q&A', async ({ page }) => {
  const errors = await seed(page);
  expect(await page.evaluate('qaItems.map(q => q.id)')).toEqual(['sec', 'q2']);
  expect(await page.evaluate("JSON.stringify(remarks.find(r => r.id === 'rq1'))")).toContain('"kind":"question"');
  await expect(page.locator('.node-remark-line:has(#inline-remark-text-rq1) .node-remark-kind-pill')).toHaveText('Question · Open');
  // One dot per row for the whole discussion, counting the open question.
  await expect(page.locator('.node-row[data-id="2"] .node-remark-dot .node-dot-count')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('right-click switches an item\'s kind: comment, decision, question', async ({ page }) => {
  const errors = await seed(page);
  const line = page.locator('.node-remark-line:has(#inline-remark-text-c1)');
  await line.click({ button: 'right' });
  const menu = page.locator('.sb-context-menu');
  await expect(menu.locator('.sb-context-heading', { hasText: 'Kind' })).toBeVisible();
  await menu.getByText('Decision', { exact: true }).click();
  await expect(line.locator('.node-remark-kind-pill')).toHaveText('Decision');
  expect(await page.evaluate("remarks.find(r => r.id === 'c1').kind")).toBe('decision');

  await line.click({ button: 'right' });
  await menu.getByText('Question', { exact: true }).click();
  await expect(line.locator('.node-remark-kind-pill')).toHaveText('Question · Open');
  await expect(page.locator('.node-remark-answer[data-remark-id="c1"]')).toHaveCount(1);

  await line.click({ button: 'right' });
  await menu.getByText('Answer No', { exact: true }).click();
  await expect(line.locator('.node-remark-kind-pill')).toHaveText('Answered');
  await expect(page.locator('.node-remark-answer-line:has([data-remark-id="c1"]) .node-remark-verdict-btn.is-picked')).toHaveText('✗ No');

  await line.click({ button: 'right' });
  await menu.getByText('Comment', { exact: true }).click();
  await expect(line.locator('.node-remark-kind-pill')).toHaveCount(0);
  expect(await page.evaluate("'kind' in remarks.find(r => r.id === 'c1')")).toBe(false);
  // One Undo goes back one kind change.
  await page.evaluate('undo()');
  expect(await page.evaluate("remarks.find(r => r.id === 'c1').kind")).toBe('question');
  expect(errors).toEqual([]);
});

test('Quick Assist finds a question by its text or answer under Discussion', async ({ page }) => {
  await seed(page);
  await page.evaluate("remarks.find(r => r.id === 'rq1').verdict = 'yes'");
  const r = await page.evaluate(`(() => {
    loadActiveDocsIndex = () => [{ id: currentDocId || 'doc1', title: 'Plan' }];
    getDocNodesForSearch = () => ({ docNodes: nodes, docTitle: 'Plan', docQa: qaItems, docDiagrams: diagrams, docRemarks: remarks });
    const groups = collectSearchGroups('eu customers');
    return {
      names: groups.filter(g => g.items.length).map(g => g.name),
      byVerdict: collectRemarkMatches('yes').map(i => i.label)
    };
  })()`);
  expect(r.names).toContain('Discussion');
  expect(r.names).not.toContain('Q&A');
  expect(r.byVerdict).toEqual(['Does this cover EU customers?']);
  for (const prefix of ['question', 'qa', 'discussion']) {
    expect(await page.evaluate(`qaParseCategoryPrefix("${prefix}: eu")`)).toEqual({ categoryKey: 'remarks', rest: 'eu' });
  }
});

test('PDF prints each item with its kind and a question\'s Yes / No answer', async ({ page }) => {
  const errors = await seed(page);
  await page.evaluate(`
    remarks.find(r => r.id === 'rq1').verdict = 'yes';
    remarks.find(r => r.id === 'rq1').answer = 'All of them';
    remarks.push({ id: 'd1', anchorNodeId: 2, kind: 'decision', person: 'Robin', date: '2026-10-14', text: 'Cut over on Saturday.', createdAt: 5 });
    remarks.push({ id: 'q3', anchorNodeId: 1, kind: 'question', person: '', date: '2026-10-14', text: 'Who signs off?', answer: '', createdAt: 6 });
  `);
  const r = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const doc = document.getElementById('preview-doc')!;
    return {
      labels: [...doc.querySelectorAll('.pv-remark-block .pv-inline-label-remark span')].map(e => e.textContent),
      pills: [...doc.querySelectorAll('.pv-remark-block .pv-status-pill')].map(e => e.textContent),
      answers: [...doc.querySelectorAll('.pv-remark-answer')].map(e => (e.textContent || '').trim()),
      qaSection: (document.getElementById('pv-qa-section')?.textContent || '')
    };
  });
  expect(r.labels).toEqual(['Discussion', 'Discussion']);
  expect(r.pills).toEqual(expect.arrayContaining(['Decision', 'Answered', 'Question · Open']));
  expect(r.answers).toEqual(expect.arrayContaining(['AYes — All of them', 'ANo answer yet']));
  // Unlinked Q&A still prints in the trailing list; the migrated question doesn't repeat there.
  expect(r.qaSection).toContain('Unlinked question');
  expect(r.qaSection).not.toContain('EU customers');
  expect(errors).toEqual([]);
});
