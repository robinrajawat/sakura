import { create } from 'zustand';
import { useOutlineStore } from './outlineStore';
import { idbGet, idbSet } from '../utils/idbKv';
import { buildBackupPayloadCore, snapshotLocalStorage, type BackupPayload } from '../state/backupPayload';
import { useFsBackupStore } from './fsBackupStore';

/**
 * §6.8 slice (docs/phase6-full-parity-plan.md): the "local safety copy" half of legacy's real
 * two-tier backup layer -- direct port of legacy's real `mirrorToIndexedDb`/
 * `updateSafetyCopyStatus`/`restoreFromIndexedDbMirror` (legacy/index.html:31532-31550), using
 * the SAME real IndexedDB key (`localStorageMirror`) and payload shape (`{payload, savedAt}`) so
 * a mirror written by this code is byte-shape-compatible with legacy's own.
 *
 * Debounced the same way the outline-edit cloud autosave (`docSyncStore.ts`, §6.8's own prior
 * slice) is: a `useOutlineStore.subscribe` listener, set up once from `init()` (called from
 * `App.tsx` on mount), queues a mirror write after edits settle. Legacy's own real debounce for
 * this (`scheduleBackupWrite`) is 1200ms, NOT the cloud sync's 1500ms (`queueSync`) -- two
 * genuinely different real constants in legacy, both ported faithfully rather than collapsed
 * into one shared number. `init()` also mirrors once immediately, matching legacy's own real
 * startup call (`mirrorToIndexedDb()` alongside `initFsBackup()` at the end of its own big
 * startup sequence) -- so a safety copy exists even for a session with zero edits, not only
 * after the first debounce fires.
 *
 * Two real, deliberate scope-downs vs. legacy's own fuller backup system: (1) only the
 * outline-edit trigger is wired, matching the same trade-off `docSyncStore.ts`'s own cloud
 * autosave already made -- `web/`'s data lives across several independent Zustand stores with no
 * single "anything changed" event the way legacy's one monolithic script has, and outline
 * content is the highest-value, highest-edit-frequency thing to protect; a change to, say, Hub
 * settings alone won't refresh the mirror until the next outline edit does. (2) No
 * `preRestoreSnapshot`/"Undo last restore" -- legacy snapshots the pre-restore state specifically
 * so that feature can undo a restore; without that feature built yet, snapshotting into an unused
 * key would just be dead writes, so it's skipped until "Undo last restore" is itself a real
 * scoped slice. Also NOT in this slice: Gist/Drive cloud backup -- a separately-scoped follow-up,
 * not attempted here.
 *
 * §6.8 slice 2: this store's own debounce subscription now also drives tier 2 (auto-backup to
 * file, `fsBackupStore.ts`) -- matching legacy's real `scheduleBackupWrite`, which calls
 * `mirrorToIndexedDb()` and `writeFsBackupNow()` together from the SAME 1200ms timer, not two
 * independent ones. `fsBackupStore`'s own `writeNow()` is a no-op unless a file is actually
 * connected, so this costs nothing for the (default) case where tier 2 was never set up.
 */

const SAFETY_COPY_KEY = 'localStorageMirror';
const MIRROR_DEBOUNCE_MS = 1200;

interface SafetyCopyEntry {
  payload: BackupPayload;
  savedAt: number;
}

interface BackupState {
  lastSavedAt: number | null;
  loaded: boolean;
  init: () => void;
  mirrorNow: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  restoreFromSafetyCopy: () => Promise<boolean>;
}

let mirrorTimer: ReturnType<typeof setTimeout> | null = null;

export const useBackupStore = create<BackupState>((set, get) => ({
  lastSavedAt: null,
  loaded: false,

  init: () => {
    if (get().loaded) return;
    set({ loaded: true });
    void get().refreshStatus();
    void get().mirrorNow();
    useOutlineStore.subscribe(() => {
      if (mirrorTimer) clearTimeout(mirrorTimer);
      mirrorTimer = setTimeout(() => {
        void get().mirrorNow();
        void useFsBackupStore.getState().writeNow();
      }, MIRROR_DEBOUNCE_MS);
    });
  },

  mirrorNow: async () => {
    const now = Date.now();
    const payload = buildBackupPayloadCore(snapshotLocalStorage(), now);
    const entry: SafetyCopyEntry = { payload, savedAt: now };
    const ok = await idbSet(SAFETY_COPY_KEY, entry);
    if (ok) set({ lastSavedAt: now });
  },

  refreshStatus: async () => {
    try {
      const entry = await idbGet<SafetyCopyEntry>(SAFETY_COPY_KEY);
      set({ lastSavedAt: entry?.savedAt ?? null });
    } catch {
      // IndexedDB unavailable in this environment -- leave lastSavedAt at its current value
      // (null on first load), same "fails safe, doesn't crash" posture as legacy's own
      // `updateSafetyCopyStatus`, which sets its note text to '' in the same situation.
    }
  },

  // Returns whether a safety copy actually existed to restore, so the caller (the Settings UI)
  // knows whether to show "nothing to restore" or proceed to reload -- matches legacy's own
  // `restoreFromIndexedDbMirror`'s early-return-with-toast shape, just returning a boolean
  // instead of calling a toast function directly (this store has no UI concerns of its own).
  restoreFromSafetyCopy: async () => {
    let entry: SafetyCopyEntry | undefined;
    try {
      entry = await idbGet<SafetyCopyEntry>(SAFETY_COPY_KEY);
    } catch {
      return false;
    }
    if (!entry?.payload?.data) return false;
    localStorage.clear();
    for (const [key, value] of Object.entries(entry.payload.data)) {
      localStorage.setItem(key, value);
    }
    return true;
  }
}));
