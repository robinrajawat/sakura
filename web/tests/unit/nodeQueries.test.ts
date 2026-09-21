import { describe, it, expect } from 'vitest';
import {
  getIndex,
  nodeHasChildren,
  getSubtreeEnd,
  countDescendants,
  getParentIndex,
  getVisibleNodeIndexes,
  hasLaterSiblingAtDepth,
  buildPrefix,
  buildVertFlags,
  isSectionNodeText,
  nodeIsSection,
  isIdSelected,
  getSelectionRangeIds,
  type QueryableNode
} from '../../src/core/nodeQueries';

// Pinned local oracles — literal copies of index.html's current implementations, modified only
// to accept `nodes`/`collapsedIds`/etc. as explicit parameters instead of reading them from
// module-level globals, matching the minimal change made in the real extraction (same approach
// as tests/unit/serializeMarkdown.test.ts).

function oGetIndex(nodes: QueryableNode[], id: number | null) {
  return nodes.findIndex((n) => n.id === id);
}
function oNodeHasChildren(nodes: QueryableNode[], idx: number) {
  return idx + 1 < nodes.length && nodes[idx + 1].depth > nodes[idx].depth;
}
function oGetSubtreeEnd(nodes: QueryableNode[], idx: number) {
  const depth = nodes[idx].depth;
  let end = idx + 1;
  while (end < nodes.length && nodes[end].depth > depth) end++;
  return end;
}
function oCountDescendants(nodes: QueryableNode[], idx: number) {
  return oGetSubtreeEnd(nodes, idx) - idx - 1;
}
function oGetParentIndex(nodes: QueryableNode[], idx: number) {
  const depth = nodes[idx]?.depth ?? 0;
  if (depth === 0) return -1;
  for (let i = idx - 1; i >= 0; i--) if (nodes[i].depth === depth - 1) return i;
  return -1;
}
function oGetVisibleNodeIndexes(nodes: QueryableNode[], collapsedIds: Set<number>) {
  const out: number[] = [];
  let skipDepth: number | null = null;
  nodes.forEach((node, idx) => {
    if (skipDepth !== null) {
      if (node.depth > skipDepth) return;
      skipDepth = null;
    }
    out.push(idx);
    const folded = collapsedIds.has(node.id);
    if (folded && oNodeHasChildren(nodes, idx)) skipDepth = node.depth;
  });
  return out;
}
function oHasLaterSiblingAtDepth(arr: QueryableNode[], fromIdx: number, depth: number) {
  for (let i = fromIdx + 1; i < arr.length; i++) {
    if (arr[i].depth === depth) return true;
    if (arr[i].depth < depth) return false;
  }
  return false;
}
function oBuildPrefix(scopedNodes: QueryableNode[], idx: number, treeIndentWidth: number, depthOffset = 0) {
  const node = scopedNodes[idx];
  const depth = node.depth + depthOffset;
  const w = treeIndentWidth;
  const dashes = '─'.repeat(Math.max(1, w - 2));
  let vert = '';
  for (let d = 0; d < depth; d++) {
    let hasSibling = false;
    for (let j = idx - 1; j >= 0; j--) {
      if (scopedNodes[j].depth + depthOffset === d) {
        hasSibling = oHasLaterSiblingAtDepth(scopedNodes, j, d - depthOffset);
        break;
      }
    }
    vert += hasSibling ? '│' + ' '.repeat(w - 1) : ' '.repeat(w);
  }
  const conn = depth > 0 ? (oHasLaterSiblingAtDepth(scopedNodes, idx, node.depth) ? '├' + dashes + ' ' : '└' + dashes + ' ') : '';
  return { vert, conn };
}
function oBuildVertFlags(scopedNodes: QueryableNode[], idx: number, depthOffset = 0) {
  const node = scopedNodes[idx];
  const depth = node.depth + depthOffset;
  return new Array(Math.max(0, depth)).fill(true);
}
function oIsSectionNodeText(text: string | null | undefined) {
  return /^\[[^\]]+\]$/.test(String(text || '').trim());
}
function oNodeIsSection(node: QueryableNode | null | undefined, sectionMarkersDepthZero: boolean) {
  return oIsSectionNodeText(node && node.text) || (sectionMarkersDepthZero && !!node && (node.depth || 0) === 0);
}
function oIsIdSelected(id: number | null, selectAllMode: boolean, multiSelectedIds: number[], selectedId: number | null) {
  return selectAllMode || multiSelectedIds.includes(id as number) || (!multiSelectedIds.length && id === selectedId);
}
function oGetSelectionRangeIds(nodes: QueryableNode[], collapsedIds: Set<number>, fromId: number | null, toId: number | null) {
  const from = oGetIndex(nodes, fromId);
  const to = oGetIndex(nodes, toId);
  if (from < 0 || to < 0) return toId !== null ? [toId] : [];
  if (from === to) return [toId];
  const visible = oGetVisibleNodeIndexes(nodes, collapsedIds);
  const visFrom = visible.indexOf(from);
  const visTo = visible.indexOf(to);
  if (visFrom < 0 || visTo < 0) {
    const [start, end] = from <= to ? [from, to] : [to, from];
    return nodes.slice(start, end + 1).map((n) => n.id);
  }
  const [vs, ve] = visFrom <= visTo ? [visFrom, visTo] : [visTo, visFrom];
  return visible.slice(vs, ve + 1).map((idx) => nodes[idx].id);
}

