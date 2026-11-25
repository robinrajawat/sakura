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
  await expect(items.nth(0)).toContainText('Draft · preview it before adding');
  await expect(items.nth(1)).not.toHaveClass(/notif-from-assistant/);
  await expect(items.nth(1).getByRole('button', { name: 'Add to my documents' })).toBeVisible();
  await expect(items.nth(0).getByRole('button', { name: 'Add to my documents' })).toHaveCount(0);

  await items.nth(0).getByRole('button', { name: 'Preview' }).click();
  const dlg = page.locator('#draft-preview-overlay');
  await expect(dlg).toHaveClass(/open/);
  await expect(page.locator('#draft-preview-title')).toHaveText('Kickoff notes');
  await expect(page.locator('#draft-preview-sub')).toHaveText('From your AI assistant · 3 rows · 1 table · 1 diagram · 1 follow-up · Draft');
  await expect(dlg.locator('.history-preview-row', { hasText: 'Migrate CRM data' })).toContainText('Follow-up · note');
  await expect(dlg.locator('.history-preview-row', { hasText: 'Systems' })).toContainText('table · diagram');
  await dlg.screenshot({ path: test.info().outputPath('draft-preview.png') });

  await page.click('#draft-preview-add');
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
  await page.click('#draft-preview-decline');
  await expect(page.locator('#draft-preview-overlay')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => loadDocsIndex().length)).toBe(before);
});
