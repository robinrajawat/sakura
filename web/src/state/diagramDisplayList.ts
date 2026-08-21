import { diagramNeedsAttentionCore, isDiagramOrphaned } from './diagramAnchor';

/**
 * Diagram list filtering/sorting — the decision logic behind `getDiagramDisplayList()`/
 * `diagramCanReorder()` in index.html: given the raw `diagrams` array and the current
 * search/filter/sort UI state, which diagrams show in the panel, in what order.
 *
 * First slice of Diagrams' larger remainder (the doc's own long-standing note: "the larger
 * remainder — 73+ functions, image-blob hydration, list rendering — is heavily DOM-coupled with
 * no pure core identified yet — not investigated in depth"). Deliberately narrow: this module
 * owns only the display-list computation, not the much larger `diagramGen*` XML/layout-
 * generation subsystem (canvas/layout math, a genuinely separate future investigation) or any
 * diagram CRUD/editor DOM wiring.
 *
 * `isDiagramOrphaned`/`diagramNeedsAttentionCore` (from `src/state/diagramAnchor.ts`, already a
 * generated block spliced in elsewhere in index.html) are referenced as ambient globals via
 * `declare function` below — the same type-erased pattern `nodeMutations.ts` uses for
 * `nodeQueries.ts`'s `getSubtreeEnd`/`getIndex`. `diagramStatusOf`/`diagramStatusLabel` are
 * trivial hand-written one-liners in index.html, NOT generated blocks — inlined directly below
 * rather than extending the `declare function` pattern to hand-written code, same precedent as
 * `nodeSearch.ts` inlining `escapeRegExpLiteral`.
 *
 * Explicitly NOT extracted here, and why:
 * - `renderDiagramsList`/DOM construction, `updateDiagramBulkBar`/summary-chip rendering — DOM
 *   construction, stays hand-written, same reasoning as `renderNotifList` staying out of
 *   `notifications.ts`.
 * - `diagramDisplayOrderIds()` — a genuine one-line derived value
 *   (`getDiagramDisplayList().map(d=>d.id)`), no logic of its own to extract; the wrapper keeps
 *   calling this module's core function directly.
 * - `diagramStatusColor` — used only for CSS class selection in rendering, not in the
 *   filter/sort logic this module owns.
 */


// Private names, deliberately NOT matching index.html's own top-level `DIAGRAM_STATUSES` const
// (see this file's header for why: every generated block shares one script scope with the rest
// of index.html, so redeclaring the same name would be a duplicate `const` — a hard
// SyntaxError, same lesson `templatesIndex.ts`/`aiProviders.ts` document for their own storage
// keys). The literal values are duplicated here instead, with this comment as the single place
// documenting they must stay in sync with index.html's own copy if it ever changes.
const _DIAGRAM_STATUS_ORDER = ['draft', 'in-progress', 'review', 'final'] as const;
const _DIAGRAM_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  'in-progress': 'In Progress',
  review: 'Review',
  final: 'Final',
};

/** Pure: matches index.html's own `diagramStatusOf` exactly — an invalid/missing status falls
 * back to `'draft'` rather than being treated as unknown. */
function statusOf(d: { status?: string | null }): string {
  const s = String(d?.status || '').toLowerCase();
  return (_DIAGRAM_STATUS_ORDER as readonly string[]).includes(s) ? s : 'draft';
}

/** Pure: matches index.html's own `diagramStatusLabel` exactly, including its `'Draft'`
 * fallback for a status somehow outside the known set. */
function statusLabel(s: string): string {
  return _DIAGRAM_STATUS_LABELS[s] || 'Draft';
}

export interface DisplayableDiagram {
  id: string | number;
  title?: string;
  status?: string | null;
  modifiedAt?: number;
  anchorNodeId?: number | null;
  isWhiteboard?: boolean;
}

export interface DiagramDisplayListOptions {
  searchQuery: string;
  unlinkedOnly: boolean;
  sortMode: string;
}

/** Pure: computes the diagram panel's display list — never mutates the input `diagrams` array
 * (works on a copy throughout, matching the original's own `diagrams.slice()` start). Applies,
 * in the same order as the original:
 * 1. Search filter (only when `searchQuery` is non-empty after trimming): keeps a diagram if
 *    its title OR its status label (e.g. "In Progress") case-insensitively contains the query —
 *    matching the original's `.title.includes(q) || diagramStatusLabel(...).includes(q)`.
 * 2. "Needs attention" filter (only when `unlinkedOnly` is true): keeps only unlinked/orphaned
 *    diagrams (never a whiteboard — see `diagramNeedsAttentionCore`'s own rule).
 * 3. Sort: `'status'` sorts by the fixed draft→in-progress→review→final order; `'modified'`
 *    sorts newest-`modifiedAt`-first; any other value (i.e. `'manual'`) leaves the array's
 *    current order untouched — the manual drag-reorder order lives in the array itself, not
 *    something this function derives.
 * 4. Whiteboard pin: if a whiteboard diagram exists anywhere past the first position, it's
 *    always moved to the very front, regardless of search/filter/sort above — matching the
 *    original's own `wbIdx>0` check and unshift. */
export function computeDiagramDisplayListCore<T extends DisplayableDiagram>(
  diagrams: T[],
  nodes: { id: number }[],
  options: DiagramDisplayListOptions
): T[] {
  const q = options.searchQuery.trim().toLowerCase();
  let list = diagrams.slice();

  if (q) {
    list = list.filter(
      (d) => (d.title || '').toLowerCase().includes(q) || statusLabel(statusOf(d)).toLowerCase().includes(q)
    );
  }

  if (options.unlinkedOnly) {
    list = list.filter((d) => diagramNeedsAttentionCore(d, isDiagramOrphaned(d, nodes)));
  }

  if (options.sortMode === 'status') {
    const order = _DIAGRAM_STATUS_ORDER as readonly string[];
    list.sort((a, b) => order.indexOf(statusOf(a)) - order.indexOf(statusOf(b)));
  } else if (options.sortMode === 'modified') {
    list.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
  }

  const wbIdx = list.findIndex((d) => d.isWhiteboard);
  if (wbIdx > 0) {
    const [wb] = list.splice(wbIdx, 1);
    list.unshift(wb);
  }

  return list;
}

export interface DiagramCanReorderOptions {
  sortMode: string;
  searchQuery: string;
  unlinkedOnly: boolean;
  selectMode: boolean;
}

/** Pure: matches index.html's own `diagramCanReorder` exactly — manual drag-reorder is only
 * available in manual sort mode, with no active search, no "needs attention" filter applied,
 * and only while diagram multi-select mode is on. */
export function computeDiagramCanReorderCore(options: DiagramCanReorderOptions): boolean {
  return options.sortMode === 'manual' && !options.searchQuery.trim() && !options.unlinkedOnly && options.selectMode;
}
