/**
 * Pure diagram-anchoring/orphan-detection and diagram-list-reorder logic — a Phase 2
 * (docs/architecture-plan.md) slice, revisiting "diagram-anchor state" after it was originally
 * set aside alongside outline search and tab state as "core-outline-coupled." Same shape as
 * both of those revisits: the actual functions touch `nodes` read-only (never mutate it, never
 * call `render()`), so the original blanket "not safe to extract" verdict was broader than the
 * real coupling.
 *
 * `renderDiagramsList`/`markDirty`/`scheduleAutoSave` (real orchestration: DOM rebuild, dirty
 * flag, debounced save) stay hand-written in index.html, same "extract only the pure, testable
 * core; leave orchestration alone" split used throughout this project.
 *
 * `stripSemanticMarkers` (from src/utils/stripSemanticMarkers.ts, already a generated block
 * spliced in elsewhere in index.html) is referenced as an ambient global via `declare function`
 * below — type-only, fully erased from the compiled JS output, resolving at runtime to the real
 * already-spliced function since every generated block shares one script scope. This is NOT a
 * real import — see nodeMutations.ts's own header for why a real value import would silently
 * kill the whole script if it survived compilation.
 */

declare function stripSemanticMarkers(text: string | null | undefined): string;

interface AnchorableNode {
  id: number;
  text?: string;
}

export interface AnchorableDiagram {
  id: string | number;
  anchorNodeId?: number | null;
  isWhiteboard?: boolean;
}

/** Pure: the human-readable "anchored under..." label for a diagram, matching the original's
 * three-way branch exactly (never linked / linked-but-node-deleted / linked-with-text). Text
 * is truncated to 60 characters, same as the original. */
export function computeDiagramAnchorLabel(diagram: AnchorableDiagram, nodes: AnchorableNode[]): string {
  if (diagram.anchorNodeId == null) return 'Not linked to a node';
  const node = nodes.find((n) => n.id === diagram.anchorNodeId);
  if (!node) return 'Linked node no longer exists';
  const text = stripSemanticMarkers(node.text || '').trim();
  return 'Under: ' + (text ? text.slice(0, 60) : '(untitled node)');
}

/** Pure: a diagram is "orphaned" when it's anchored to a node id that no longer exists in the
 * outline (the node was deleted after linking) — distinct from "unlinked" (never anchored). */
export function isDiagramOrphaned(diagram: AnchorableDiagram, nodes: AnchorableNode[]): boolean {
  return diagram.anchorNodeId != null && !nodes.some((n) => n.id === diagram.anchorNodeId);
}

/** Pure: whether a diagram "needs attention" — unlinked or orphaned, but never true for a
 * whiteboard (whiteboards aren't anchored to nodes at all, so neither state applies to them).
 * Takes the already-computed `orphaned` flag rather than recomputing it, so a caller that's
 * already called `isDiagramOrphaned` (e.g. to build a combined summary) doesn't redo the work —
 * matches the original's own internal call to `diagramIsOrphaned(d)`, just with that result
 * passed in instead of recomputed. */
export function diagramNeedsAttentionCore(diagram: AnchorableDiagram, orphaned: boolean): boolean {
  if (diagram.isWhiteboard) return false;
  return diagram.anchorNodeId == null || orphaned;
}

/** Mutates `diagrams` in place, moving the diagram identified by `draggedId` to just before the
 * diagram identified by `targetId` — same splice-out/splice-back-in convention as
 * `nodeMutations.ts`/`tabOrder.ts`. IDs are compared as strings, matching the original (diagram
 * ids can apparently arrive as either strings or numbers depending on source). A no-op when the
 * ids are equal or either isn't found, matching the original's early returns. Returns whether a
 * reorder actually happened, same reasoning as `reorderTabsCore`. */
export function reorderDiagramsCore(
  diagrams: AnchorableDiagram[],
  draggedId: AnchorableDiagram['id'],
  targetId: AnchorableDiagram['id']
): boolean {
  if (String(draggedId) === String(targetId)) return false;
  const fromIdx = diagrams.findIndex((dg) => String(dg.id) === String(draggedId));
  const toIdx = diagrams.findIndex((dg) => String(dg.id) === String(targetId));
  if (fromIdx < 0 || toIdx < 0) return false;
  const [moved] = diagrams.splice(fromIdx, 1);
  diagrams.splice(toIdx, 0, moved);
  return true;
}
