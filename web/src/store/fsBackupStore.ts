import { create } from 'zustand';
import { idbDelete, idbGet, idbSet } from '../utils/idbKv';
import { buildBackupPayloadCore, snapshotLocalStorage } from '../state/backupPayload';

/**
 * §6.8 slice: tier 2 of legacy's real two-tier backup layer -- auto-backup to a live file on
 * disk via the File System Access API, direct port of legacy's real `initFsBackup`/
 * `connectFsBackup`/`reconnectFsBackup`/`disconnectFsBackup`/`writeFsBackupNow`
 * (legacy/index.html:31336-31474). Chrome/Edge only (`window.showSaveFilePicker` doesn't exist
 * elsewhere) -- `supported` is checked once and surfaces as `status:'unsupported'` everywhere
 * else, matching legacy's own real graceful degradation (a disabled "Connect…" button, not a
 * crash or a hidden feature).
 *
 * The actual `FileSystemFileHandle` is kept as a module-level variable (`fsHandle` below), NOT
 * Zustand state -- same "opaque, non-serializable object lives outside the store" convention
 * `docSyncStore.ts`'s own `rawNodesById`/`unsubscribe` already established; putting a live
 * browser handle into React state would invite accidental serialization/comparison bugs for no
 * benefit, since nothing needs to react to the handle ITSELF changing, only `status`/`fileName`.
 * The handle is persisted across reloads the same way legacy's own does: written to the SAME
 * `sakura_backup_db`/`kv` IndexedDB store tier 1's safety copy already uses (`utils/idbKv.ts`),
 * under the key `'fsHandle'` -- `FileSystemFileHandle` objects are structured-cloneable, so
 * IndexedDB can store the live handle itself, not just a serialized reference to it.
 *
 * `init()`'s own 150ms-then-retry-once guard against the real startup race legacy's own comment
 * describes (this store's `init()` and `backupStore.ts`'s tier-1 `init()` both fire unawaited at
 * nearly the same tick from `BackupSettings.tsx`'s mount effect) is ported verbatim, not
 * invented -- cheap insurance (~150ms only in the failure path, which currently means a full
 * re-pick dialog anyway).
 *
 * Deliberately NOT built in this slice: the status-bar chip surface (legacy's OTHER real
 * indicator for this feature, `sb-fs-status-chip`, separate from its Settings-panel row) --
 * `web/`'s status bar already has one real precedent for this kind of chip (the auto-rewrite
 * status chip, §6.9), so adding a second isn't a new architectural gap, just more surface than
 * this slice's own scope covers; the Settings-panel Connect/Disconnect/Backup-now row is the
 * primary control surface either way. Also deliberately NOT built: `rotateFsBackupHistory`
 * (legacy keeps up to 5 timestamped snapshots in IndexedDB alongside the live file, so a bad
 * edit backed up before being noticed isn't unrecoverable) and `checkBackupReminder`'s "you
 * haven't backed up in N days" periodic nag -- both genuinely separate capabilities layered on
 * top of the live single-file write this slice builds, matching the same "core mechanism now,
 * point-in-time recovery/reminders later" scoping call tier 1's own slice already made for
 * `preRestoreSnapshot`/"Undo last restore". Also NOT built: Gist/Drive cloud auto-push (legacy's
 * OTHER backup channels entirely, `scheduleGistAutoPush`/`scheduleDriveAutoPush`) -- unrelated
 * to the File System Access API, a real, separately-scoped follow-up.
 */

export type FsBackupStatus = 'unsupported' | 'disconnected' | 'connected' | 'permission-needed' | 'handle-lost';

const FS_HANDLE_KEY = 'fsHandle';
const FS_BACKUP_CONNECTED_FLAG = 'sakura_fsBackupConnected';

const supported = typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function';

let fsHandle: FileSystemFileHandle | null = null;

interface FsBackupState {
  status: FsBackupStatus;
  fileName: string | null;
  lastBackedUpAt: number | null;
  supported: boolean;
  init: () => Promise<void>;
  connect: () => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  writeNow: () => Promise<void>;
}

export const useFsBackupStore = create<FsBackupState>((set, get) => ({
  status: supported ? 'disconnected' : 'unsupported',
  fileName: null,
  lastBackedUpAt: null,
  supported,

  init: async () => {
    if (!supported) {
      set({ status: 'unsupported' });
      return;
    }
    const wasConnected = localStorage.getItem(FS_BACKUP_CONNECTED_FLAG) === '1';
    let handle = (await idbGet<FileSystemFileHandle>(FS_HANDLE_KEY)) ?? null;
    if (!handle) {
      // Guard against a possible startup-only timing race (this store's own init() and
      // backupStore.ts's tier-1 init() both fire unawaited at nearly the same tick): before
      // concluding the handle is genuinely gone, wait one tick and try exactly once more.
      await new Promise((r) => setTimeout(r, 150));
      handle = (await idbGet<FileSystemFileHandle>(FS_HANDLE_KEY)) ?? null;
    }
    if (!handle) {
      set({ status: wasConnected ? 'handle-lost' : 'disconnected', fileName: null });
      return;
    }
    fsHandle = handle;
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        set({ status: 'connected', fileName: handle.name });
        return;
      }
    } catch {
      // fall through to permission-needed below
    }
    set({ status: 'permission-needed', fileName: handle.name });
  },

  connect: async () => {
    if (!supported || !window.showSaveFilePicker) return;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'sakura-backup.json',
        types: [{ description: 'Sakura backup', accept: { 'application/json': ['.json'] } }]
      });
      fsHandle = handle;
      await idbSet(FS_HANDLE_KEY, handle);
      localStorage.setItem(FS_BACKUP_CONNECTED_FLAG, '1');
      set({ status: 'connected', fileName: handle.name });
      await get().writeNow();
    } catch (err) {
      // AbortError -- the person closed the file picker without choosing anything, not a
      // real failure worth surfacing.
      if (err instanceof Error && err.name === 'AbortError') return;
      console.warn('[sakura] connectFsBackup failed:', err);
    }
  },

  reconnect: async () => {
    if (!fsHandle) {
      await get().connect();
      return;
    }
    try {
      const perm = await fsHandle.requestPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        set({ status: 'connected', fileName: fsHandle.name });
        await get().writeNow();
      } else {
        set({ status: 'permission-needed' });
      }
    } catch (err) {
      console.warn('[sakura] reconnectFsBackup failed:', err);
      set({ status: 'permission-needed' });
    }
  },

  disconnect: async () => {
    fsHandle = null;
    await idbDelete(FS_HANDLE_KEY);
    localStorage.removeItem(FS_BACKUP_CONNECTED_FLAG);
    set({ status: 'disconnected', fileName: null });
  },

  writeNow: async () => {
    if (!fsHandle || get().status !== 'connected') return;
    try {
      const payload = buildBackupPayloadCore(snapshotLocalStorage(), Date.now());
      const writable = await fsHandle.createWritable();
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
      set({ lastBackedUpAt: Date.now() });
    } catch (err) {
      console.warn('[sakura] writeFsBackupNow failed:', err);
      set({ status: 'permission-needed' });
    }
  }
}));
