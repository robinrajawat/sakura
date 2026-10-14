import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A row has one flat thread: entries are a Comment or a Question, each with one author and a time;
// an answer is a reply carrying Yes / No (or a reply marked as the answer); a status chip
// (Issue / Follow-up / Resolved / Decision) sits on the entry it was set on. The thread status and the
// row marker are one status: Issue ⇄ ⚠, Follow-up ⇄ ⚑, Resolved / Decision ⇄ ✓ Confirmed.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); });
});

async function seed(page: Page, extra = '') {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Rollout'), n(2, 1, 'Cutover'), n(3, 1, 'Data load')];
    rebuildParentIds(); nextId = 4;
    remarks = [{ id: 'c1', anchorNodeId: 2, person: 'Ana', date: '2026-10-14', text: 'Weekend works for ops.', createdAt: 1 }];
    qaItems = [
      { id: 'sec', type: 'section', question: 'Open points' },
      { id: 'q1', question: 'Does this cover EU customers?', answer: 'All of them', verdict: 'yes', sourceNodeId: 2, createdAt: 2 },
      { id: 'q2', question: 'Unlinked question', answer: '', sourceNodeId: null, createdAt: 3 }
    ];
    ${extra}
    inlineExpandRemarksNodeIds = new Set([2, 3]); collapsedIds = new Set(); editingId = null; undoStack = []; render();
  `);
  return errors;
}

test('old documents migrate: linked Q&A becomes a question with its answer entry; old kinds become status', async ({ page }) => {
  const errors = await seed(page, `
    remarks.push({ id: 'd1', anchorNodeId: 3, person: 'Maria', date: '2026-10-14', text: 'Load on Saturday.', createdAt: 5, kind: 'decision' });
  `);
  expect(await page.evaluate('qaItems.map(q => q.id)')).toEqual(['sec', 'q2']);
  const q = page.locator('.thread-entry:has(#inline-remark-text-rq1)');
  await expect(q.locator('.thread-chip.is-question')).toHaveText('Question · Answered');
  const a = page.locator('.thread-entry:has(#inline-remark-text-rq1-a)');
  await expect(a.locator('.thread-verdict.is-yes')).toHaveText('✓ Yes');
  await expect(a.locator('.node-remark-text-inline')).toHaveText('All of them');
  // A decision becomes the Decision status, and the row turns Confirmed.
  await expect(page.locator('.thread-entry:has(#inline-remark-text-d1) .thread-status-note.is-decision')).toHaveText('· decision');
  expect(await page.evaluate("nodes.find(n => n.id === 3).marker")).toBe('confirmed');
  expect(await page.evaluate("JSON.stringify(remarks.find(r => r.id === 'd1'))")).not.toContain('"kind"');
  expect(errors).toEqual([]);
});

test('reply line: hidden until "+ Reply"; Enter adds a comment, Ask a question, Yes answers it, the author sticks', async ({ page }) => {
  const errors = await seed(page);
  const box = page.locator('.thread-composer-input[data-node-id="2"]');
  // At rest the thread ends in "+ Reply", shown while the thread is hovered.
  await expect(box).toHaveCount(0);
  const replyLink = page.locator('.thread-reply-link').first();
  await expect(replyLink).toHaveCSS('opacity', '0');
  await page.locator('.thread-entry').first().hover();
  await expect(replyLink).toHaveCSS('opacity', '1');
  await replyLink.click();
  await expect(box).toBeFocused();
  await page.keyboard.type('Ops confirmed the window.');
  await page.keyboard.press('Enter');
  await expect(page.locator('.thread-entry[data-remark-id] .node-remark-text-inline', { hasText: 'Ops confirmed the window.' })).toHaveCount(1);
  // The box stays focused for the next entry.
  await expect(box).toBeFocused();

  // Reply as someone else.
  await page.locator('.thread-composer:has([data-node-id="2"]) .thread-author-btn').click();
  await page.locator('.sb-context-menu').getByText('Someone else…').click();
  await page.keyboard.type('Kristoffer');
  await page.keyboard.press('Enter');
  await expect(page.locator('.thread-composer:has([data-node-id="2"]) .thread-author-btn')).toHaveText('Kristoffer ▾');

  await page.locator('.thread-composer:has([data-node-id="2"]) .thread-btn[data-act="ask"]').click();
  await box.click();
  await page.keyboard.type('Is the rollback tested?');
  await page.keyboard.press('Enter');
  const last = await page.evaluate("JSON.stringify(remarks[remarks.length - 1])");
  expect(last).toContain('"type":"question"');
  expect(last).toContain('"person":"Kristoffer"');
  await expect(page.locator('.thread-entry .thread-chip.is-question[data-state="open"]')).toHaveCount(1);
  await expect(page.locator('.node-row[data-id="2"] .node-remark-dot .node-dot-count')).toHaveText('1');

  await box.click();
  await page.keyboard.type('Tested last week');
  await page.locator('.thread-composer:has([data-node-id="2"]) .thread-btn[data-act="yes"]').click();
  await expect(page.locator('.thread-entry .thread-chip.is-question[data-state="open"]')).toHaveCount(0);
  const answer = await page.evaluate("(() => { const r = remarks[remarks.length - 1]; return [r.verdict, r.answerTo === remarks[remarks.length - 2].id, stripHtmlToText(r.text)]; })()");
  expect(answer).toEqual(['yes', true, 'Tested last week']);
  expect(errors).toEqual([]);
});

test('row marker and thread status are one status, both ways', async ({ page }) => {
  const errors = await seed(page);
  // Marker → thread: Follow-up lands on the latest entry.
  await page.evaluate("setNodeMarker(2, 'followup'); render()");
  const latestStatus = "(() => { const t = nodeThread(2); return t[t.length - 1].status || ''; })()";
  expect(await page.evaluate(latestStatus)).toBe('followup');
  await expect(page.locator('.thread-entry .thread-status-note.is-followup')).toHaveCount(1);

  // Thread → marker: Resolve on the reply line turns the row Confirmed, as its own entry.
  await page.evaluate('openThreadComposer(2, false)');
  await page.locator('.thread-composer:has([data-node-id="2"]) .thread-btn[data-act="resolve"]').click();
  expect(await page.evaluate("nodes.find(n => n.id === 2).marker")).toBe('confirmed');
  expect(await page.evaluate(latestStatus)).toBe('resolved');
  // The earlier Follow-up stays as history.
  await expect(page.locator('.thread-entry .thread-status-note.is-followup')).toHaveCount(1);

  // Clearing the marker takes back the chip that set it: the follow-up is open again; clearing
  // that leaves no status.
  await page.evaluate("setNodeMarker(2, 'confirmed'); render()");
  expect(await page.evaluate("nodes.find(n => n.id === 2).marker || ''")).toBe('followup');
  await page.evaluate("setNodeMarker(2, 'followup'); render()");
  expect(await page.evaluate("nodes.find(n => n.id === 2).marker || ''")).toBe('');
  expect(await page.evaluate("threadStatus(nodeThread(2)) || ''")).toBe('');

  // A status from the entry menu sets the marker.
  await page.locator('.thread-entry:has(#inline-remark-text-c1)').click({ button: 'right' });
  await page.locator('.sb-context-menu').getByText('Decision', { exact: true }).click();
  expect(await page.evaluate("nodes.find(n => n.id === 2).marker")).toBe('confirmed');

  // Issue opens the row's reply box to say what's wrong; the first entry carries the Issue chip,
  // and Resolve closes it.
  await page.evaluate("setNodeMarker(3, 'issue'); render()");
  const box3 = page.locator('.thread-composer-input[data-node-id="3"]');
  await expect(box3).toBeFocused();
  await page.keyboard.type('Load script fails on the EU file');
  await page.keyboard.press('Enter');
  await expect(page.locator('.thread-entry', { hasText: 'Load script fails' }).locator('.thread-status-note.is-issue')).toHaveText('· issue');
  expect(await page.evaluate("nodes.find(n => n.id === 3).marker")).toBe('issue');
  await page.locator('.thread-composer:has([data-node-id="3"]) .thread-btn[data-act="resolve"]').click();
  expect(await page.evaluate("nodes.find(n => n.id === 3).marker")).toBe('confirmed');

  // Parked stays row-only.
  await page.evaluate("setNodeMarker(3, 'parked'); render()");
  expect(await page.evaluate("threadStatus(nodeThread(3))")).toBe('resolved');
  expect(errors).toEqual([]);
});

test('Quick Assist finds thread entries by text, answer and author', async ({ page }) => {
  await seed(page);
  const r = await page.evaluate(`(() => {
    loadActiveDocsIndex = () => [{ id: currentDocId || 'doc1', title: 'Plan' }];
    getDocNodesForSearch = () => ({ docNodes: nodes, docTitle: 'Plan', docQa: qaItems, docDiagrams: diagrams, docRemarks: remarks });
    const groups = collectSearchGroups('eu customers');
    return { names: groups.filter(g => g.items.length).map(g => g.name), byAuthor: collectRemarkMatches('ana').map(i => i.label) };
  })()`);
  expect(r.names).toContain('Threads');
  expect(r.names).not.toContain('Q&A');
  expect(r.byAuthor).toEqual(['Weekend works for ops.']);
  for (const prefix of ['question', 'thread', 'comment', 'discussion']) {
    expect(await page.evaluate(`qaParseCategoryPrefix("${prefix}: eu")`)).toEqual({ categoryKey: 'remarks', rest: 'eu' });
  }
});

test('PDF prints the whole thread with author, time and chips', async ({ page }) => {
  const errors = await seed(page, `
    remarks.push({ id: 'd1', anchorNodeId: 2, person: 'Maria', date: '2026-10-14', text: 'Cut over on Saturday.', createdAt: 9, status: 'decision' });
  `);
  const r = await page.evaluate(async () => {
    const w = window as any;
    w.__printed = false; w.print = () => { w.__printed = true; };
    w.exportPdfDirect();
    const t0 = Date.now();
    while (!w.__printed && Date.now() - t0 < 10000) await new Promise((res) => setTimeout(res, 50));
    const doc = document.getElementById('preview-doc')!;
    return {
      labels: [...doc.querySelectorAll('.pv-remark-block .pv-inline-label-remark > span:not(.pv-status-pill)')].map(e => e.textContent),
      notes: [...doc.querySelectorAll('.pv-remark-block .pv-thread-status-note')].map(e => e.textContent),
      verdicts: [...doc.querySelectorAll('.pv-remark-block .pv-thread-verdict')].map(e => e.textContent),
      texts: [...doc.querySelectorAll('.pv-remark-block .pv-remark-text')].map(e => (e.textContent || '').trim()),
      pills: [...doc.querySelectorAll('.pv-remark-block .pv-remark-entry .pv-status-pill')].map(e => e.textContent),
      qaSection: (document.getElementById('pv-qa-section')?.textContent || '')
    };
  });
  // The header names the thread; the status prints once on the row, and quietly on the entry that set it.
  expect(r.labels).toEqual(['Thread · 4']);
  expect(r.notes).toEqual(['· decision']);
  expect(r.verdicts).toEqual(['✓ Yes']);
  expect(r.texts).toEqual(['Weekend works for ops.', 'Does this cover EU customers?', 'All of them', 'Cut over on Saturday.']);
  expect(r.pills).toEqual(['Question · Answered']);
  expect(r.qaSection).toContain('Unlinked question');
  expect(r.qaSection).not.toContain('EU customers');
  expect(errors).toEqual([]);
});

test('each author gets their own avatar colour; a bare Yes takes one line', async ({ page }) => {
  await seed(page, `
    remarks.push(
      { id: 'k', anchorNodeId: 2, person: 'Karsten', date: '2026-10-14', text: 'Fine by me.', createdAt: 5 },
      { id: 'r', anchorNodeId: 2, person: 'Robin', date: '2026-10-14', text: 'Agreed.', createdAt: 6 },
      { id: 'g', anchorNodeId: 2, person: 'Gro Fatima', date: '2026-10-14', text: 'Noted.', createdAt: 7 }
    );
  `);
  // Karsten, Robin and Gro Fatima used to hash to one colour.
  const colours = await page.evaluate(`['Ana', 'Karsten', 'Robin', 'Gro Fatima'].map(n => remarkAuthorColor(n).avatarBg)`);
  expect(new Set(colours as string[]).size).toBe(4);

  // A bare Yes reply has no text and shows no text line.
  await page.evaluate(`remarks.push(
    { id: 'ask', anchorNodeId: 3, person: 'Ana', date: '2026-10-14', text: 'Ready?', type: 'question', createdAt: 8 },
    { id: 'bare', anchorNodeId: 3, person: 'Robin', date: '2026-10-14', text: '', verdict: 'yes', answerTo: 'ask', createdAt: 9 }); render();`);
  const bare = page.locator('.thread-entry.is-event');
  await expect(bare).toHaveCount(1);
  await expect(bare.locator('.thread-verdict.is-yes')).toBeVisible();
  await expect(bare.locator('.node-remark-text-inline')).toBeHidden();
});

test('right-click and Insert offer one Thread item, no separate comment/question', async ({ page }) => {
  await seed(page);
  const labels = await page.evaluate(`[...document.querySelectorAll('#insert-menu [data-insert-action]')].map(b => [b.dataset.insertAction, b.textContent.trim()])`) as string[][];
  expect(labels.filter(([a]) => a === 'remark').map(([, t]) => t)).toEqual(['Thread']);
  expect(labels.some(([a]) => a === 'qa')).toBe(false);
  await page.locator('.node-row[data-id="2"] .node-label').click({ button: 'right' });
  await expect(page.locator('#context-quickbar [data-action="remark"]')).toHaveCount(1);
  await expect(page.locator('#context-menu [data-action="qa"]')).toHaveCount(0);
});
