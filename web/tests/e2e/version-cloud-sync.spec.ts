import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Versions reach the account even when they're big or the upload fails (owner 2026-11-17: close
// the last places where work lives on one device only; docs/data-safety-audit.md). The account is a
// small in-page stand-in for Firestore with the calls the app uses.

const KNOWN_NOISE = /ServiceWorker|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|embed\.diagrams\.net|CORS policy|Failed to load resource|net::ERR/i;

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => { if (!KNOWN_NOISE.test(err.message)) errors.push(err.message); });
  await page.addInitScript(() => { try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ } });
  await page.goto('file://' + indexPath);
  await expect.poll(() => page.evaluate('typeof render === "function"')).toBe(true);
  await page.evaluate(`
    createDoc();
    nodes = [{ id: 1, depth: 0, text: 'Plan', parentId: null, isCheckbox: false, checked: false, note: '', tables: [], images: [], tags: [], styles: {} }];
    rebuildParentIds(); nextId = 2; render(); saveToStorage();
    queueSync = () => {}; // only versions talk to the stand-in account here
    window.__store = new Map(); window.__failWrites = false;
    const fake = {
      collection: (db, ...p) => ({ path: p.join('/') }),
      doc: (db, ...p) => ({ path: p.join('/') }),
      setDoc: async (ref, data) => { if (window.__failWrites) throw new Error('offline'); window.__store.set(ref.path, JSON.parse(JSON.stringify(data))); },
      where: (f, op, v) => ({ f, v }),
      query: (col, w) => ({ col, w }),
      getDocs: async (q) => {
        const col = q.col || q, w = q.w;
        const docs = [...window.__store].filter(([p, d]) => p.startsWith(col.path + '/') && !p.slice(col.path.length + 1).includes('/') && (!w || d[w.f] === w.v))
          .map(([p, d]) => ({ id: p.slice(col.path.length + 1), ref: { path: p }, data: () => d }));
        return { empty: !docs.length, docs };
      },
      writeBatch: () => { const del = []; return { delete: (ref) => del.push(ref.path), commit: async () => del.forEach((p) => window.__store.delete(p)) }; },
    };
    firestoreMods = { mod: fake, db: {} };
    currentUser = { uid: 'u1' };
  `);
  return errors;
}
const records = (page: Page) => page.evaluate(`[...window.__store.keys()].map((k) => k.split('/').pop()).sort()`) as Promise<string[]>;

test('a version too big for one record reaches the account in parts, reads back whole, and is removed whole', async ({ page }) => {
  const errors = await open(page);
  const ts = await page.evaluate(`(async () => {
    const big = { nodes: [{ id: 1, depth: 0, text: 'x'.repeat(1500000), parentId: null }], title: 'Big' };
    await recordDocRevision(currentDocId, big, 'Manual');
    await new Promise((r) => setTimeout(r, 200));
    const list = await loadDocRevisions(currentDocId);
    return list[list.length - 1].ts;
  })()`) as number;
  await expect.poll(() => records(page)).toContain(String(ts)); // the upload runs on its own
  const recs = await records(page);
  expect(recs.filter((r) => r.startsWith(ts + '~')).length).toBeGreaterThan(1);
  // Another device (this one, with its own list emptied) reads it back whole.
  const back = await page.evaluate(`(async () => {
    await saveDocRevisions(currentDocId, []);
    await syncDocVersionsWithCloud(currentDocId);
    const list = await loadDocRevisions(currentDocId);
    return list.map((v) => [v.ts, v.nodes[0].text.length]);
  })()`);
  expect(back).toEqual([[ts, 1500000]]);
  // Removed: the head and every part go.
  await page.evaluate(`pushDocVersionsToCloud(currentDocId, [], [${ts}])`);
  expect(await records(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('a version whose upload failed is sent after the next successful sync', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(`window.__failWrites = true`);
  const ts = await page.evaluate(`(async () => {
    await recordDocRevision(currentDocId, { nodes: [{ id: 1, depth: 0, text: 'Mine', parentId: null }], title: 'T' }, 'Your changes on this device');
    await new Promise((r) => setTimeout(r, 200));
    const list = await loadDocRevisions(currentDocId);
    return list[list.length - 1].ts;
  })()`) as number;
  await expect.poll(() => page.evaluate(`JSON.parse(localStorage.getItem('sakura_version_push_pending_v1') || '{}')[currentDocId]`)).toEqual([ts]);
  expect(await records(page)).toEqual([]);
  // Back online: the next sync's retry sends it, and forgets it.
  await page.evaluate(`window.__failWrites = false`);
  await page.evaluate(`retryPendingVersionPushes()`);
  await expect.poll(() => records(page)).toEqual([String(ts)]);
  expect(await page.evaluate(`localStorage.getItem('sakura_version_push_pending_v1')`)).toBe('{}');
  expect(errors).toEqual([]);
});
