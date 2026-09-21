/**
 * Hub's Journal storage — entry normalization/validation, plus the IndexedDB-backed load/save
 * layer that the Journal panel in hub.html reads from and writes to.
 *
 * Second Hub feature-domain slice, same shape as `hubTodos.ts`'s To-Dos extraction. Journal
 * uses IndexedDB (`idbGet`/`idbSet`) rather than localStorage — mirroring index.html's own
 * exact data shape (same field names, same `jnUid()` id scheme, same `JOURNAL_KEY`) so entries
 * stay fully compatible with the desktop app's own store and cloud sync in both directions, per
 * hub.html's own comment on this domain.
 *
 * Deliberately excluded from this slice, and why:
 * - `findJournalEntry`/`findOrCreateJournalEntry` — trivial one-line-bodied ambient lookups
 *   (plus one call into `normalizeJournalEntryCore` for the "create" half), no real validation
 *   logic of their own to test, same reasoning as `getAllAiProviders` staying out of
 *   `aiProviders.ts`.
 * - `stripJournalHtml`/`journalSnippet` — genuinely DOM-dependent (`document.createElement`),
 *   not safely portable to a Node test environment without a DOM shim; not investigated here.
 * - `renderJournal`/`journalRowInnerHtml`/swipe-list DOM wiring — stays hand-written, same
 *   reasoning as `renderTodos` staying out of `hubTodos.ts`.
 *
 * Deliberately no module-level constant for the storage key string (`JOURNAL_KEY`) or the mood
 * enum (`JOURNAL_MOODS`): hub.html already declares both as top-level `var`s, still read
 * directly by sibling journal functions that remain hand-written. Since a generated block
 * shares hub.html's own script scope, redeclaring either name here would be a duplicate
 * declaration. Both are passed in as explicit parameters instead — `validMoods` for the mood
 * enum, the storage key inlined as a private constant with this comment documenting it must
 * stay in sync with hub.html's own copy.
 */

export interface JournalEntry {
  id: string;
  date: string;
  mood: string;
  tags: string[];
  body: string;
  createdAt: number;
  modifiedAt: number;
}

export interface HubJournalDeps {
  idbGet: (key: string) => Promise<unknown>;
  idbSet: (key: string, value: unknown) => Promise<boolean>;
  bumpSyncTimestamp: (metaKey: string) => void;
  pushMetaToCloud: (metaKey: string, value: unknown) => void;
  now: () => number;
  today: () => string;
  generateJournalId: () => string;
}

// Private to this module (deliberately NOT the same name as hub.html's own top-level
// JOURNAL_KEY — see this file's header comment for why they can't be shared).
const _JOURNAL_STORAGE_KEY = 'sakura_journal_v1';

let hubJournalDeps: HubJournalDeps | null = null;

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initHubJournalState(injected: HubJournalDeps): void {
  hubJournalDeps = injected;
}

function requireHubJournalDeps(): HubJournalDeps {
  if (!hubJournalDeps) throw new Error('hubJournal state used before initHubJournalState() was called');
  return hubJournalDeps;
}

/** Pure (given the injected id/date/time deps): normalizes a possibly-partial/possibly-corrupt
 * journal entry into a fully-valid one, matching the original's exact per-field validation —
 * an invalid or missing `date` falls back to today, an invalid `mood` falls back to `''` (not a
 * default mood), `tags` is filtered to non-empty trimmed strings and capped at 20, and
 * `createdAt`/`modifiedAt` fall back to "now" independently (not to each other) when missing or
 * non-finite. */
export function normalizeJournalEntryCore(
  j: Partial<JournalEntry> | null | undefined,
  validMoods: string[]
): JournalEntry {
  const d = requireHubJournalDeps();
  const now = d.now();
  return {
    id: j && typeof j.id === 'string' ? j.id : d.generateJournalId(),
    date: j && typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : d.today(),
    mood: j && validMoods.indexOf(j.mood as string) !== -1 ? (j.mood as string) : '',
    tags:
      j && Array.isArray(j.tags)
        ? j.tags
            .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            .map((t) => t.trim())
            .slice(0, 20)
        : [],
    body: j && typeof j.body === 'string' ? j.body : '',
    // Deliberately the coercive global isFinite, not Number.isFinite: matches hub.html's
    // original `isFinite(j.createdAt)` exactly, which type-coerces (e.g. a numeric string
    // survives), unlike the strict form.
    createdAt: j && isFinite(j.createdAt as unknown as number) ? (j.createdAt as number) : now,
    modifiedAt: j && isFinite(j.modifiedAt as unknown as number) ? (j.modifiedAt as number) : now
  };
}

/** Reads and normalizes the full journal entry list from IndexedDB. Resolves to `[]` on any
 * failure (missing store, corrupt data, IndexedDB unavailable) rather than rejecting, matching
 * the original's `.catch()`-to-empty-array behavior. Does NOT assign to any ambient global
 * itself — returns the resolved list for the caller (the hand-written wrapper) to assign,
 * since that assignment is the one real side effect beyond storage the original had. */
export function loadJournalLocalCore(validMoods: string[]): Promise<JournalEntry[]> {
  const d = requireHubJournalDeps();
  return d
    .idbGet(_JOURNAL_STORAGE_KEY)
    .then((arr) => (Array.isArray(arr) ? arr.map((entry) => normalizeJournalEntryCore(entry, validMoods)) : []))
    .catch(() => []);
}

/** Writes the full journal entry list and fires the same two real side effects the original
 * did — bumping the local sync timestamp and pushing to cloud sync — both injected, both fired
 * synchronously and UNCONDITIONALLY (matching the original: the `idbSet` promise's eventual
 * rejection doesn't gate these two calls, since the original never awaited it before running
 * them). Returns the `idbSet` promise itself rather than swallowing it, so the hand-written
 * wrapper can attach its own `.catch()` for the "device storage may be full" toast — the
 * original's own inline `.catch()` callback is DOM/UI (`showToast`), so it stays out of this
 * module, same split as every other slice. */
export function saveJournalEntriesCore(journalEntries: JournalEntry[]): Promise<boolean> {
  const d = requireHubJournalDeps();
  const savePromise = d.idbSet(_JOURNAL_STORAGE_KEY, journalEntries);
  d.bumpSyncTimestamp('journal');
  d.pushMetaToCloud('journal', journalEntries);
  return savePromise;
}
