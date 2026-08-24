/**
 * Hub's Library storage — entry normalization/validation, the IndexedDB-backed load/save layer,
 * and the pure search/sort/href-building logic behind index.html's real `#library-panel`
 * (legacy/index.html:49296-49842).
 *
 * §6.5 slice (docs/phase6-full-parity-plan.md). "Library" in this project's Hub grouping
 * corresponds to legacy's desktop-only `#library-panel` in index.html, NOT anything in
 * hub.html -- hub.html's own header (legacy/hub.html:38) explicitly scopes the mobile companion
 * page to "To-Dos and Journal only", with Library named as one of the desktop-only features it
 * deliberately excludes. Same span source as Meeting Notes/Recap.
 *
 * Same field/id scheme as legacy's own `normalizeLibraryItem` (legacy/index.html:49307-49320),
 * with real omissions, each a separately-scoped follow-up rather than silently dropped:
 * - AI rewrite (`rewriteLibraryField`, legacy/index.html:49705-49741) -- §6.9 (AI Features)
 *   hasn't started, same reasoning every other Hub/Pad slice gives.
 * - Version History browsable overlay, PDF export, the feature-enable toggle (Settings ->
 *   Features -> Library) -- deferred to §6.6/§6.8/§6.10, cross-cutting infra not specific to
 *   this panel (same deferral category as To-Dos'/Meeting Notes' own PDF export/Version
 *   History/Share).
 * - Quick Assist / Global Search visibility (`window.collectLibraryMatches`) -- Quick Assist
 *   itself doesn't exist anywhere in web/ yet (§6.10 not started).
 * - Pasted-image-only clipboard handling (legacy's own `library-body-field` paste listener,
 *   legacy/index.html:49660-49678) -- rich text here matches Journal's own narrower toolset
 *   (bullet/numbered list + Ctrl/Cmd+B/I only, see HubLibraryPanel.tsx), which has no image
 *   support either; this stays consistent with that already-established scoping rather than
 *   giving Library a richer editor than Journal has.
 *
 * Deliberately NOT extracted here, same reasoning as every prior slice: `renderLibraryList`/DOM
 * construction (stays hand-written), the floating-panel chrome (maximize/resize/anchor-to-dock,
 * legacy/index.html:4230-4296) -- this project's Library renders inline in the Hub grid, same
 * "honest first pass, simpler chrome" convention every other Pad/Hub slice uses.
 */

export interface LibraryItem {
  id: string;
  title: string;
  url: string;
  urlLabel: string;
  body: string;
  tags: string[];
  favorite: boolean;
  createdAt: number;
  modifiedAt: number;
}

export interface HubLibraryDeps {
  idbGet: (key: string) => Promise<unknown>;
  idbSet: (key: string, value: unknown) => Promise<boolean>;
  bumpSyncTimestamp: (metaKey: string) => void;
  pushMetaToCloud: (metaKey: string, value: unknown) => void;
  now: () => number;
  generateLibraryId: () => string;
}

// Private to this module (deliberately NOT the same name as index.html's own top-level
// LIBRARY_KEY -- same reasoning hubMeetings.ts/hubJournal.ts give for their own storage keys).
const _LIBRARY_STORAGE_KEY = 'sakura_library_v1';

let hubLibraryDeps: HubLibraryDeps | null = null;

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initHubLibraryState(injected: HubLibraryDeps): void {
  hubLibraryDeps = injected;
}

function requireHubLibraryDeps(): HubLibraryDeps {
  if (!hubLibraryDeps) throw new Error('hubLibrary state used before initHubLibraryState() was called');
  return hubLibraryDeps;
}

/** Matches legacy's own `normalizeLibraryItem` exactly (legacy/index.html:49307-49320): every
 * field defaults independently rather than the whole object being rejected if one field is
 * malformed, same field-by-field `typeof`/fallback checks, including the coercive-vs-strict
 * `Number.isFinite` choice for `createdAt`/`modifiedAt` (matches the original's own
 * `Number.isFinite`, unlike Journal's `isFinite` -- a real, deliberate difference between the
 * two originals, preserved rather than unified). */
