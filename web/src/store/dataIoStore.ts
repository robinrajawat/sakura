import { create } from 'zustand';
import { idbDelete, idbGet, idbSet } from '../utils/idbKv';
import { buildBackupPayloadCore, snapshotLocalStorage, PRE_RESTORE_SNAPSHOT_KEY, type PreRestoreSnapshotEntry } from '../state/backupPayload';

/**
 * §6.8 slice: full whole-app JSON Export/Import -- direct port of legacy's real `exportAllData`/
 * `importAllDataFromFile`/`importAllDataFromPayload` (legacy/index.html:31947-32043), plus
 * "Undo last restore" (`restoreFromPreRestoreSnapshot`, legacy/index.html:31559-31573), the
 * safety net legacy's own real Settings row shows only after a restore has happened. Reuses the
 * exact same envelope (`buildBackupPayloadCore`/`SAKURA_EXPORT_FORMAT_VERSION`) tier 1's local
 * safety copy already writes -- an exported file, the safety copy, and a File System Access
 * auto-backup are all byte-shape-compatible with each other and with legacy's own real format.
 *
 * Export is a straight download -- build the payload, stringify, trigger a browser download as
 * `sakura-backup-<date>.json`, matching legacy's own filename pattern exactly.
 *
 * Import's real safety mechanics, ported faithfully: (1) validate the file parses as JSON with a
 * `data` object -- legacy's own real check is exactly this loose (no `_sakuraExport`/
 * `formatVersion` check at all, just "does this look like a backup shape"), not stricter;
 * (2) snapshot the CURRENT state into `PRE_RESTORE_SNAPSHOT_KEY` before overwriting anything, so
 * an import that turns out to be the wrong file is itself undoable; (3) clear and rewrite
 * localStorage; on a partial write failure (e.g. the new data doesn't fit in this browser's
 * quota), roll back by re-reading the snapshot just taken -- matching legacy's own real
 * mechanism exactly (it re-reads `preRestoreSnapshot` back from IndexedDB for the rollback
 * source, not a separately-held in-memory copy). Reloading the page on success is left to the
 * calling UI component, matching `backupStore.ts`'s own established store/UI split (its
 * `restoreFromSafetyCopy` doesn't call `location.reload()` either -- `BackupSettings.tsx`'s own
 * `handleRestore` does).
 *
 * `undoLastRestore` matches legacy's real `restoreFromPreRestoreSnapshot` exactly -- deliberately
 * WITHOUT the same rollback-on-failure staging import gets: legacy's own real implementation is a
 * plain `localStorage.clear()` + write in one try/catch, generic failure message on any error, no
 * second-level fallback. One level deep only, matching legacy's own real behavior verbatim ("it
 * holds only what was there before your most recent restore, not a full history") -- the
 * snapshot is deleted once consumed, and every restore path that writes one OVERWRITES the
 * previous snapshot rather than stacking.
 *
 * Confirmation dialogs live in the calling UI component, not here -- matching this project's own
 * established store/UI split (`backupStore.ts`'s tier-1 restore, `fsBackupStore.ts`'s disconnect
 * both confirm in `BackupSettings.tsx`, not in the store itself).
 *
 * Two real, deliberate simplifications vs. legacy: (1) no `preserveKeys`/secret-preservation
 * logic -- that's legacy's OWN cloud-restore call sites passing `CLOUD_UNSAFE_KEYS` (AI provider
 * keys, cloud backup tokens) so a cloud-sourced restore doesn't wipe out this browser's own
 * local secrets; `importAllDataFromFile` (the file-picker path this slice ports) always calls
 * with no `opts` at all, i.e. `preserveKeys` is already `[]` on legacy's own real file-import
 * path -- there is nothing to port here, not an omission. (2) no `SAKURA_JUST_RESTORED_KEY`/
 * cloud-pull-and-merge interaction guard -- that exists specifically for legacy's own
 * `pullAndMergeFromCloud`-on-reload mechanism, which has no equivalent in `web/`'s architecture
 * at all (`web/`'s cloud sync is per-document, triggered by `docSyncStore.ts`'s own `loadDoc`,
 * not a whole-app pull-and-merge on startup) -- a real architectural difference, not a gap.
 * Also NOT ported: the IndexedDB-overflow-store split (`localData`/`idbData`,
 * `IDB_BACKUP_KEY_PREFIX`) -- matching `backupPayload.ts`'s own already-documented
 * simplification, `web/` has no overflow store (no diagram blobs, no revision history in the
 * export payload itself) to split out.
 */

