import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-16, iPhone, signed in, nothing else open: "why do I see saving status? Even though I
// have not changed anything at all" and "this document was changed on another device even when the
// document is not open anywhere". The account hands a document back with its keys in its own order,
// which read as a change, so just opening it sent it up again; and with two uploads close together,
// the first one's echo was taken for another device's.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  await page.evaluate(`
    createDoc();
    const n = (id, depth, text) => ({ id, depth, text, parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} });
    nodes = [n(1, 0, 'Plan'), n(2, 1, 'Step')]; rebuildParentIds(); nextId = 3; render(); saveToStorage();
    // Saved once more as the app shapes a document.
    saveToStorage();
    window.__queued = [];
    const q = queueSync; queueSync = function (kind, id) { window.__queued.push(kind + ':' + id); return q.apply(this, arguments); };
  `);
  return errors;
}

test('a document from the account, with its keys in another order, is not sent up again on opening', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(`
    const sortDeep = (v) => Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v;
    const key = 'sakura_doc_v1_' + currentDocId;
    localStorage.setItem(key, JSON.stringify(sortDeep(JSON.parse(localStorage.getItem(key)))));
    saveToStorage();
  `);
  expect(await page.evaluate('window.__queued.filter((k) => k.startsWith("doc:"))')).toEqual([]);
  // A real change still goes up.
  await page.evaluate(`nodes[0].text = 'Plan B'; saveToStorage();`);
  expect(await page.evaluate('window.__queued.filter((k) => k.startsWith("doc:"))')).toEqual([await page.evaluate('"doc:" + currentDocId')]);
  expect(errors).toEqual([]);
});

test('this device\'s own earlier upload, or a copy at the version it already has, is not "another device"', async ({ page }) => {
  const errors = await open(page);
  const result = await page.evaluate(`(async () => {
    const id = currentDocId;
    const copy = { ...JSON.parse(localStorage.getItem('sakura_doc_v1_' + id)), title: 'From the cloud' };
    // Two uploads close together: the first one's echo arrives after the second started.
    noteOwnPush('doc:' + id, 1000); noteOwnPush('doc:' + id, 2000); _lastPushedTs['doc:' + id] = 2000;
    const echo = await applyIncomingDocData(null, null, 'uid', id, { ...copy, updatedAt: 1000, rev: 4 }, true);
    // The version this device already has (its base rev).
    setDocBaseRev(id, 7);
    const same = await applyIncomingDocData(null, null, 'uid', id, { ...copy, updatedAt: Date.now() + 9999, rev: 7 }, true);
    return { echo, same, banner: !!document.querySelector('#cross-tab-banner.visible, #cross-tab-banner.open, #cross-tab-banner:not([hidden])[style*="flex"]') };
  })()`);
  expect(result).toEqual({ echo: false, same: false, banner: false });
  expect(await page.evaluate('crossTabWarningDocId')).not.toBe(await page.evaluate('currentDocId'));
  expect(errors).toEqual([]);
});

// Owner 2026-11-17: "When I expand a table on phone or any dot then it triggers a save? Why?" Folding
// is how the document is looked at, not an edit: kept with it here, sent with the next real edit.
test('folding a row or a table, or opening a dot, sends nothing to the account', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(`saveToStorage(); window.__queued = [];`); // the first save after start-up writes the settings once
  await page.evaluate(`toggleCollapse(1); collapsedTableNodeIds.add(2); inlineExpandNoteNodeIds.add(1); inlineExpandRemarksNodeIds.add(1); render(); saveToStorage();`);
  expect(await page.evaluate('window.__queued')).toEqual([]);
  // Kept here with the document.
  expect(await page.evaluate(`JSON.parse(localStorage.getItem('sakura_doc_v1_' + currentDocId)).collapsed`)).toEqual([1]);
  // The next real edit takes it along.
  await page.evaluate(`nodes[1].text = 'Step one'; saveToStorage();`);
  expect(await page.evaluate('window.__queued.filter((k) => k.startsWith("doc:")).length')).toBe(1);
  expect(errors).toEqual([]);
});
