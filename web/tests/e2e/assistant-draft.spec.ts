// @ts-nocheck -- the page's own globals (let bindings, not window properties) are used bare.
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// A draft your AI assistant sent (send_document, docs/mcp-plan.md): marked as from your assistant
// (sent with your own account, which no one else can), previewed before anything is added, added
// as a Draft, cleaned on the way in. A colleague's copy keeps one-tap Add.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof renderNotifList === "function"');
  await page.evaluate(() => {
    document.getElementById('welcome-overlay')?.classList.remove('open');
    const store = {};
    const mod = {
      collection: (_db, ...p) => p.join('/'),
      doc: (_db, ...p) => p.join('/'),
      getDoc: async (ref) => ({ exists: () => ref in store, data: () => store[ref] }),
      deleteDoc: async (ref) => { delete store[ref]; },
      updateDoc: async (ref, data) => { store[ref] = { ...store[ref], ...data }; }
    };
    window.__store = store;
    loadFirestoreMods = async () => ({ mod, db: {} });
    currentUser = { uid: 'me', email: 'me@example.com' };
    ensureDocumentForEditing();
    const draft = {
      title: 'Kickoff notes', docStatus: 'review', nodes: [
        { id: 1, text: 'Decisions', depth: 0, styles: { heading: 2 } },
        { id: 2, text: 'Migrate CRM data', depth: 1, marker: 'followup', note: '<p>Owner <img src=x onerror="window.__pwned=1">to confirm</p>' },
        { id: 3, text: 'Systems', depth: 0, tables: ['<table><tbody><tr><td>SAP</td></tr></tbody></table>'] }
      ], diagrams: [{ id: 'dg1', title: 'Flow', xml: '<mxfile/>', anchorNodeId: 3 }], remarks: []
    };
    store['copies/me/items/c1'] = { fromUid: 'me', fromDisplayName: 'Your AI assistant', title: 'Kickoff notes', doc: JSON.stringify(draft), createdAt: Date.now() };
    store['copies/me/items/c2'] = { fromUid: 'colleague', fromDisplayName: 'Ana', title: 'Plan', doc: JSON.stringify({ title: 'Plan', nodes: [{ id: 1, text: 'x', depth: 0 }] }), createdAt: Date.now() };
    notifItems = [
      { id: 'n1', type: 'doc_copy', fromUid: 'me', fromDisplayName: 'Your AI assistant', docTitle: 'Kickoff notes', docId: 'c1', createdAt: Date.now(), read: false },
      // Someone else naming themselves "Your AI assistant" is still just someone else.
      { id: 'n2', type: 'doc_copy', fromUid: 'colleague', fromDisplayName: 'Your AI assistant', docTitle: 'Plan', docId: 'c2', createdAt: Date.now() - 1000, read: false }
    ];
    toggleNotifMenu(true); renderNotifList();
  });
});

test('an assistant draft is marked, previewed, and added as a cleaned Draft', async ({ page }) => {
  const items = page.locator('.notif-item');
  await expect(items.nth(0)).toHaveClass(/notif-from-assistant/);
  await expect(items.nth(0)).toContainText('Your AI assistant sent you a draft: Kickoff notes');
  await expect(items.nth(0)).toContainText('Draft · not in your documents until you add it');
  await expect(items.nth(1)).not.toHaveClass(/notif-from-assistant/);
  // Every inbox document is previewed first, whoever sent it; no one-tap Add.
  for (const i of [0, 1]) {
    await expect(items.nth(i).getByRole('button', { name: 'Preview' })).toBeVisible();
    await expect(items.nth(i).getByRole('button', { name: 'Add to my documents' })).toHaveCount(0);
  }

  await items.nth(0).getByRole('button', { name: 'Preview' }).click();
  const dlg = page.locator('#inbox-preview-overlay');
  await expect(dlg).toHaveClass(/open/);
  await expect(page.locator('#inbox-preview-title')).toHaveText('Kickoff notes');
  await expect(page.locator('#inbox-preview-sub')).toHaveText('From your AI assistant · 3 rows · 1 table · 1 diagram · 1 follow-up · Draft');
  await expect(dlg.locator('.history-preview-row', { hasText: 'Migrate CRM data' })).toContainText('Follow-up · note');
  await expect(dlg.locator('.history-preview-row', { hasText: 'Systems' })).toContainText('table · diagram');
  await dlg.screenshot({ path: test.info().outputPath('draft-preview.png') });

  await page.click('#inbox-preview-add');
  await expect(dlg).not.toHaveClass(/open/);
  const added = await page.evaluate(() => {
    const id = notifItems.find((x) => x.id === 'n1')?.addedDocId;
    const d = JSON.parse(localStorage.getItem(docKey(id)) || '{}');
    return { status: d.docStatus, note: d.nodes[1].note, inboxGone: !('copies/me/items/c1' in window.__store), pwned: !!window.__pwned };
  });
  expect(added.status).toBe('draft');
  expect(added.note).not.toContain('onerror');
  expect(added.inboxGone).toBe(true);
  expect(added.pwned).toBe(false);
});

test('Decline from the preview removes the draft; nothing is added', async ({ page }) => {
  await page.locator('.notif-item').nth(0).getByRole('button', { name: 'Preview' }).click();
  const before = await page.evaluate(() => loadDocsIndex().length);
  await page.click('#inbox-preview-decline');
  await expect(page.locator('#inbox-preview-overlay')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => loadDocsIndex().length)).toBe(before);
});

