import type { Decision } from '../store/padStore';

/**
 * Phase 6.3 slice, Pad Decision Log tab: status + Open quick-filter, the Decision Log
 * counterpart to `qaFilter.ts`. Legacy's real Decision Log tab (legacy/index.html's
 * `decisionListOpenOnly`/`decisionListAuthorFilter`/`decisionStatusOf`) also filters by author
 * (a dropdown built from the distinct authors present) and does search-text matching over
 * title/description -- author filtering needs an `author` field this app's `Decision` doesn't
 * have yet (see padStore.ts's own header on why the Phase 3 schema is deliberately flat), so
 * it's deferred alongside node-linking/structured fields/card rendering/Excel export. This
 * slice ports the `status` field itself (proposed/approved/rejected, added to `Decision` in this
 * same change) plus the "N open" quick-filter (status === proposed).
 */
export function decisionIsOpen(d: Decision): boolean {
  return d.status === 'proposed';
}

export function decisionVisibleItems(decisions: Decision[], openOnly: boolean): Decision[] {
  return openOnly ? decisions.filter(decisionIsOpen) : decisions;
}