// Test fixtures — id order matches array position, matching how index.html actually builds
// `nodes` (append-only with occasional reorders, but always id !== array index in general; kept
// distinct here specifically to catch any accidental idx/id confusion in the extraction).
function n(id: number, depth: number, text = 't' + id): QueryableNode {
  return { id, depth, text };
}

// A -> B -> C (deep), D -> E, F (flat siblings under D)
const nestedTree: QueryableNode[] = [
  n(10, 0, 'A'),
  n(11, 1, 'B'),
  n(12, 2, 'C'),
  n(13, 0, 'D'),
  n(14, 1, 'E'),
  n(15, 1, 'F')
];

const flatTree: QueryableNode[] = [n(1, 0), n(2, 0), n(3, 0)];

const sectionsTree: QueryableNode[] = [n(100, 0, '[Intro]'), n(101, 1, 'point one'), n(102, 0, 'not a section')];

describe('getIndex / nodeHasChildren / getSubtreeEnd / countDescendants / getParentIndex', () => {
  it.each([[nestedTree], [flatTree], [sectionsTree]])('matches the oracle across every index and every id, including misses', (tree) => {
    const ids = [...tree.map((n) => n.id), -1, 9999];
    for (const id of ids) {
      expect(getIndex(tree, id)).toBe(oGetIndex(tree, id));
    }
    for (let idx = 0; idx < tree.length; idx++) {
      expect(nodeHasChildren(tree, idx)).toBe(oNodeHasChildren(tree, idx));
      expect(getSubtreeEnd(tree, idx)).toBe(oGetSubtreeEnd(tree, idx));
      expect(countDescendants(tree, idx)).toBe(oCountDescendants(tree, idx));
      expect(getParentIndex(tree, idx)).toBe(oGetParentIndex(tree, idx));
    }
  });

  it('nodeHasChildren is true for a deep parent, false for a leaf', () => {
    expect(nodeHasChildren(nestedTree, 1)).toBe(true); // B has child C
    expect(nodeHasChildren(nestedTree, 2)).toBe(false); // C is a leaf
  });

  it('getSubtreeEnd / countDescendants span exactly the deep subtree, not siblings', () => {
    expect(getSubtreeEnd(nestedTree, 0)).toBe(3); // A's subtree ends before D
    expect(countDescendants(nestedTree, 0)).toBe(2); // B, C
    expect(countDescendants(nestedTree, 3)).toBe(2); // D's subtree: E, F
  });

  it('getParentIndex returns -1 at the root, the correct ancestor otherwise', () => {
    expect(getParentIndex(nestedTree, 0)).toBe(-1); // A is root
    expect(getParentIndex(nestedTree, 2)).toBe(1); // C's parent is B
    expect(getParentIndex(nestedTree, 5)).toBe(3); // F's parent is D
  });
});

describe('getVisibleNodeIndexes', () => {
  it('matches the oracle with nothing folded, and with various folds', () => {
    const foldCombos = [new Set<number>(), new Set([10]), new Set([13]), new Set([10, 13])];
    for (const collapsed of foldCombos) {
      expect(getVisibleNodeIndexes(nestedTree, collapsed)).toEqual(oGetVisibleNodeIndexes(nestedTree, collapsed));
    }
  });

  it('folding a parent hides its descendants but not its later siblings', () => {
    const visible = getVisibleNodeIndexes(nestedTree, new Set([10])); // fold A
    expect(visible).toEqual([0, 3, 4, 5]); // A itself stays visible, B/C hidden, D/E/F unaffected
  });
});

describe('hasLaterSiblingAtDepth', () => {
  it('matches the oracle across every (idx, depth) combination', () => {
    for (let idx = 0; idx < nestedTree.length; idx++) {
      for (let depth = 0; depth <= 2; depth++) {
        expect(hasLaterSiblingAtDepth(nestedTree, idx, depth)).toBe(oHasLaterSiblingAtDepth(nestedTree, idx, depth));
      }
    }
  });
});

