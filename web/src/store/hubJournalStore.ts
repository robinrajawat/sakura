import { create } from 'zustand';
import {
  normalizeJournalEntryCore,
  loadJournalLocalCore,
  saveJournalEntriesCore,
  initHubJournalState,
  type JournalEntry
} from '../state/hubJournal';
import { generateId } from '../utils/generateId';

// Matches legacy's own real mood list exactly (hub.html:2374, index.html:48946). Previously had
// 'okay' where legacy has 'neutral' -- a real data-compat bug (any legacy entry synced with
// mood:'neutral' would silently normalize to '' here); fixed as part of this slice.
export const VALID_MOODS = ['great', 'good', 'neutral', 'low', 'rough'];

// Local-calendar-day formatting (not UTC), used consistently for "today"/date-grid math so the
// calendar popover's day cells never land off-by-one from what todayString() considers "today".
export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayString(): string {
  return formatDateLocal(new Date());
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

/** Finds the entry for `date`, creating (but not yet persisting) one if none exists -- matches
 * legacy's own `findOrCreateJournalEntry(date)` (index.html:48990-48993, hub.html), which is the
 * real access pattern the desktop editor uses: one entry per calendar date, not a freeform list. */
function findOrCreateEntry(entries: JournalEntry[], date: string): { entry: JournalEntry; entries: JournalEntry[] } {
  const existing = entries.find((e) => e.date === date);
  if (existing) return { entry: existing, entries };
  const created = normalizeJournalEntryCore({ date }, VALID_MOODS);
  return { entry: created, entries: [...entries, created] };
}

interface HubJournalState {
  entries: JournalEntry[];
  loaded: boolean;
  // The currently open single-entry card's date, or null for the list view -- matches legacy's
  // own journalExpandedDate (index.html:49188 area).
  expandedDate: string | null;
  load: () => Promise<void>;
  openEntry: (date: string) => void;
  closeEntry: () => void;
  toggleMood: (date: string, mood: string) => void;
  setBody: (date: string, bodyHtml: string) => void;
  removeEntry: (date: string) => void;
}

/**
 * Phase 6.5 slice (docs/phase6-full-parity-plan.md): Hub Journal depth -- editing, rich text,
 * and the calendar popover (see HubJournalPanel.tsx for the UI half). Replaces the Phase 4
 * placeholder's freeform create/delete-only list with legacy's real one-entry-per-date model:
 * opening or jumping to a date shows/creates that date's own entry (`findOrCreateEntry` above),
 * mood is click-again-to-clear, and every edit stamps `modifiedAt=Date.now()` directly (matching
 * legacy's own `j.modifiedAt=Date.now()` on every mood/body change, index.html:49202/49224) --
 * NOT re-run through normalizeJournalEntryCore, since that would also silently re-validate
 * already-valid fields on every keystroke for no reason.
 *
 * Deliberately still out of scope, same as before: tags UI (legacy itself has no tags UI for
 * Journal despite the data model and README both referencing it -- a pre-existing doc/code
 * mismatch, not something to build net-new here) and search (legacy's own Journal search lives
 * only in the shared Quick Assist / hub-wide search bar, neither of which exists in web/ yet --
 * a real, separately-scoped follow-up, not a parity gap unique to this panel).
 */
export const useHubJournalStore = create<HubJournalState>((set, get) => ({
  entries: [],
  loaded: false,
  expandedDate: null,

  load: async () => {
    const entries = await loadJournalLocalCore(VALID_MOODS);
    set({ entries, loaded: true });
  },

  openEntry: (date) => set({ expandedDate: date }),
  closeEntry: () => set({ expandedDate: null }),

  toggleMood: (date, mood) => {
    const { entry, entries } = findOrCreateEntry(get().entries, date);
    const nextMood = entry.mood === mood ? '' : mood;
    const updated = entries.map((e) => (e.id === entry.id ? { ...e, mood: nextMood, modifiedAt: Date.now() } : e));
    set({ entries: updated });
    saveJournalEntriesCore(updated);
  },

  setBody: (date, bodyHtml) => {
    const { entry, entries } = findOrCreateEntry(get().entries, date);
    const updated = entries.map((e) => (e.id === entry.id ? { ...e, body: bodyHtml, modifiedAt: Date.now() } : e));
    set({ entries: updated });
    saveJournalEntriesCore(updated);
  },

  removeEntry: (date) => {
    const entries = get().entries.filter((e) => e.date !== date);
    set({ entries, expandedDate: get().expandedDate === date ? null : get().expandedDate });
    saveJournalEntriesCore(entries);
  }
}));
