import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A row has one flat thread: entries are a Comment or a Question, each with one author and a time;
// an answer is a reply carrying Yes / No (or a reply marked as the answer); a status (Agreed /
// Follow-up / Out of scope) sits on the entry it was set on, and the latest one is the row marker.
// A Decision is a chip on an entry; it doesn't change the row.

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

test('old documents migrate: linked Q&A becomes a question with its answer entry; an old decision makes its row Agreed', async ({ page }) => {
  const errors = await seed(page, `
    remarks.push({ id: 'd1', anchorNodeId: 3, person: 'Maria', date: '2026-10-14', text: 'Load on Saturday.', createdAt: 5, kind: 'decision' });
  `);
  expect(await page.evaluate('qaItems.map(q => q.id)')).toEqual(['sec', 'q2']);
  const q = page.locator('.thread-entry:has(#inline-remark-text-rq1)');
  await expect(q.locator('.thread-q-note')).toHaveText('· question, answered');
  const a = page.locator('.thread-entry:has(#inline-remark-text-rq1-a)');
  await expect(a.locator('.thread-verdict.is-yes')).toHaveText('· yes');
  await expect(a.locator('.thread-kind.is-answer')).toHaveCount(1);
  await expect(a.locator('.node-remark-text-inline')).toHaveText('All of them');
  // An old decision item makes its row Agreed (by its author) and stays a decision on its entry.
  await expect(page.locator('.thread-entry:has(#inline-remark-text-d1) .thread-status-note')).toHaveText(['· decision']);
  await expect(page.locator('.thread-entry:has(#inline-remark-text-d1) .thread-kind.is-decision svg')).toHaveCount(1);
  expect(await page.evaluate("[nodes.find(n => n.id === 3).marker, nodes.find(n => n.id === 3).markerBy]")).toEqual(['confirmed', 'Maria']);
  expect(await page.evaluate("JSON.stringify(remarks.find(r => r.id === 'd1'))")).not.toMatch(/"kind"|"status"/);
  expect(errors).toEqual([]);
});

test('reply line: hidden until "+ Add to thread"; Enter adds a comment, Ask a question, Reply → Yes answers it, the author sticks', async ({ page }) => {
  const errors = await seed(page);
  const box = page.locator('.thread-composer-input[data-node-id="2"]');
  // At rest the thread ends in "+ Add to thread", shown while the thread is hovered.
  await expect(box).toHaveCount(0);
  const replyLink = page.locator('.thread-reply-link').first();
  // Only its label fades: the line itself stays opaque, so the depth guides it carries stay drawn.
  await expect(replyLink).toHaveCSS('opacity', '1');
  await expect(replyLink.locator('.thread-reply-label')).toHaveCSS('opacity', '0');
  await page.locator('.thread-entry').first().hover();
  await expect(replyLink.locator('.thread-reply-label')).toHaveCSS('opacity', '1');
  await replyLink.click();
  await expect(box).toBeFocused();
  await page.keyboard.type('Ops confirmed the window.');
  await page.keyboard.press('Enter');
  await expect(page.locator('.thread-entry[data-remark-id] .node-remark-text-inline', { hasText: 'Ops confirmed the window.' })).toHaveCount(1);
  // The box stays focused for the next entry.
  await expect(box).toBeFocused();

  // Add as someone else.
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
  const asked = page.locator('.thread-entry', { hasText: 'Is the rollback tested?' });
  await expect(asked.locator('.thread-kind.is-question')).toHaveCSS('color', 'rgb(194, 85, 61)');
  await expect(page.locator('.node-row[data-id="2"] .node-remark-dot .node-dot-count')).toHaveText('1');
  // The bottom line has no Yes / No: a question is answered from its own Reply (owner, 2026-10-27).
  await expect(page.locator('.thread-composer:has([data-node-id="2"]) .thread-btn[data-act="yes"]')).toHaveCount(0);

  await asked.locator('.thread-reply-btn').click();
  await expect(page.locator('.thread-composer.is-nested')).toHaveCount(1);
  await page.keyboard.type('Tested last week');
  await page.locator('.thread-composer:has([data-node-id="2"]) .thread-btn[data-act="yes"]').click();
  // Answered: the question's icon leaves the accent colour, and the answer, under it, gets a ✓.
  await expect(asked.locator('.thread-kind.is-question')).not.toHaveCSS('color', 'rgb(194, 85, 61)');
  await expect(page.locator('.thread-entry.is-nested', { hasText: 'Tested last week' }).locator('.thread-kind.is-answer')).toHaveCount(1);
  const answer = await page.evaluate("(() => { const r = remarks[remarks.length - 1]; return [r.verdict, r.answerTo === remarks[remarks.length - 2].id, stripHtmlToText(r.text)]; })()");
  expect(answer).toEqual(['yes', true, 'Tested last week']);
  expect(errors).toEqual([]);
});

