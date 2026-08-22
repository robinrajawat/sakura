import type { OutlineNode as BaseOutlineNode } from '../utils/serializeMarkdown';

/**
 * The minimal node shape these tree-query functions need: `id` (for identity/lookup) plus
 * everything `OutlineNode` (from serializeMarkdown.ts) already requires (`depth`, and `text`
 * via `PlainTextNode`). Deliberately not index.html's full ~12-field node shape — same reasoning
 * as OutlineNode's own comment: narrower is more honest about what these functions actually
 * touch, and easier to construct in tests.
 */
export interface QueryableNode extends BaseOutlineNode {
  id: number;
}

/**
 * Phase 1 (docs/architecture-plan.md) continuation. These are index.html's core outline
 * tree-query functions — findable-by-id, parent/child/sibling/subtree-boundary lookups, the
 * ASCII tree-connector renderer's prefix math, and simple selection-membership checks.
 * Identified while investigating what would be needed for a future "core outline engine"
 * extraction (see the architecture doc's discussion of why Phase 2's remaining candidates are
 * blocked on `nodes`/`render()` coupling) — these functions turned out to already be pure or
 * one small signature change away from it (`buildPrefix`/`buildVertFlags` already took an
 * optional `scopedNodes` parameter defaulting to the live global; the rest read `nodes` and a
 * handful of other globals directly).
 *
 * Wired into index.html (not hub.html — none of these 13 are used there) via
 * scripts/generate-index-blocks.mjs's `nodeQueries` block. The cutover happened in two
 * sequential commits: first a pure code-motion pass relocating all 13 hand-written definitions
 * into one contiguous, splice-able region; then this file's compiled output was spliced into
 * that region in the same commit that updated every real external call site (268 of them) to
 * pass the explicit arguments these functions now require — `nodes`, `collapsedIds`,
 * `treeIndentWidth`, `sectionMarkersDepthZero`, `selectAllMode`, `multiSelectedIds`,
 * `selectedId` — instead of reading them as ambient globals the way the original hand-written
 * versions did. `buildPrefix`/`buildVertFlags` call sites also needed their positional
 * arguments reordered, not just extended, since `scopedNodes` moved from a trailing optional
 * parameter to a required leading one. See git history around the cutover commit for the
 * codemod used and its verification.
 */

export function getIndex(nodes: QueryableNode[], id: number | null): number {
  return nodes.findIndex((n) => n.id === id);
}

export function nodeHasChildren(nodes: QueryableNode[], idx: number): boolean {
  return idx + 1 < nodes.length && nodes[idx + 1].depth > nodes[idx].depth;
}

export function getSubtreeEnd(nodes: QueryableNode[], idx: number): number {
  const depth = nodes[idx].depth;
  let end = idx + 1;
  while (end < nodes.length && nodes[end].depth > depth) end++;
  return end;
}

export function countDescendants(nodes: QueryableNode[], idx: number): number {
  return getSubtreeEnd(nodes, idx) - idx - 1;
}

export function getParentIndex(nodes: QueryableNode[], idx: number): number {
  const depth = nodes[idx]?.depth ?? 0;
  if (depth === 0) return -1;
  for (let i = idx - 1; i >= 0; i--) {
    if (nodes[i].depth === depth - 1) return i;
  }
  return -1;
}

export function getVisibleNodeIndexes(nodes: QueryableNode[], collapsedIds: Set<number>): number[] {
  const out: number[] = [];
  let skipDepth: number | null = null;
  nodes.forEach((node, idx) => {
    if (skipDepth !== null) {
      if (node.depth > skipDepth) return;
      skipDepth = null;
    }
    out.push(idx);
    const folded = collapsedIds.has(node.id);
    if (folded && nodeHasChildren(nodes, idx)) skipDepth = node.depth;
  });
  return out;
}

/** Does any LATER node in `arr` (at or after `fromIdx + 1`) sit at exactly `depth`, before the
 * tree structurally rules that out (a node at a shallower depth ends the search)? */
export function hasLaterSiblingAtDepth(arr: QueryableNode[], fromIdx: number, depth: number): boolean {
  for (let i = fromIdx + 1; i < arr.length; i++) {
    if (arr[i].depth === depth) return true;
    if (arr[i].depth < depth) return false;
  }
  return false;
}

/**
 * The ASCII tree-connector prefix (`├── `, `└── `, or the blank/`│` continuation columns
 * leading up to it) for the node at `idx` within `scopedNodes` — the same rendering used for
 * both the full document and a subtree scoped by Focus mode (via `depthOffset`).
 */
export function buildPrefix(
  scopedNodes: QueryableNode[],
  idx: number,
  treeIndentWidth: number,
  depthOffset = 0
): { vert: string; conn: string } {
  const node = scopedNodes[idx];
  const depth = node.depth + depthOffset;
  const w = treeIndentWidth;
  const dashes = '─'.repeat(Math.max(1, w - 2));
  let vert = '';
  for (let d = 0; d < depth; d++) {
    let hasSibling = false;
    for (let j = idx - 1; j >= 0; j--) {
      if (scopedNodes[j].depth + depthOffset === d) {
        hasSibling = hasLaterSiblingAtDepth(scopedNodes, j, d - depthOffset);
        break;
      }
    }
    vert += hasSibling ? '│' + ' '.repeat(w - 1) : ' '.repeat(w);
  }
  const conn =
    depth > 0 ? (hasLaterSiblingAtDepth(scopedNodes, idx, node.depth) ? '├' + dashes + ' ' : '└' + dashes + ' ') : '';
  return { vert, conn };
}