test('a colleague\'s copy is previewed too, keeps its own status, and is not marked as a draft', async ({ page }) => {
  await page.locator('.notif-item').nth(1).getByRole('button', { name: 'Preview' }).click();
  await expect(page.locator('#inbox-preview-sub')).toHaveText('From Your AI assistant · 1 row');
  await page.click('#inbox-preview-add');
  const status = await page.evaluate(() => { const id = notifItems.find((x) => x.id === 'n2')?.addedDocId; return JSON.parse(localStorage.getItem(docKey(id)) || '{}').docStatus || ''; });
  expect(status).toBe('');
});

test.describe('preview robustness', () => {
  const put = (page, doc) => page.evaluate((json) => {
    window.__store['copies/me/items/c1'] = { ...window.__store['copies/me/items/c1'], doc: json };
  }, typeof doc === 'string' ? doc : JSON.stringify(doc));
  const preview = async (page) => {
    await page.evaluate(() => { toggleNotifMenu(true); renderNotifList(); }); // Preview closes the menu
    await page.locator('.notif-item').nth(0).getByRole('button', { name: 'Preview' }).click();
  };

  test('a damaged inbox document says so and opens nothing', async ({ page }) => {
    await put(page, '{not json');
    await preview(page);
    await expect(page.locator('#toast')).toContainText('Could not open this document');
    await expect(page.locator('#inbox-preview-overlay')).not.toHaveClass(/open/);
  });

  test('an empty document and odd row values still show', async ({ page }) => {
    await put(page, { title: 'Odd', nodes: [null, 'x', { id: 1, text: 42, depth: 'deep', styles: null, tables: 'no' }] });
    await preview(page);
    await expect(page.locator('#inbox-preview-sub')).toContainText('1 row');
    await expect(page.locator('#inbox-preview-body .history-preview-row')).toHaveCount(1);
    await page.click('#inbox-preview-close-x');
    await put(page, { title: 'Empty' });
    await preview(page);
    await expect(page.locator('#inbox-preview-body')).toContainText('This document is empty.');
  });

  test('a very long document shows its first 300 rows and says how many more', async ({ page }) => {
    await put(page, { title: 'Long', nodes: Array.from({ length: 350 }, (_, i) => ({ id: i + 1, text: 'Row ' + i, depth: 0 })) });
    await preview(page);
    await expect(page.locator('#inbox-preview-body .history-preview-row')).toHaveCount(300);
    await expect(page.locator('#inbox-preview-body')).toContainText('…and 50 more rows');
  });

  test('if adding fails the preview stays open to try again; outside click closes it', async ({ page }) => {
    await preview(page);
    await page.evaluate(() => { delete window.__store['copies/me/items/c1']; }); // added on another device meanwhile
    await page.click('#inbox-preview-add');
    await expect(page.locator('#toast')).toContainText('already added or is no longer available');
    await expect(page.locator('#inbox-preview-overlay')).toHaveClass(/open/);
    await expect(page.locator('#inbox-preview-add')).toBeEnabled();
    await page.mouse.click(5, 5);
    await expect(page.locator('#inbox-preview-overlay')).not.toHaveClass(/open/);
  });
});

test.describe('never a duplicate, never a corrupt document', () => {
  test('Add twice at once, or again later, gives one document', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const n = notifItems.find((x) => x.id === 'n1');
      const before = loadDocsIndex().length;
      await Promise.all([addSentCopyToMyDocs(n), addSentCopyToMyDocs(n)]);
      const once = loadDocsIndex().length - before;
      // The inbox item comes back (say another device re-sent the same one): still the same document.
      window.__store['copies/me/items/c1'] = { fromUid: 'me', title: 'Kickoff notes', doc: '{"title":"Kickoff notes","nodes":[]}', createdAt: 1 };
      delete n.addedDocId;
      await addSentCopyToMyDocs(n);
      return { once, after: loadDocsIndex().length - before, id: n.addedDocId };
    });
    expect(r.once).toBe(1);
    expect(r.after).toBe(1);
    expect(r.id).toBe('dcc1');
    await expect(page.locator('#toast')).toContainText('Already in your documents');
  });

  test('a corrupt document is repaired into a well-formed one', async ({ page }) => {
    const d = await page.evaluate(async () => {
      window.__store['copies/me/items/c1'].doc = JSON.stringify({
        title: 7,
        nodes: [{ id: 5, text: 'A', depth: 3 }, { id: 5, text: 'B', depth: 9 }, { text: 'C', depth: -2 }, 'junk', null],
        diagrams: [{ xml: '' }, { xml: '<mxfile/>', anchorNodeId: 999 }, 'x'],
        remarks: [{ id: 'r1', anchorNodeId: 5, text: '<p onclick="x()">hi</p>' }, { id: 'r2', anchorNodeId: 404, text: 'orphan' }]
      });
      const n = notifItems.find((x) => x.id === 'n1');
      await addSentCopyToMyDocs(n);
      return JSON.parse(localStorage.getItem(docKey(n.addedDocId)) || '{}');
    });
    expect(d.nodes.map((n) => [n.text, n.depth])).toEqual([['A', 0], ['B', 1], ['C', 0]]);
    const ids = d.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(3);
    expect(d.nextId).toBeGreaterThan(Math.max(...ids));
    expect(d.nodes[1].parentId).toBe(d.nodes[0].id);
    expect(d.diagrams).toHaveLength(1);
    expect(d.diagrams[0].anchorNodeId).toBe(d.nodes[0].id);
    expect(d.remarks.map((r) => r.id)).toEqual(['r1']);
    expect(d.remarks[0].text).not.toContain('onclick');
    expect(d.title).toBe('Kickoff notes');
  });
});