test('the status is the row\'s: setting it adds no entry and opens nothing', async ({ page }) => {
  const errors = await seed(page);
  const count = 'remarks.length';
  const before = await page.evaluate(count) as number;
  await page.evaluate("_threadAuthor = 'Robin'; setNodeMarker(2, 'confirmed'); render()");
  expect(await page.evaluate("[nodes.find(n => n.id === 2).marker, nodes.find(n => n.id === 2).markerBy]")).toEqual(['confirmed', 'Robin']);
  expect(await page.evaluate(count)).toBe(before);
  // A marker on a row with no thread doesn't start one.
  await page.evaluate("setNodeMarker(1, 'confirmed'); render()");
  expect(await page.evaluate('nodeThread(1).length')).toBe(0);
  // Follow-up opens no reply line (owner, 2026-10-27).
  await page.evaluate("setNodeMarker(3, 'followup'); render()");
  expect(await page.evaluate("nodes.find(n => n.id === 3).marker")).toBe('followup');
  await expect(page.locator('.thread-composer-input[data-node-id="3"]')).toHaveCount(0);
  expect(await page.evaluate('remarks.some(r => r.status)')).toBe(false);
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

test('PDF prints the whole thread with kind icons, author, time and notes', async ({ page }) => {
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
      kinds: [...doc.querySelectorAll('.pv-remark-block .pv-remark-kind')].map(e => e.className.replace('pv-remark-kind is-', '')),
      decisionIcon: !!doc.querySelector('.pv-remark-block .pv-remark-kind.is-decision svg'),
      // Names are plain text colour, semi-bold (owner, 2026-10-23: colour only for open items).
      nameColours: [...doc.querySelectorAll('.pv-remark-block .pv-remark-meta b')].map(e => getComputedStyle(e).color),
      kindHasCircle: getComputedStyle(doc.querySelector('.pv-remark-block .pv-remark-kind')!).borderRadius,
      qaSection: (document.getElementById('pv-qa-section')?.textContent || '')
    };
  });
  // The header names the thread; the status prints once, on the row.
  expect(r.labels).toEqual(['Thread · 4 · Decision']);
  expect(r.notes).toEqual(['· question, answered', '· decision']);
  expect(r.verdicts).toEqual(['· yes']);
  expect(r.texts).toEqual(['Weekend works for ops.', 'Does this cover EU customers?', 'All of them', 'Cut over on Saturday.']);
  // No chips: each entry's kind is its icon (a faint comment icon for a plain comment).
  expect(r.pills).toEqual([]);
  expect(r.kinds).toEqual(['comment', 'question', 'answer', 'decision']);
  expect(r.decisionIcon).toBe(true);
  expect(new Set(r.nameColours).size).toBe(1);
  expect(r.kindHasCircle).toBe('50%');
  expect(r.qaSection).toContain('Unlinked question');
  expect(r.qaSection).not.toContain('EU customers');
  expect(errors).toEqual([]);
});

