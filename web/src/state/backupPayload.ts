/**
 * §6.8 slice (docs/phase6-full-parity-plan.md): the "local safety copy" half of legacy's real
 * two-tier backup layer (legacy/index.html:31270-31276's own comment: 1. auto-backup to file,
 * 2. an IndexedDB mirror of localStorage) -- this file is the pure envelope-building piece,
 * shared with `store/backupStore.ts` (the stateful IndexedDB read/write side). Matches legacy's
 * own real `buildFullBackupPayload` envelope shape and `SAKURA_EXPORT_FORMAT_VERSION` constant
 * exactly (legacy/index.html:8996,31328-31333), so a payload built here is byte-shape-compatible
 * with legacy's own backup/export format -- not a new, `web/`-only shape invented for this slice.
 *
 * One real, deliberate simplification vs. legacy: `buildFullBackupPayload` also folds in
 * IndexedDB "overflow store" entries (diagram blobs, meeting-note revisions, etc. -- legacy's own
 * `idbGetAllKeys`/`IDB_BACKUP_KEY_PREFIX` machinery) alongside plain localStorage keys; `web/` has
 * no such overflow store yet (no diagram blobs, no revision history), so this only ever snapshots
 * localStorage -- there is nothing else to include yet.
 */

export const SAKURA_EXPORT_FORMAT_VERSION = 1;

export interface BackupPayload {
  _sakuraExport: true;
  formatVersion: number;
  exportedAt: number;
  data: Record<string, string>;
}

/** Pure: wraps a plain localStorage key/value snapshot in the real export envelope. Takes the
 * snapshot as a plain object (rather than reading `localStorage` itself) so this stays testable
 * without a DOM/localStorage shim -- `snapshotLocalStorage` below does the actual reading. */
export function buildBackupPayloadCore(localStorageEntries: Record<string, string>, now: number): BackupPayload {
  return { _sakuraExport: true, formatVersion: SAKURA_EXPORT_FORMAT_VERSION, exportedAt: now, data: localStorageEntries };
}

/** The one non-pure piece in this file -- a real `localStorage` read, factored out here (rather
 * than duplicated in both `backupStore.ts` and `fsBackupStore.ts`, tier 1 and tier 2 of legacy's
 * real two-tier backup layer) so both stores can build the exact same snapshot independently
 * without importing each other -- `backupStore.ts`'s own debounce subscription triggers both
 * tiers from one shared timer (matching legacy's real `scheduleBackupWrite`, which calls
 * `mirrorToIndexedDb()` and `writeFsBackupNow()` together), which would be a circular import if
 * either store's own module needed to reach into the other's internals to get this. */
export function snapshotLocalStorage(): Record<string, string> {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) data[key] = localStorage.getItem(key) ?? '';
  }
  return data;
}

/** §6.8 slice: the shared IndexedDB key/shape for legacy's real "Undo last restore" safety net
 * (legacy/index.html:31560-31600's own `preRestoreSnapshot`) -- a single-slot (not a stack)
 * snapshot of whatever was in the app right before the MOST RECENT restore, written by every
 * restore path that can overwrite localStorage wholesale (tier 1's safety-copy restore in
 * `backupStore.ts`, and whole-app JSON import in `dataIoStore.ts`) and consumed by
 * `dataIoStore.ts`'s own `undoLastRestore`. Shared here, not duplicated per-store, so both
 * writers and the one reader agree on the exact key/shape without importing each other. */
export const PRE_RESTORE_SNAPSHOT_KEY = 'preRestoreSnapshot';

export interface PreRestoreSnapshotEntry {
  payload: BackupPayload;
  savedAt: number;
  reason: string;
}
