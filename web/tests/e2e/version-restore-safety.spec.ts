// @ts-nocheck -- the page's own globals (let bindings, not window properties) are used bare.
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Owner 2026-11-25: "data loss after restoring a version or touch editing on the iPhone".
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sakura_welcome_seen', '1');
    sessionStorage.setItem('sakura_landing_dismissed', 'true');
  });
  await page.goto('file://' + indexPath);
  await page.waitForFunction('typeof render === "function" && typeof nodes !== "undefined"');
  await page.evaluate(() => {
    document.getElementById('sakura-landing-overlay')?.style.setProperty('display', 'none');
    document.getElementById('welcome-overlay')?.classList.remove('open');
    ensureDocumentForEditing(); // not createDoc(): a new document focuses its title a moment later
  });
});

test('a row is saved while you are still typing in it', async ({ page }) => {
  const id = await page.evaluate(() => {
    nodes = [normalizeNode({ id: 1, text: 'first', depth: 0 })];
    markDirty(); saveToStorage(); clearTimeout(autoSaveTimer); render(); beginEditAt(1, -1);
    return currentDocId;
  });
  await expect(page.locator('#in-1')).toBeFocused();
  await page.keyboard.type(' and more words', { delay: 10 });
  await expect.poll(() => page.evaluate((id) => {
    return JSON.parse(localStorage.getItem(docKey(id)) || '{}').nodes?.[0]?.text;
  }, id)).toBe('first and more words');
  expect(await page.evaluate(() => editingId)).toBe(1);
});

test('a thread entry deleted after a version comes back on restore and survives the next merge', async ({ page }) => {
  const r = await page.evaluate(async () => {
    nodes = [normalizeNode({ id: 1, text: 'row', depth: 0 })];
    remarks = [{ id: 'r1', anchorNodeId: 1, text: 'keep me', createdAt: 1 }];
    markDirty(); saveToStorage();
    await recordDocRevision(currentDocId, currentDocRevisionContent(), 'Manual checkpoint', { name: 'v' });
    noteRemarksDeleted(remarks); remarks = []; markDirty(); saveToStorage();
    const revs = await loadDocRevisions(currentDocId);
    await restoreDocRevision(currentDocId, revs[revs.length - 1].ts);
    // Another device that saw the deletion merges this copy.
    const m = mergeThreadEntries(remarks, {}, [], docRemarkTombstones(currentDocId), [1], Date.now());
    return { texts: remarks.map((x) => x.text), ids: remarks.map((x) => x.id), merged: m.remarks.map((x) => x.text) };
  });
  expect(r.texts).toEqual(['keep me']);
  expect(r.ids).not.toContain('r1');
  expect(r.merged).toEqual(['keep me']);
});

test('restoring a document that is not open sends it to the account and keeps unchanged diagram pictures', async ({ page }) => {
  const r = await page.evaluate(async () => {
    createDoc(); // a real document tab, so the second createDoc() below switches away from it
    nodes = [normalizeNode({ id: 1, text: 'row', depth: 0 })];
    diagrams = [{ id: 'dg1', title: '', xml: '<mxfile/>', previewSvg: 'data:image/svg+xml,pic', pageSvgs: [], pageCount: 1, note: '', anchorNodeId: 1, createdAt: 1, modifiedAt: 1, _hydrated: true }];
    markDirty(); saveToStorage();
    const docA = currentDocId;
    await new Promise((res) => setTimeout(res, 300)); // the diagram's own store write
    await recordDocRevision(docA, currentDocRevisionContent(), 'Manual checkpoint', { name: 'v' });
    nodes = [normalizeNode({ id: 1, text: 'row edited', depth: 0 })]; markDirty(); saveToStorage();
    createDoc();
    const queued = [];
    const orig = queueSync; queueSync = (kind, id) => { queued.push(kind + ':' + id); return orig(kind, id); };
    const revs = await loadDocRevisions(docA);
    await restoreDocRevision(docA, revs[revs.length - 1].ts);
    queueSync = orig;
    const blob = await idbGet('diagblob:' + docA + ':dg1');
    const stored = JSON.parse(localStorage.getItem(docKey(docA)) || '{}');
    return { queued: queued.includes('doc:' + docA), pic: blob && blob.previewSvg, text: stored.nodes[0].text, other: currentDocId !== docA };
  });
  expect(r.other).toBe(true);
  expect(r.text).toBe('row');
  expect(r.queued).toBe(true);
  expect(r.pic).toBe('data:image/svg+xml,pic');
});

test('a diagram restored to another drawing gets its picture redrawn even if it was redrawn before', async ({ page }) => {
  const tries = await page.evaluate(async () => {
    const seen = [];
    fetchDiagramPreviewFromAccount = async () => false;
    regenerateDiagramThumbnail = async (id) => { seen.push(findDiagram(id).xml); };
    diagrams = [{ id: 'dg1', xml: '<a/>', previewSvg: '', pageSvgs: [], _hydrated: true }];
    regenerateMissingDiagramPreviews();
    await new Promise((res) => setTimeout(res, 100));
    diagrams = [{ id: 'dg1', xml: '<b/>', previewSvg: '', pageSvgs: [], _hydrated: true }];
    regenerateMissingDiagramPreviews();
    regenerateMissingDiagramPreviews(); // same drawing again: not retried
    return new Promise((res) => setTimeout(() => res(seen), 200));
  });
  expect(tries).toEqual(['<a/>', '<b/>']);
});