function download(filename: string, mimeType: string, content: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Snapshots current localStorage into the shared pre-restore slot -- called by every restore
 * path that's about to overwrite localStorage wholesale (this store's own import, and
 * `backupStore.ts`'s tier-1 safety-copy restore), so "Undo last restore" works after any of
 * them, matching legacy's real behavior where the same row appears after any restore path. */
export async function snapshotBeforeRestore(reason: string): Promise<void> {
  try {
    const entry: PreRestoreSnapshotEntry = { payload: buildBackupPayloadCore(snapshotLocalStorage(), Date.now()), savedAt: Date.now(), reason };
    await idbSet(PRE_RESTORE_SNAPSHOT_KEY, entry);
  } catch {
    // Best-effort -- a failed pre-restore snapshot shouldn't block the restore itself; it just
    // means "Undo last restore" won't have anything to offer afterward.
  }
}

function writeLocalStorageEntries(data: Record<string, string>): boolean {
  for (const [key, value] of Object.entries(data)) {
    try {
      localStorage.setItem(key, value);
    } catch {
      return false;
    }
  }
  return true;
}

export type ImportOutcome = 'ok' | 'invalid' | 'failed' | 'rolled-back';

interface DataIoState {
  preRestoreAvailable: boolean;
  preRestoreSavedAt: number | null;
  preRestoreReason: string | null;
  refreshUndoStatus: () => Promise<void>;
  exportAll: () => void;
  importFromFile: (file: File) => Promise<ImportOutcome>;
  undoLastRestore: () => Promise<boolean>;
}

export const useDataIoStore = create<DataIoState>((set) => ({
  preRestoreAvailable: false,
  preRestoreSavedAt: null,
  preRestoreReason: null,

  refreshUndoStatus: async () => {
    try {
      const entry = await idbGet<PreRestoreSnapshotEntry>(PRE_RESTORE_SNAPSHOT_KEY);
      set({ preRestoreAvailable: !!entry, preRestoreSavedAt: entry?.savedAt ?? null, preRestoreReason: entry?.reason ?? null });
    } catch {
      set({ preRestoreAvailable: false, preRestoreSavedAt: null, preRestoreReason: null });
    }
  },

  exportAll: () => {
    const payload = buildBackupPayloadCore(snapshotLocalStorage(), Date.now());
    const dateStr = new Date().toISOString().slice(0, 10);
    download(`sakura-backup-${dateStr}.json`, 'application/json', JSON.stringify(payload, null, 2));
  },

  importFromFile: async (file) => {
    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      return 'invalid';
    }
    if (!payload || typeof payload !== 'object' || !('data' in payload) || typeof (payload as { data: unknown }).data !== 'object') {
      return 'invalid';
    }
    const data = (payload as { data: Record<string, string> }).data;
    await snapshotBeforeRestore('restore from backup file');
    localStorage.clear();
    if (writeLocalStorageEntries(data)) {
      return 'ok';
    }
    let rolledBack = false;
    try {
      const snap = await idbGet<PreRestoreSnapshotEntry>(PRE_RESTORE_SNAPSHOT_KEY);
      if (snap?.payload?.data) {
        localStorage.clear();
        writeLocalStorageEntries(snap.payload.data);
        rolledBack = true;
      }
    } catch {
      // fall through -- rolledBack stays false
    }
    return rolledBack ? 'rolled-back' : 'failed';
  },

  undoLastRestore: async () => {
    let entry: PreRestoreSnapshotEntry | undefined;
    try {
      entry = await idbGet<PreRestoreSnapshotEntry>(PRE_RESTORE_SNAPSHOT_KEY);
    } catch {
      return false;
    }
    if (!entry?.payload?.data) return false;
    try {
      localStorage.clear();
      if (!writeLocalStorageEntries(entry.payload.data)) return false;
      await idbDelete(PRE_RESTORE_SNAPSHOT_KEY);
      return true;
    } catch {
      return false;
    }
  }
}));