export function normalizeLibraryItemCore(it: Partial<LibraryItem> | null | undefined): LibraryItem {
  const d = requireHubLibraryDeps();
  const now = d.now();
  return {
    id: it && typeof it.id === 'string' ? it.id : d.generateLibraryId(),
    title: it && typeof it.title === 'string' ? it.title : '',
    url: it && typeof it.url === 'string' ? it.url : '',
    urlLabel: it && typeof it.urlLabel === 'string' ? it.urlLabel : '',
    body: it && typeof it.body === 'string' ? it.body : '',
    tags:
      it && Array.isArray(it.tags)
        ? it.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim())
        : [],
    favorite: !!(it && it.favorite),
    createdAt: it && Number.isFinite(it.createdAt) ? (it.createdAt as number) : now,
    modifiedAt: it && Number.isFinite(it.modifiedAt) ? (it.modifiedAt as number) : now
  };
}

/** Matches legacy's own real `loadLibraryItems` (legacy/index.html:49325-49339): reads from
 * IndexedDB first, falling back to a legacy localStorage copy (and migrating it into IndexedDB
 * on success) if IndexedDB has nothing yet -- same one-time migration path Journal's/Meeting
 * Notes' own load functions use. Never throws; any failure at any stage falls through to an
 * empty list. */
export async function loadLibraryLocalCore(): Promise<LibraryItem[]> {
  const d = requireHubLibraryDeps();
  try {
    const idbItems = await d.idbGet(_LIBRARY_STORAGE_KEY);
    if (Array.isArray(idbItems)) return idbItems.map(normalizeLibraryItemCore);
  } catch {
    // fall through to the localStorage migration path below
  }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(_LIBRARY_STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const migrated = parsed.map(normalizeLibraryItemCore);
      try {
        await d.idbSet(_LIBRARY_STORAGE_KEY, migrated);
        localStorage.removeItem(_LIBRARY_STORAGE_KEY);
      } catch {
        // migration best-effort, matches legacy's own silent-swallow
      }
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

/** Matches legacy's own real `saveLibraryItems` (legacy/index.html:49340-49351): writes the
 * full list to IndexedDB and fires the same two real sync side effects every other Hub save
 * does, both injected, both fired synchronously and unconditionally -- same ordering as
 * `saveJournalEntriesCore`/`saveMeetingsCore`. Deliberately NOT ported: version-history
 * auto-snapshotting (`maybeAutoSnapshotLibrary`, §6.8) and `scheduleBackupWrite`/`markMetaChanged`
 * beyond the two injected hooks (whole-app backup infra, also §6.8). */
export function saveLibraryItemsCore(items: LibraryItem[]): Promise<boolean> {
  const d = requireHubLibraryDeps();
  const savePromise = d.idbSet(_LIBRARY_STORAGE_KEY, items);
  d.bumpSyncTimestamp('library');
  d.pushMetaToCloud('library', items);
  return savePromise;
}

/** Matches legacy's own real sort order at render time (legacy/index.html:49458): favorites
 * first, then most-recently-modified first within each group. Pure -- takes plain values, no
 * dependency on `initHubLibraryState`. */
export function sortLibraryItemsCore<T extends { favorite: boolean; modifiedAt: number }>(items: T[]): T[] {
  return items
    .slice()
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (b.modifiedAt || 0) - (a.modifiedAt || 0));
}

/** Matches legacy's own real `librarySearchMatches` (legacy/index.html:49443-49447): a
 * case-insensitive substring match against title/url/urlLabel/tags plus the body's already-
 * stripped plain text -- `bodyText` is passed in pre-stripped rather than computed here, since
 * the original's `stripHtmlToSnippet` is DOM-dependent (`document.createElement`) and stays
 * hand-written in the caller, same split as every other slice's DOM-touching helper. An
 * empty/whitespace-only query always matches, same as the original's own `if(!q)return true`. */
export function librarySearchMatchCore(
  item: { title: string; url: string; urlLabel: string; tags: string[] },
  bodyText: string,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [item.title, item.url, item.urlLabel, bodyText, item.tags.join(' ')].join(' ').toLowerCase();
  return hay.includes(q);
}

/** Matches legacy's own real link-opening href logic (legacy/index.html:49496,49615): a URL
 * with no scheme gets `https://` prepended before being used as an `<a href>`/`window.open`
 * target, so a bare `example.com` still opens correctly rather than being resolved as a
 * relative path against the app's own origin. */
export function libraryUrlHref(url: string): string {
  if (!url) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : 'https://' + url;
}
