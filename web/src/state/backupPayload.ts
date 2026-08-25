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
 * without a DOM/localStorage shim -- `backupStore.ts`'s own `snapshotLocalStorage` does the
 * actual reading. */
export function buildBackupPayloadCore(localStorageEntries: Record<string, string>, now: number): BackupPayload {
  return { _sakuraExport: true, formatVersion: SAKURA_EXPORT_FORMAT_VERSION, exportedAt: now, data: localStorageEntries };
}