test('names are one plain colour; a bare Yes takes one line', async ({ page }) => {
  await seed(page, `
    remarks.push(
      { id: 'k', anchorNodeId: 2, person: 'Karsten', date: '2026-10-14', text: 'Fine by me.', createdAt: 5 },
      { id: 'r', anchorNodeId: 2, person: 'Robin', date: '2026-10-14', text: 'Agreed.', createdAt: 6 },
      { id: 'g', anchorNodeId: 2, person: 'Gro Fatima', date: '2026-10-14', text: 'Noted.', createdAt: 7 }
    );
  `);
  // Names no longer carry per-person colours (owner, 2026-10-23).
  const colours = await page.evaluate(`[...document.querySelectorAll('.thread-entry .node-remark-person-inline')].map(e => getComputedStyle(e).color)`);
  expect((colours as string[]).length).toBeGreaterThan(2);
  expect(new Set(colours as string[]).size).toBe(1);

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
  await page.locator('.node-row[data-id="2"] .node-label').click();
  await page.keyboard.press('Escape');
  await page.locator('#qb-insert').click();
  const labels = await page.evaluate(`[...document.querySelectorAll('#insert-menu [data-insert-action]')].map(b => [b.dataset.insertAction, b.textContent.trim()])`) as string[][];
  expect(labels.filter(([a]) => a === 'remark').map(([, t]) => t)).toEqual(['Thread']);
  expect(labels.some(([a]) => a === 'qa')).toBe(false);
  await page.locator('.node-row[data-id="2"] .node-label').click({ button: 'right' });
  await expect(page.locator('#context-quickbar [data-action="remark"]')).toHaveCount(1);
  await expect(page.locator('#context-menu [data-action="qa"]')).toHaveCount(0);
});

