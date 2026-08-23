/**
 * Pure open-tab ordering/cycling/filtering logic — a Phase 2 (docs/architecture-plan.md) slice,
 * revisiting "tab state" after it was originally set aside alongside outline search and
 * diagram-anchor state as "core-outline-coupled." That framing doesn't actually hold for these
 * functions specifically: none of them touch the outline `nodes` array at all. Same shape of
 * over-broad original judgment as `nodeSearch.ts`'s revisit of search-matching.
 *
 * `switchDoc`/`persistOpenTabs`/`renderTabStrip` (real orchestration: loading a document's full
 * editor state, writing to localStorage, rebuilding the tab strip DOM) stay hand-written in
 * index.html, exactly the same "extract only the pure, testable core; leave orchestration
 * alone" split used throughout this project. `openDockTab`/`toggleDockTab`/`dockPanelIsOpen`
 * (Hub-panel docking, a different "tab" concept entirely — pad/notes/diagrams panel tabs, not
 * open-document tabs) are unrelated and untouched.
 *
 * `filterTabsByTitle`/`moveOverviewSelection` (Phase 6.1, docs/phase6-full-parity-plan.md's 6.1
 * section) back DocumentTabs.tsx's searchable tab-switcher dropdown — the matching/cycling core
 * of legacy's own "search open tabs" overview (legacy/index.html:10700-10736), extracted the
 * same way as this file's other two functions rather than left as inline, untested JSX-adjacent
 * logic.
 */

export interface OrderableTab {
  docId: number | string;
  pinned?: boolean;
}

/** Pure: which tab to switch to when cycling open tabs by `dir` (+1/-1), wrapping around.
 * Returns `null` when there's nothing to cycle through (fewer than 2 tabs open) — the same
 * early-return-as-no-op the original had, made explicit as a return value here since this
 * function has no side effect of its own to skip. If `activeTabDocId` isn't found among
 * `openTabs` (shouldn't normally happen), cycling starts from index 0, matching the original's
 * `idx<0?0:idx` fallback. */
export function computeNextTabDocId(
  openTabs: OrderableTab[],
  activeTabDocId: OrderableTab['docId'] | null,
  dir: number
): OrderableTab['docId'] | null {
  if (openTabs.length < 2) return null;
  const idx = openTabs.findIndex((t) => t.docId === activeTabDocId);
  const from = idx < 0 ? 0 : idx;
  const next = (from + dir + openTabs.length) % openTabs.length;
  return openTabs[next].docId;
}

/** Mutates `openTabs` in place, moving the tab identified by `draggedId` to just before (side
 * `'left'`) or just after (side `'right'`) the tab identified by `targetId` — the same
 * splice-out/splice-back-in convention as `nodeMutations.ts`'s own in-place-mutation pattern.
 * A no-op (no mutation) when `draggedId===targetId` or either id isn't found in `openTabs`,
 * matching the original's early returns exactly. Returns whether a reorder actually happened,
 * so a caller can skip its own follow-up work (persist/render) on a true no-op — the original
 * didn't need this since its early `return`s skipped the follow-up calls directly, but a pure
 * function needs an explicit signal instead of a bare `return`. */
export function reorderTabsCore(
  openTabs: OrderableTab[],
  draggedId: OrderableTab['docId'],
  targetId: OrderableTab['docId'],
  side: 'left' | 'right'
): boolean {
  if (draggedId === targetId) return false;
  const fromIdx = openTabs.findIndex((t) => t.docId === draggedId);
  const toIdx = openTabs.findIndex((t) => t.docId === targetId);
  if (fromIdx < 0 || toIdx < 0) return false;
  const [moved] = openTabs.splice(fromIdx, 1);
  let insertAt = openTabs.findIndex((t) => t.docId === targetId);
  if (side === 'right') insertAt += 1;
  openTabs.splice(insertAt, 0, moved);
  return true;
}

export interface OverviewItem {
  id: string;
  title: string;
}

/** Pure: case-insensitive substring match against `title`, trimmed -- matches legacy's own
 * `q=query.trim().toLowerCase()` / `title.toLowerCase().includes(q)` (legacy/index.html:10712)
 * exactly. An empty (or all-whitespace) query matches everything, same as legacy's `!q||...`
 * short-circuit. Returns a NEW array (unlike `reorderTabsCore`'s in-place mutation above) --
 * filtering has no natural "original array" to mutate into, and DocumentTabs.tsx recomputes
 * this fresh on every keystroke/render regardless. */
export function filterTabsByTitle(items: OverviewItem[], query: string): OverviewItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => item.title.toLowerCase().includes(q));
}

/** Pure: the next active index when arrow-key navigating the overview list by `dir` (+1/-1),
 * wrapping around -- matches legacy's own `moveTabOverviewSelection`
 * (legacy/index.html:10733's `(tabOverviewActiveIndex+dir+tabOverviewItems.length)%tabOverviewItems.length`)
 * exactly. Returns `current` unchanged (rather than throwing or wrapping against a zero length)
 * when `length` is 0 -- there's nothing to move to, and `current` is presumably already 0 in
 * that case from the caller's own reset-on-open/reset-on-query-change logic. */
export function moveOverviewSelection(current: number, length: number, dir: number): number {
  if (length === 0) return current;
  return (current + dir + length) % length;
}
