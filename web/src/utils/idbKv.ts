/**
 * §6.8 slice (docs/phase6-full-parity-plan.md): a small raw IndexedDB key/value helper, direct
 * port of legacy's real `idbOpen`/`idbGet`/`idbSet` (legacy/index.html:31287-31305) -- same
 * database/store names (`sakura_backup_db`/`kv`), same memoized-open-connection pattern (legacy's
 * own comment there explains why: without memoizing, two callers opening around the same tick
 * each get their own raw connection to the same database, a known source of subtle IndexedDB
 * race conditions across browsers). Raw `indexedDB` API, no library -- legacy doesn't use one
 * either, and the surface needed here (get/set on one object store) is small enough not to
 * justify a new dependency.
 *
 * Scoped down from legacy's own fuller helper set: no `idbDelete`/`idbGetAllKeys` yet, since
 * this slice's only caller (`backupStore.ts`) never needs to delete or enumerate keys -- real,
 * separately-scoped additions whenever a caller actually needs them (e.g. a future "overflow
 * store" for diagram blobs, matching legacy's own use of this same database for that).
 */

const DB_NAME = 'sakura_backup_db';
const STORE_NAME = 'kv';

let connPromise: Promise<IDBDatabase> | null = null;

function idbOpen(): Promise<IDBDatabase> {
  if (connPromise) return connPromise;
  connPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      connPromise = null;
      reject(new Error('IndexedDB unavailable in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        connPromise = null;
      };
      db.onversionchange = () => {
        db.close();
        connPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      connPromise = null;
      reject(req.error);
    };
  });
  return connPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

// Never reject on failure (matches legacy's own `idbSet`, which swallows into a `false` return
// rather than throwing) -- a failed backup write is a real problem worth logging, but it should
// never be able to interrupt whatever real edit-flow code path triggered it.
export async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return false;
  }
}
