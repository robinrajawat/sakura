import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, '../../index.html');

// Version history synced across devices (owner 2026-11-02): each version is a cloud record under
// users/{uid}/docs/{docId}/versions/{ts}; opening History joins the cloud's versions with this
// device's. Firestore is replaced by an in-memory store keyed by path.
test('a version made on one device shows in History on another', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('sakura_welcome_seen', '1'); sessionStorage.setItem('sakura_landing_dismissed', 'true'); } catch { /* storage unavailable */ }
  });
  await page.goto('file://' + indexPath);
  const r = await page.evaluate(async () => {
    const store: Record<string, Record<string, unknown>> = {};
    const mod = {
      collection: (_db: unknown, ...p: string[]) => p.join('/'),
      doc: (_db: unknown, ...p: string[]) => p.join('/'),
      setDoc: async (ref: string, data: Record<string, unknown>) => { store[ref] = data; },
      getDoc: async (ref: string) => ({ exists: () => ref in store, data: () => store[ref] }),
      getDocs: async (col: string) => {
        const docs = Object.keys(store).filter((k) => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/'))
          .map((k) => ({ id: k.split('/').pop(), ref: k, data: () => store[k] }));
        return { empty: !docs.length, docs };
      },
      writeBatch: () => { const ops: (() => void)[] = []; return { delete: (ref: string) => ops.push(() => { delete store[ref]; }), set: (ref: string, d: Record<string, unknown>) => ops.push(() => { store[ref] = d; }), commit: async () => ops.forEach((f) => f()) }; },
      deleteDoc: async (ref: string) => { delete store[ref]; },
    };
    // @ts-expect-error -- bare globals from index.html
    loadFirestoreMods = async () => ({ mod, db: {} });
    // @ts-expect-error
    currentUser = { uid: 'alice', displayName: 'Alice' };
    // @ts-expect-error
    ensureDocumentForEditing();
    // @ts-expect-error
    const docId = currentDocId as string;
    // @ts-expect-error
    await recordDocRevision(docId, { nodes: [{ id: 1, depth: 0, text: 'From the laptop', parentId: null }], title: 'Plan' }, 'Manual checkpoint');
    await new Promise((res) => setTimeout(res, 200));
    const cloudKeys = Object.keys(store).filter((k) => k.startsWith('users/alice/docs/' + docId + '/versions/'));
    // Another device: no versions of its own.
    // @ts-expect-error
    await deleteDocRevisions(docId);
    // @ts-expect-error
    openVersionHistory(docId);
    await new Promise((res) => setTimeout(res, 300));
    const rows = [...document.querySelectorAll('#history-modal-body .history-row-meta')].map((e) => e.textContent);
    // @ts-expect-error
    const local = (await loadDocRevisions(docId)).length;
    return { cloudKeys: cloudKeys.length, rows, local, hint: document.getElementById('history-modal-footer-hint')?.textContent };
  });
  expect(r.cloudKeys).toBe(1);
  expect(r.local).toBe(1);
  expect(r.rows).toEqual(['Manual checkpoint · 1 row']);
  expect(r.hint).toContain('on all your devices');
});
