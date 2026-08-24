/**
 * Hub's Recap logic — real Today/This Week/Last Week period-range math and per-domain activity
 * collection, behind legacy's real Recap tab (internally `report*`, legacy/index.html:51901+,
 * "formerly 'Activity Report' — renamed for tone; internal identifiers kept as report* to avoid
 * a risky mass-rename").
 *
 * §6.5 slice (docs/phase6-full-parity-plan.md). Real, deliberate scope reduction from legacy's
 * full Recap, each a genuine architectural boundary rather than an oversight:
 *
 * - **No outline-node activity (items created/edited/completed inside documents) and no
 *   document-level grouping** (`reportGetAllDocNodeSets`/`reportGroupByDoc`,
 *   legacy/index.html:51935-52050). Legacy's Recap reads `node.createdAt`/`modifiedAt`/
 *   `completedAt` off every node in every document — `web/`'s own `OutlineNode`
 *   (`store/outlineStore.ts`) has NO timestamp fields on nodes at all yet. Adding them would be a
 *   real, cross-cutting change to the node shape and the doc round-trip/sync format
 *   (`documentsStore.ts`/`docSyncStore.ts`), not something this slice can honestly do as a side
 *   effect — a genuine separately-scoped follow-up, same category as rich per-node
 *   `highlight`/`color` needing its own future color-palette-UI slice (§6.2's own header).
 * - **No Decision Log/Diagrams/Q&A/Mind Map activity** (legacy/index.html:51980-52008) — same
 *   blocker: those items live inside a document in legacy and would need the same per-node-type
 *   timestamp/grouping infrastructure above.
 * - **No AI bullet-summary** (`report-summary-modal`, legacy/index.html:52378+) — §6.9 (AI
 *   Features) hasn't started, same reasoning every other Hub/Pad slice gives.
 * - **Library is correctly NOT part of this domain** — legacy's own `buildActivityReport`
 *   never reads `libraryItems` at all (confirmed directly against legacy/index.html:51964-52036);
 *   the Phase 4 placeholder's "Library items" stat was never a real parity target to begin with,
 *   corrected here rather than carried forward.
 *
 * What IS real, direct parity: the period-range math itself (`getRecapRange` matches
 * `getReportRange` exactly, including its Monday-start week boundaries) and per-item
 * created/completed/updated classification for To-Dos, Meeting Notes, and Journal — the three
 * domains this project's Hub already tracks with real `createdAt`/`modifiedAt`/`completedAt`
 * fields. `reportInRange`/`byTsDesc` port as `inRecapRange`/the sort-by-`ts`-descending call in
 * each collector, matching field-for-field.
 */

export type RecapPeriod = 'today' | 'week' | 'lastWeek';

export interface RecapRange {
  start: number;
  end: number;
}

/** Matches legacy's own `reportStartOfDay` exactly (legacy/index.html:51908). */
export function recapStartOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Matches legacy's own `getReportRange` exactly (legacy/index.html:51909-51919): Monday-start
 * weeks (matching the ISO week convention `reportIsoWeekNumber` also uses), "This Week" running
 * Monday 00:00 through the following Monday 00:00, "Last Week" the seven days before that.
 * `now` is an injected parameter (defaulting to `Date.now()`) rather than read internally, same
 * "clock injection" convention every other testable time-dependent function in this project uses
 * (`formatRelativeTime.ts` etc.). */
export function getRecapRange(period: RecapPeriod, now: number = Date.now()): RecapRange {
  const todayStart = recapStartOfDay(now);
  const todayEnd = todayStart + 86400000;
  if (period === 'today') return { start: todayStart, end: todayEnd };
  const dow = new Date(now).getDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const thisWeekStart = todayStart - diffToMonday * 86400000;
  if (period === 'week') return { start: thisWeekStart, end: thisWeekStart + 7 * 86400000 };
  return { start: thisWeekStart - 7 * 86400000, end: thisWeekStart }; // lastWeek
}

/** Matches legacy's own `reportInRange` exactly (legacy/index.html:51920). */
export function inRecapRange(ts: number | null | undefined, range: RecapRange): boolean {
  return typeof ts === 'number' && Number.isFinite(ts) && ts >= range.start && ts < range.end;
}

const byTsDesc = <T extends { ts: number }>(a: T, b: T) => b.ts - a.ts;

export interface RecapTodoItem {
  kind: 'completed' | 'created';
  id: string;
  text: string;
  ts: number;
}

/** Matches legacy's own real todo half of `buildActivityReport` (legacy/index.html:52011-52014):
 * a done todo completed within the range counts as "completed"; an open todo (or one completed
 * outside the range) created within the range counts as "created" -- the same `else if` ordering,
 * so a todo completed AND created in the same range never double-counts as both. */
export function collectRecapTodoItems(
  todos: { id: string; text: string; done: boolean; createdAt: number; completedAt: number | null }[],
  range: RecapRange
): RecapTodoItem[] {
  const out: RecapTodoItem[] = [];
  for (const t of todos) {
    if (t.done && inRecapRange(t.completedAt, range)) out.push({ kind: 'completed', id: t.id, text: t.text, ts: t.completedAt as number });
    else if (inRecapRange(t.createdAt, range)) out.push({ kind: 'created', id: t.id, text: t.text, ts: t.createdAt });
  }
  return out.sort(byTsDesc);
}

export interface RecapMeetingItem {
  kind: 'created' | 'updated';
  id: string;
  text: string;
  ts: number;
}

/** Matches legacy's own real meetings half of `buildActivityReport` (legacy/index.html:
 * 52016-52020): created-in-range wins over updated-in-range when both are true (matches the
 * original's `if/else if` -- a meeting created and modified in the same range shows once, as
 * "created"). */
export function collectRecapMeetingItems(
  meetings: { id: string; title: string; createdAt: number; modifiedAt: number }[],
  range: RecapRange
): RecapMeetingItem[] {
  const out: RecapMeetingItem[] = [];
  for (const m of meetings) {
    const label = m.title || 'Untitled meeting';
    if (inRecapRange(m.createdAt, range)) out.push({ kind: 'created', id: m.id, text: label, ts: m.createdAt });
    else if (inRecapRange(m.modifiedAt, range) && m.modifiedAt !== m.createdAt) out.push({ kind: 'updated', id: m.id, text: label, ts: m.modifiedAt });
  }
  return out.sort(byTsDesc);
}

export interface RecapJournalItem {
  kind: 'created' | 'updated';
  date: string;
  mood: string;
  ts: number;
}

/** Matches legacy's own real journal half of `buildActivityReport` (legacy/index.html:
 * 52022-52025), same created-wins-over-updated ordering as meetings above. Keyed by `date`
 * (Journal's real identity, one entry per calendar date) rather than `id`, matching
 * `hubJournalStore.ts`'s own `openEntry(date)` navigation. */
export function collectRecapJournalItems(
  entries: { date: string; mood: string; createdAt: number; modifiedAt: number }[],
  range: RecapRange
): RecapJournalItem[] {
  const out: RecapJournalItem[] = [];
  for (const j of entries) {
    if (inRecapRange(j.createdAt, range)) out.push({ kind: 'created', date: j.date, mood: j.mood, ts: j.createdAt });
    else if (inRecapRange(j.modifiedAt, range) && j.modifiedAt !== j.createdAt) out.push({ kind: 'updated', date: j.date, mood: j.mood, ts: j.modifiedAt });
  }
  return out.sort(byTsDesc);
}