describe('buildPrefix / buildVertFlags', () => {
  it('matches the oracle for every node at a few tree indent widths', () => {
    for (const width of [2, 3, 4]) {
      for (let idx = 0; idx < nestedTree.length; idx++) {
        expect(buildPrefix(nestedTree, idx, width)).toEqual(oBuildPrefix(nestedTree, idx, width));
        expect(buildVertFlags(nestedTree, idx)).toEqual(oBuildVertFlags(nestedTree, idx));
      }
    }
  });

  it('matches the oracle with a non-zero depthOffset (Focus mode scoping)', () => {
    const subtree = nestedTree.slice(1, 3); // B, C — as if focused into A
    for (let idx = 0; idx < subtree.length; idx++) {
      expect(buildPrefix(subtree, idx, 3, -1)).toEqual(oBuildPrefix(subtree, idx, 3, -1));
      expect(buildVertFlags(subtree, idx, -1)).toEqual(oBuildVertFlags(subtree, idx, -1));
    }
  });

  it('the root has no connector; a deeper node does', () => {
    expect(buildPrefix(nestedTree, 0, 3).conn).toBe('');
    expect(buildPrefix(nestedTree, 1, 3).conn).not.toBe('');
  });
});

describe('isSectionNodeText / nodeIsSection', () => {
  it('matches the oracle for a range of texts and settings', () => {
    const texts = ['[Section]', '[A B C]', 'plain text', '', null, undefined, '  [Padded]  ', '[unclosed'];
    for (const t of texts) {
      expect(isSectionNodeText(t)).toBe(oIsSectionNodeText(t));
    }
    for (const node of [...sectionsTree, null, undefined]) {
      for (const flag of [true, false]) {
        expect(nodeIsSection(node, flag)).toBe(oNodeIsSection(node, flag));
      }
    }
  });

  it('a [Bracketed] node is always a section; a depth-0 plain node only when the setting is on', () => {
    expect(nodeIsSection(sectionsTree[0], false)).toBe(true); // '[Intro]'
    expect(nodeIsSection(sectionsTree[2], false)).toBe(false); // 'not a section', depth 0, setting off
    expect(nodeIsSection(sectionsTree[2], true)).toBe(true); // same node, setting on
    expect(nodeIsSection(sectionsTree[1], true)).toBe(false); // depth 1, never a section via the setting
  });
});

describe('isIdSelected', () => {
  it('matches the oracle across every combination', () => {
    const ids = [1, 2, 3, null];
    const multiCombos = [[], [2], [1, 3]];
    for (const id of ids) {
      for (const selectAll of [true, false]) {
        for (const multi of multiCombos) {
          for (const selected of [1, null]) {
            expect(isIdSelected(id, selectAll, multi, selected)).toBe(oIsIdSelected(id, selectAll, multi, selected));
          }
        }
      }
    }
  });

  it('selectAllMode overrides everything else', () => {
    expect(isIdSelected(999, true, [], null)).toBe(true);
  });

  it('a non-empty multi-selection ignores selectedId entirely', () => {
    expect(isIdSelected(1, false, [2, 3], 1)).toBe(false); // 1 is the "primary" but not in the multi-set
  });

  it('falls back to selectedId only when there is no multi-selection', () => {
    expect(isIdSelected(1, false, [], 1)).toBe(true);
    expect(isIdSelected(2, false, [], 1)).toBe(false);
  });
});

describe('getSelectionRangeIds', () => {
  it('matches the oracle for visible ranges, folded ranges, and misses', () => {
    const cases: Array<[Set<number>, number | null, number | null]> = [
      [new Set(), 10, 15],
      [new Set(), 15, 10],
      [new Set(), 11, 11],
      [new Set([10]), 10, 14],
      [new Set(), 10, 9999],
      [new Set(), null, 14]
    ];
    for (const [collapsed, fromId, toId] of cases) {
      expect(getSelectionRangeIds(nestedTree, collapsed, fromId, toId)).toEqual(
        oGetSelectionRangeIds(nestedTree, collapsed, fromId, toId)
      );
    }
  });

  it('a same-id range is just that one id', () => {
    expect(getSelectionRangeIds(nestedTree, new Set(), 11, 11)).toEqual([11]);
  });

  it('spans in visible order when both ends are visible', () => {
    expect(getSelectionRangeIds(nestedTree, new Set(), 10, 13)).toEqual([10, 11, 12, 13]);
  });

  it('falls back to raw array order when an end is hidden by a fold', () => {
    // A (10) folded hides B/C; asking for a range ending inside the fold still returns ids,
    // just via the raw-array-order fallback path rather than the visible-order path.
    expect(getSelectionRangeIds(nestedTree, new Set([10]), 10, 12)).toEqual([10, 11, 12]);
  });
});
