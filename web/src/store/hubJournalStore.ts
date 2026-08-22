import { create } from 'zustand';
import {
  normalizeJournalEntryCore,
  loadJournalLocalCore,
  saveJournalEntriesCore,
  initHubJournalState,
  type JournalEntry
} from '../state/hubJournal';
import { generateId } from '../utils/generateId';

// Matches legacy's own real mood list (hub.html), kept here since no settings/preferences
// panel exists yet in web/ to source it from elsewhere.
export const VALID_MOODS = ['great', 'good', 'okay', 'low', 'rough'];

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

// Real dependencies for the ported hubJournal.ts core. idbGet/idbSet are a localStorage-backed
// Promise shim, not real IndexedDB (see this file's own header). Cloud sync hooks are no-ops,
// same "no backend exists yet" reasoning as hubTodosStore.ts.
initHubJournalState({
  idbGet: (key) =>
    Promise.resolve().then(() => {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : null;
    }),
  idbSet: (key, value) =>
    Promise.resolve()
      .then(() => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
        return true;
      })
      .catch(() => false),
  bumpSyncTimestamp: () => {},
  pushMetaToCloud: () => {},
  now: () => Date.now(),
  today: todayString,
  generateJournalId: () => generateId('journal')
});

interface HubJournalState {
  entries: JournalEntry[];
  loaded: boolean;
  load: () => Promise<void>;
  addEntry: (body: string, mood: string, tags: string[]) => void;
  removeEntry: (id: string) => void;
}

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub Journal. Wraps the real ported
 * normalizeJournalEntryCore/loadJournalLocalCore/saveJournalEntriesCore (Phase 1, unused until
 * now). Create/delete only -- editing an existing entry is deferred, a real, separately-scoped
 * follow-up.
 */
export const useHubJournalStore = create<HubJournalState>((set, get) => ({
  entries: [],
  loaded: false,

  load: async () => {
    const entries = await loadJournalLocalCore(VALID_MOODS);
    set({ entries, loaded: true });
  },

  addEntry: (body, mood, tags) => {
    const entry = normalizeJournalEntryCore({ body, mood, tags }, VALID_MOODS);
    const entries = [...get().entries, entry];
    set({ entries });
    saveJournalEntriesCore(entries);
  },

  removeEntry: (id) => {
    const entries = get().entries.filter((e) => e.id !== id);
    set({ entries });
    saveJournalEntriesCore(entries);
  }
}));