test('entry menu: Reply first, question toggle, decision; no status (that is the row\'s)', async ({ page }) => {
  await seed(page);
  const entry = page.locator('.thread-entry:has(#inline-remark-text-c1) .node-remark-text-inline');
  await entry.click({ button: 'right' });
  const menu = page.locator('.sb-context-menu');
  await expect(menu.locator('.sb-context-item').first()).toHaveText('Add to thread');
  await expect(menu.getByText('Make it a question', { exact: true })).toBeVisible();
  await expect(menu.locator('.sb-context-choice')).toHaveCount(0);
  // A decision is marked on the entry (handshake icon, quiet text); the row's status stays as it is.
  await menu.getByText('Mark as decision', { exact: true }).click();
  await expect(page.locator('.thread-entry:has(#inline-remark-text-c1) .thread-status-note.is-decision')).toHaveText('· decision');
  await expect(page.locator('.thread-entry:has(#inline-remark-text-c1) .thread-kind.is-decision')).toHaveCount(1);
  expect(await page.evaluate("nodes.find(n => n.id === 2).marker || ''")).toBe('');
  await entry.click({ button: 'right' });
  await expect(menu.getByText('Not a decision', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  // The header says the thread holds a decision.
  await expect(page.locator('.thread-head .thread-head-decision')).toHaveText('· Decision');
  await entry.click({ button: 'right' });
  await menu.getByText('Add to thread', { exact: true }).click();
  await expect(page.locator('.thread-composer-input[data-node-id="2"]')).toBeFocused();
  expect(await page.evaluate('_threadAskNodeIds.has(2)')).toBe(false);
});

test('depth guides run unbroken through a thread, its "+ Add to thread" line included', async ({ page }) => {
  await seed(page);
  const guides = (sel: string) => page.locator(sel).first().evaluate((el) => {
    const op = (n: Element | null): number => { let o = 1; for (; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
    return [...el.querySelectorAll(':scope > .node-vguide')].map((g) => [(g as HTMLElement).style.left, op(g)]);
  });
  const entry = await guides('.thread-entry');
  expect(entry.length).toBeGreaterThan(0);
  expect(await guides('.thread-reply-link')).toEqual(entry);
});

test('grey thread: only an open question takes the accent colour; an answer reads under its question', async ({ page }) => {
  await seed(page, `
    remarks.push(
      { id: 'ask', anchorNodeId: 3, person: 'Gro', date: '2026-10-14', text: 'Does it make sense to use the shipping condition + plant combination?', type: 'question', createdAt: 10 },
      { id: 'mid', anchorNodeId: 3, person: 'Karsten', date: '2026-10-14', text: 'Scanning might be an issue too.', createdAt: 11 },
      { id: 'ans', anchorNodeId: 3, person: 'Robin', date: '2026-10-14', text: '', verdict: 'yes', answerTo: 'ask', createdAt: 12 },
      { id: 'open', anchorNodeId: 3, person: 'Gro', date: '2026-10-14', text: 'Who prints?', type: 'question', createdAt: 13 }
    );
  `);
  const accent = await page.evaluate(`getComputedStyle(document.body).getPropertyValue('--accent').trim()`) as string;
  const toRgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  // Row 2's thread has no open question: grey icon. Row 3 has one: accent icon.
  expect(await page.locator('.node-row[data-id="2"] .node-remark-dot').evaluate((e) => (e as HTMLElement).style.color)).toBe('var(--muted)');
  await expect(page.locator('.node-row[data-id="3"] .node-remark-dot')).toHaveCSS('color', toRgb(accent));
  // The header is quiet: not uppercase, not coloured.
  await expect(page.locator('.thread-head').first()).toHaveCSS('text-transform', 'none');

  // The Yes came two entries after its question, yet reads right under it (no quote needed).
  const order = await page.evaluate(`[...document.querySelectorAll('.thread-entry')].filter(e => e.querySelector('#inline-remark-text-ask, #inline-remark-text-mid, #inline-remark-text-ans, #inline-remark-text-open')).map(e => e.dataset.remarkId + (e.classList.contains('is-nested') ? '>' : ''))`);
  expect(order).toEqual(['ask', 'ans>', 'mid', 'open']);
  await expect(page.locator('.thread-quote')).toHaveCount(0);
  await expect(page.locator('.thread-entry:has(#inline-remark-text-ask) .thread-q-note')).toHaveText('· question, answered');
  await expect(page.locator('.thread-entry:has(#inline-remark-text-open) .thread-kind.is-question')).toHaveCSS('color', 'rgb(194, 85, 61)');
  await expect(page.locator('.thread-entry:has(#inline-remark-text-ask) .thread-kind.is-question')).not.toHaveCSS('color', 'rgb(194, 85, 61)');
});

test('Ctrl/Cmd+Alt+M opens a reply line in the selected row\'s thread', async ({ page }) => {
  await seed(page);
  await page.locator('.node-row[data-id="3"] .node-label').click();
  await page.keyboard.press('Escape');
  await page.evaluate('editingId = null; selectedId = 3; render();');
  await page.keyboard.press('Control+Alt+KeyM');
  await expect(page.locator('.thread-composer-input[data-node-id="3"]')).toBeFocused();
});

test('a follow-up names its owner (from its badge) in the open-items list', async ({ page }) => {
  const errors = await seed(page, `remarks.push({ id: 'k1', anchorNodeId: 3, person: 'Karsten', date: '2026-10-14', text: 'Script fails.', createdAt: 4, status: 'followup' });`);
  await page.locator('.node-row[data-id="3"] .node-marker-badge').click();
  await page.locator('.sb-context-menu').getByText('Assign follow-up', { exact: true }).hover();
  await page.locator('.sb-context-menu').getByText('Ana', { exact: true }).click();
  expect(await page.evaluate("nodes.find(n => n.id === 3).markerOwner")).toBe('Ana');
  await page.locator('#marker-summary .open-items-btn').click();
  await expect(page.locator('.open-items-menu .sb-context-item', { hasText: 'Data load' })).toHaveText(/^Data load · Ana/);
  expect(errors).toEqual([]);
});

test('open-items list: rows with the same name name their parent on the second line', async ({ page }) => {
  await seed(page);
  await page.evaluate(`
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Order types'), n(2, 1, 'Export'), n(3, 0, 'Plants'), n(4, 1, 'Export'), n(5, 1, 'Pick-up'), n(6, 1, 'Export')];
    nodes[1].marker = 'followup'; nodes[3].marker = 'followup'; nodes[4].marker = 'followup'; nodes[5].marker = 'followup';
    remarks = [{ id: 'k1', anchorNodeId: 2, person: 'Karsten', date: '2026-10-16', text: 'Check the plant.', createdAt: 1, status: 'followup' }];
    rebuildParentIds(); render();`);
  await page.locator('#marker-summary .open-items-btn').click();
  const rows = await page.locator('.open-items-menu .sb-context-item').evaluateAll((els) => els.map((el) => [
    (el.querySelector('.sb-context-label')?.firstChild?.textContent || '').trim(), el.querySelector('.sb-context-sub')?.textContent || '']));
  expect(rows).toEqual([
    ['Export', 'in Order types · Karsten: Check the plant.'],
    ['Export (1)', 'in Plants'], ['Pick-up', ''], ['Export (2)', 'in Plants']
  ]);
});

test('the "/" Insert list works in the reply line', async ({ page }) => {
  await seed(page);
  await page.evaluate('openThreadComposer(2, false)');
  const box = page.locator('.thread-composer-input[data-node-id="2"]');
  await box.click();
  await page.keyboard.type('A /');
  await expect(page.locator('#insert-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(box).toHaveText('A —');
});

test('the "/" Insert list works in the inline note; "and/or" stays a slash', async ({ page }) => {
  await seed(page);
  await page.evaluate("nodes[1].note = 'Note'; inlineExpandNoteNodeIds = new Set([2]); render()");
  const note = page.locator('.node-note-line[data-node-id="2"]');
  await note.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and/or');
  await expect(page.locator('#insert-menu')).toHaveCount(0);
  await page.keyboard.type(' /arr');
  await expect(page.locator('#insert-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(note).toContainText('Note and/or ➜');
  await expect(note).not.toContainText('/arr');
});

test('open-items list: a follow-up shows its thread\'s latest line; decisions have their own chip', async ({ page }) => {
  await seed(page, `remarks.push(
    { id: 'k1', anchorNodeId: 3, person: 'Karsten', date: '2026-10-14', text: 'Script fails on the EU file.', createdAt: 4, status: 'followup' },
    { id: 'd1', anchorNodeId: 2, person: 'Maria', date: '2026-10-14', text: 'Cut over on Saturday.', createdAt: 5, decision: true });`);
  await page.locator('#marker-summary .open-items-btn').click();
  const menu = page.locator('.open-items-menu');
  await expect(menu.locator('.sb-context-item', { hasText: 'Data load' }).locator('.sb-context-sub')).toHaveText('Karsten: Script fails on the EU file.');
  // Decisions aren't open items (owner, 2026-10-15): not in this list, but their own toolbar chip.
  await expect(menu).not.toContainText('Cut over on Saturday.');
  await page.locator('#marker-summary .open-items-btn').click();
  await expect(menu).toHaveCount(0);
  const chip = page.locator('#marker-summary .decisions-btn');
  await expect(chip).toHaveText('1 decision');
  await chip.click();
  const list = page.locator('.decisions-menu');
  await expect(list.locator('.sb-context-heading')).toHaveText('Decisions · 1');
  const item = list.locator('.sb-context-item', { hasText: 'Cut over on Saturday.' });
  await expect(item.locator('.sb-context-sub')).toHaveText('Cutover · Maria');
  await item.click();
  await expect(page.locator('#inline-remark-text-d1')).toBeFocused();
});

test('Backspace on an empty reply line closes it; with text it just deletes', async ({ page }) => {
  await seed(page);
  await page.evaluate('openThreadComposer(2, false)');
  const box = page.locator('.thread-composer-input[data-node-id="2"]');
  await box.click();
  await page.keyboard.type('ab');
  await page.keyboard.press('Backspace');
  await expect(box).toHaveText('a');
  await page.keyboard.press('Backspace');
  await expect(box).toHaveCount(1);
  await page.keyboard.press('Backspace');
  await expect(box).toHaveCount(0);
});

test('open-items list: Out of scope isn\'t listed (it isn\'t open)', async ({ page }) => {
  await seed(page);
  await page.evaluate("nodes[1].marker = 'followup'; nodes[2].marker = 'parked'; render()");
  await page.locator('#marker-summary .open-items-btn').click();
  const menu = page.locator('.open-items-menu');
  expect(await menu.locator('.sb-context-heading').allTextContents()).toEqual(['Follow-ups · 1']);
  await expect(menu).not.toContainText('Data load');
  await expect(menu.locator('.sb-context-fold')).toHaveCount(0);
});

test('Backspace on an emptied entry puts the caret at the end of the row text', async ({ page }) => {
  await seed(page, `remarks.push({ id: 'x1', anchorNodeId: 2, person: 'Ana', date: '2026-10-14', text: 'x', createdAt: 4 });`);
  const t = page.locator('#inline-remark-text-x1');
  await t.click();
  await page.keyboard.press('End');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(t).toHaveCount(0);
  expect(await page.evaluate('editingId')).toBe(2);
  await expect(page.locator('.thread-composer-input[data-node-id="2"]')).toHaveCount(0);
});

test('the input line has a right-click menu: make it a question, close', async ({ page }) => {
  await seed(page);
  await page.evaluate('openThreadComposer(2, false)');
  const box = page.locator('.thread-composer-input[data-node-id="2"]');
  await box.click();
  await page.keyboard.type('Is the window fixed?');
  await box.click({ button: 'right' });
  const menu = page.locator('.sb-context-menu');
  await expect(menu.locator('.sb-context-item').first()).toHaveText('Add to thread');
  await menu.getByText('Make it a question', { exact: true }).click();
  expect(await page.evaluate('_threadAskNodeIds.has(2)')).toBe(true);
  await expect(box).toHaveText('Is the window fixed?');
  await box.click({ button: 'right' });
  await menu.getByText('Close', { exact: true }).click();
  await expect(box).toHaveCount(0);
});

test('a name can be removed from the "Add as" list; writing as it brings it back', async ({ page }) => {
  await seed(page);
  await page.evaluate('openThreadComposer(2, false)');
  await page.locator('.thread-composer:has([data-node-id="2"]) .thread-author-btn').click();
  const menu = page.locator('.sb-context-menu');
  await menu.getByText('Remove from this list', { exact: true }).hover();
  await page.locator('.sb-context-submenu, .sb-context-menu').last().getByText('Ana', { exact: true }).click();
  expect(await page.evaluate('threadRecentAuthors()')).not.toContain('Ana');
  // Her entries stay as they are.
  await expect(page.locator('.thread-entry:has(#inline-remark-text-c1) .node-remark-person-inline')).toHaveText('Ana');
});

test('an entry\'s time can be corrected from its date popover, and the thread re-orders', async ({ page }) => {
  await seed(page, `remarks.push({ id: 't2', anchorNodeId: 2, person: 'Ana', date: '2026-10-14', text: 'Later note', createdAt: new Date(2026, 9, 14, 15, 0).getTime() });
    remarks[0].createdAt = new Date(2026, 9, 14, 10, 0).getTime(); remarks[0].date = '2026-10-14';`);
  await page.locator('.thread-entry:has(#inline-remark-text-t2) .thread-time').click();
  const time = page.locator('#remarks-date-pop-time');
  await expect(time).toHaveValue('15:00');
  await time.fill('09:30');
  await time.dispatchEvent('change');
  const h = await page.evaluate("(() => { const d = new Date(remarks.find(r => r.id === 't2').createdAt); return [d.getHours(), d.getMinutes()]; })()");
  expect(h).toEqual([9, 30]);
  // 09:30 now comes before the 10:00 entry.
  const order = await page.evaluate("nodeThread(2).map(r => r.id)") as string[];
  expect(order.indexOf('t2')).toBeLessThan(order.indexOf('c1'));
});

test('the entry date picker is the shared calendar: the chosen day is marked and a click sets it', async ({ page }) => {
  await seed(page, `remarks[0].date = '2026-10-14'; remarks[0].createdAt = new Date(2026, 9, 14, 10, 0).getTime();`);
  await page.locator('.thread-entry:has(#inline-remark-text-c1) .thread-time').click();
  const pop = page.locator('#remarks-date-popover');
  await expect(pop).toHaveClass(/open/);
  await expect(pop.locator('.due-pop-cal-day.selected')).toHaveAttribute('data-date', '2026-10-14');
  await pop.locator('.due-pop-cal-day[data-date="2026-10-20"]').click();
  expect(await page.evaluate("remarks.find(r => r.id === 'c1').date")).toBe('2026-10-20');
  await expect(pop).not.toHaveClass(/open/);
});