/** One boolean per depth level (0..depth-1) for the vertical tree-guide-line renderer — see the
 * original call site's comment for why this simplified version (always `true`) replaced a more
 * expensive per-column sibling check once `hideTreeLines` mode made the guides purely cosmetic. */
export function buildVertFlags(scopedNodes: QueryableNode[], idx: number, depthOffset = 0): boolean[] {
  const node = scopedNodes[idx];
  const depth = node.depth + depthOffset;
  return new Array(Math.max(0, depth)).fill(true);
}

/** Pure: does this raw node text look like a `[Section]` marker? */
export function isSectionNodeText(text: string | null | undefined): boolean {
  return /^\[[^\]]+\]$/.test(String(text || '').trim());
}

/** Whether a node should render/export as a section header — either explicit `[Section]` markup,
 * or (when the `sectionMarkersDepthZero` preference is on) simply being a top-level node. */
export function nodeIsSection(node: QueryableNode | null | undefined, sectionMarkersDepthZero: boolean): boolean {
  return isSectionNodeText(node && node.text) || (sectionMarkersDepthZero && !!node && (node.depth || 0) === 0);
}

/** Whether `id` is part of the current selection — the primary single selection, "select all"
 * mode, or a multi-selection range. */
export function isIdSelected(
  id: number | null,
  selectAllMode: boolean,
  multiSelectedIds: number[],
  selectedId: number | null
): boolean {
  return selectAllMode || multiSelectedIds.includes(id as number) || (!multiSelectedIds.length && id === selectedId);
}

/** The ids spanning `fromId` to `toId` inclusive — along VISIBLE order when both ids are
 * currently visible (respecting folded subtrees), falling back to raw array order otherwise
 * (e.g. extending a range into a folded subtree). */
export function getSelectionRangeIds(
  nodes: QueryableNode[],
  collapsedIds: Set<number>,
  fromId: number | null,
  toId: number | null
): (number | null)[] {
  const from = getIndex(nodes, fromId);
  const to = getIndex(nodes, toId);
  if (from < 0 || to < 0) return toId !== null ? [toId] : [];
  if (from === to) return [toId];
  const visible = getVisibleNodeIndexes(nodes, collapsedIds);
  const visFrom = visible.indexOf(from);
  const visTo = visible.indexOf(to);
  if (visFrom < 0 || visTo < 0) {
    const [start, end] = from <= to ? [from, to] : [to, from];
    return nodes.slice(start, end + 1).map((n) => n.id);
  }
  const [vs, ve] = visFrom <= visTo ? [visFrom, visTo] : [visTo, visFrom];
  return visible.slice(vs, ve + 1).map((idx) => nodes[idx].id);
}

/** One immediate child's whole subtree span under some parent — `start` inclusive, `end`
 * exclusive, same convention as `getSubtreeEnd`. */
export interface ChildBlock {
  start: number;
  end: number;
}

/**
 * Pure: the immediate child blocks under `parentIdx` — or, when `parentIdx` is `null`, every
 * top-level root block in the whole tree. Each block spans one child's entire subtree, not just
 * the child node itself, so a caller reordering blocks moves each child's descendants along
 * with it.
 *
 * NOT a Phase 1 port — unlike every other function in this file, `getChildBlocks` was never one
 * of index.html's extracted `src/core/` generated blocks; it's freshly written here to match
 * the real hand-written `getChildBlocks` in index.html exactly (same category as
 * `parseSemanticMarkup.ts`'s relationship to the never-extracted `parseStyledText` — see that
 * file's own header for the fuller explanation of why "not a port" doesn't mean "not faithful").
 */
export function getChildBlocks(nodes: QueryableNode[], parentIdx: number | null): ChildBlock[] {
  const blocks: ChildBlock[] = [];
  if (parentIdx === null) {
    let i = 0;
    while (i < nodes.length) {
      if (nodes[i].depth === 0) {
        const end = getSubtreeEnd(nodes, i);
        blocks.push({ start: i, end });
        i = end;
      } else {
        i++;
      }
    }
  } else {
    const parentDepth = nodes[parentIdx].depth;
    let i = parentIdx + 1;
    while (i < nodes.length && nodes[i].depth > parentDepth) {
      if (nodes[i].depth === parentDepth + 1) {
        const end = getSubtreeEnd(nodes, i);
        blocks.push({ start: i, end });
        i = end;
      } else {
        i++;
      }
    }
  }
  return blocks;
}

/** Pure: how many depth levels deep the block `[start, end)` goes, relative to its own root —
 * 0 for a childless node, 1 if it has direct children only but no grandchildren, etc. Same
 * "freshly written, faithfully matching a never-extracted legacy function" status as
 * `getChildBlocks` above. */
export function subtreeHeight(nodes: QueryableNode[], start: number, end: number): number {
  let max = nodes[start].depth;
  for (let i = start; i < end; i++) if (nodes[i].depth > max) max = nodes[i].depth;
  return max - nodes[start].depth;
}
