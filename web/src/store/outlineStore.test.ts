import { describe, expect, it, beforeEach } from 'vitest';
import { useOutlineStore } from './outlineStore';

/**
 * Tests for outlineStore, carrying both Phase 0's validation spike coverage and Phase 2's
 * first slice (docs/framework-migration-plan.md). These test the store's wiring to the real
 * ported core logic (nodeMutations/nodeQueries/nodeSelection), not the core logic itself —
 * that's already covered by nodeMutations.test.ts, nodeQueries.test.ts, and nodeSelection's
 * own coverage. The point here is proving a Zustand store correctly calls into ported,
 * in-place-mutating functions without losing reactivity or introducing a state bug at the
 * wiring layer itself.
 */
describe('outlineStore', () => {
  beforeEach(() => {
    // Reset to a fresh, known tree each test so mutations in one test don't leak into the
    // next — re-invoking the store's own seed initializer isn't exposed, so reconstruct an
    // equivalent shape directly here instead.
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null },
        { id: 2, depth: 1, text: 'child', parentId: 1 },
        { id: 3, depth: 1, text: 'sibling', parentId: 1 }
      ],
      selectedId: 2,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2
    });
  });

  it('selectNode updates selectedId', () => {
    useOutlineStore.getState().selectNode(3);
    expect(useOutlineStore.getState().selectedId).toBe(3);
  });

  it('indentSelected calls the real indentRootIndexes + rebuildParentIdsCore, updating depth and parentId', () => {
    // node 2 is depth 1, preceded by nothing at depth 1 before it other than itself — but
    // node 1 (depth 0) precedes it, so canIndentAt requires a same-depth sibling before it.
    // Select node 3 instead, which has node 2 as a same-depth preceding sibling.
    useOutlineStore.getState().selectNode(3);
    expect(useOutlineStore.getState().canIndentSelected()).toBe(true);
    useOutlineStore.getState().indentSelected();
    const node3 = useOutlineStore.getState().nodes.find((n) => n.id === 3);
    expect(node3?.depth).toBe(2);
    expect(node3?.parentId).toBe(2);
  });

  it('indentSelected is a no-op when canIndentAt is false', () => {
    useOutlineStore.getState().selectNode(1);
    expect(useOutlineStore.getState().canIndentSelected()).toBe(false);
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().indentSelected();
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('outdentSelected calls the real outdentRootIndexes + rebuildParentIdsCore', () => {
    useOutlineStore.getState().selectNode(2);
    useOutlineStore.getState().outdentSelected();
    const node2 = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node2?.depth).toBe(0);
    expect(node2?.parentId).toBe(null);
  });

  it('moveNode calls the real moveNodeBlockCore and rebuilds parentId, returning true on success', () => {
    const moved = useOutlineStore.getState().moveNode(3, 1, 'above');
    expect(moved).toBe(true);
    const nodes = useOutlineStore.getState().nodes;
    expect(nodes.map((n) => n.id)).toEqual([3, 1, 2]);
    expect(nodes.find((n) => n.id === 3)?.depth).toBe(0);
  });

  it("moveNode with 'child' mode nests the dragged node as the target's first child, depth+1", () => {
    const moved = useOutlineStore.getState().moveNode(3, 1, 'child');
    expect(moved).toBe(true);
    const nodes = useOutlineStore.getState().nodes;
    // node 3 (originally depth 1, a sibling of node 2 under node 1) becomes node 1's own
    // first child instead — inserted right after node 1, at depth 1 (1's depth 0 + 1),
    // ahead of node 1's existing child (node 2).
    expect(nodes.map((n) => n.id)).toEqual([1, 3, 2]);
    const node3 = nodes.find((n) => n.id === 3);
    expect(node3?.depth).toBe(1);
    expect(node3?.parentId).toBe(1);
  });

  it("moveNode with 'child' mode un-collapses the target so the newly-nested node is visible", () => {
    useOutlineStore.getState().toggleCollapse(1);
    expect(useOutlineStore.getState().collapsedIds.has(1)).toBe(true);
    useOutlineStore.getState().moveNode(3, 1, 'child');
    expect(useOutlineStore.getState().collapsedIds.has(1)).toBe(false);
  });

  it('moveNode returns false and leaves nodes unchanged for an invalid move (dragging onto itself)', () => {
    const before = useOutlineStore.getState().nodes;
    const moved = useOutlineStore.getState().moveNode(2, 2, 'above');
    expect(moved).toBe(false);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('startEditing sets both selectedId and editingId', () => {
    useOutlineStore.getState().startEditing(3);
    expect(useOutlineStore.getState().selectedId).toBe(3);
    expect(useOutlineStore.getState().editingId).toBe(3);
  });

  it('commitEdit updates the node text and clears editingId', () => {
    useOutlineStore.getState().startEditing(2);
    useOutlineStore.getState().commitEdit(2, 'updated text');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('updated text');
    expect(useOutlineStore.getState().editingId).toBe(null);
  });

  it('cancelEdit clears editingId without touching node text', () => {
    useOutlineStore.getState().startEditing(2);
    useOutlineStore.getState().cancelEdit();
    expect(useOutlineStore.getState().editingId).toBe(null);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('child');
  });

  it('newSiblingBelow inserts a new empty node at the same depth, right after the subtree, selected and in edit mode', () => {
    useOutlineStore.getState().newSiblingBelow(2);
    const { nodes, selectedId, editingId } = useOutlineStore.getState();
    // node 2 (depth 1) has no children of its own, so its "subtree end" is right after it —
    // the new node lands between id 2 and id 3 in document order.
    expect(nodes.map((n) => n.id)).toEqual([1, 2, selectedId, 3]);
    const newNode = nodes.find((n) => n.id === selectedId);
    expect(newNode?.depth).toBe(1);
    expect(newNode?.text).toBe('');
    expect(newNode?.parentId).toBe(1);
    expect(editingId).toBe(selectedId);
  });

  it('newSiblingBelow inserts after the WHOLE subtree when the node has children, not immediately after it', () => {
    // node 1 (depth 0) is the parent of both 2 and 3 — a new sibling of node 1 should land
    // after all of node 1's descendants, not wedged between node 1 and node 2.
    useOutlineStore.getState().newSiblingBelow(1);
    const { nodes, selectedId } = useOutlineStore.getState();
    expect(nodes.map((n) => n.id)).toEqual([1, 2, 3, selectedId]);
    expect(nodes.find((n) => n.id === selectedId)?.depth).toBe(0);
  });

  it('newChild inserts a new node one depth deeper, as the last child', () => {
    useOutlineStore.getState().newChild(2);
    const { nodes, selectedId, editingId } = useOutlineStore.getState();
    expect(nodes.map((n) => n.id)).toEqual([1, 2, selectedId, 3]);
    const newNode = nodes.find((n) => n.id === selectedId);
    expect(newNode?.depth).toBe(2);
    expect(newNode?.parentId).toBe(2);
    expect(editingId).toBe(selectedId);
  });

  it('newChild un-collapses the parent so the newly-created child is actually visible', () => {
    useOutlineStore.getState().toggleCollapse(2);
    expect(useOutlineStore.getState().collapsedIds.has(2)).toBe(true);
    useOutlineStore.getState().newChild(2);
    expect(useOutlineStore.getState().collapsedIds.has(2)).toBe(false);
  });

  it('deleteNode removes the node and selects the preceding node in document order', () => {
    useOutlineStore.getState().deleteNode(2);
    const { nodes, selectedId } = useOutlineStore.getState();
    expect(nodes.map((n) => n.id)).toEqual([1, 3]);
    expect(selectedId).toBe(1);
  });

  it('deleteNode removes the whole subtree, not just the node itself', () => {
    useOutlineStore.getState().newChild(2); // gives node 2 a child, id 100
    useOutlineStore.getState().deleteNode(2);
    const { nodes } = useOutlineStore.getState();
    expect(nodes.map((n) => n.id)).toEqual([1, 3]);
    expect(nodes.find((n) => n.id === 100)).toBeUndefined();
  });

  it('deleteNode refuses to delete the last remaining node', () => {
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'only', parentId: null }], selectedId: 1 });
    useOutlineStore.getState().deleteNode(1);
    expect(useOutlineStore.getState().nodes).toHaveLength(1);
  });

  it('toggleCollapse adds and removes ids from collapsedIds', () => {
    useOutlineStore.getState().toggleCollapse(1);
    expect(useOutlineStore.getState().collapsedIds.has(1)).toBe(true);
    useOutlineStore.getState().toggleCollapse(1);
    expect(useOutlineStore.getState().collapsedIds.has(1)).toBe(false);
  });

  it('visibleIndexes hides a collapsed node\'s descendants via the real ported getVisibleNodeIndexes', () => {
    useOutlineStore.getState().toggleCollapse(1);
    const visible = useOutlineStore.getState().visibleIndexes();
    const nodes = useOutlineStore.getState().nodes;
    const visibleIds = visible.map((i) => nodes[i].id);
    expect(visibleIds).toEqual([1]);
  });

  it('nodeHasChildren correctly reports true/false via the real ported nodeHasChildren', () => {
    expect(useOutlineStore.getState().nodeHasChildren(1)).toBe(true);
    expect(useOutlineStore.getState().nodeHasChildren(2)).toBe(false);
  });

  it('moveNode always resolves to a plain single selection on the moved node (matches legacy)', () => {
    useOutlineStore.getState().moveNode(3, 1, 'above');
    const { selectedId, selectionAnchorId, multiSelectedIds } = useOutlineStore.getState();
    expect(selectedId).toBe(3);
    expect(selectionAnchorId).toBe(3);
    expect(multiSelectedIds).toEqual([]);
  });
});

describe('outlineStore multi-select', () => {
  // A 5-node tree, deep enough to exercise Shift-range and Ctrl-toggle plus multi-select
  // indent/outdent/delete/move, none of which the 3-node beforeEach tree above has room for.
  //   1 (depth 0)
  //     2 (depth 1)
  //       3 (depth 2)
  //     4 (depth 1)
  //     5 (depth 1)
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null },
        { id: 2, depth: 1, text: 'child-a', parentId: 1 },
        { id: 3, depth: 2, text: 'grandchild', parentId: 2 },
        { id: 4, depth: 1, text: 'child-b', parentId: 1 },
        { id: 5, depth: 1, text: 'child-c', parentId: 1 }
      ],
      selectedId: null,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: null
    });
  });

  it('clickNode with no modifiers behaves as a plain single selection, clearing any prior multi-selection', () => {
    useOutlineStore.getState().clickNode(2, { ctrlKey: true });
    useOutlineStore.getState().clickNode(4, { ctrlKey: true });
    expect(useOutlineStore.getState().multiSelectedIds).toEqual([2, 4]);
    useOutlineStore.getState().clickNode(5, {});
    const { selectedId, multiSelectedIds, selectionAnchorId } = useOutlineStore.getState();
    expect(selectedId).toBe(5);
    expect(multiSelectedIds).toEqual([]);
    expect(selectionAnchorId).toBe(5);
  });

  it('clickNode with ctrlKey toggles membership, building a multi-selection in document order', () => {
    useOutlineStore.getState().clickNode(4, { ctrlKey: true });
    useOutlineStore.getState().clickNode(2, { ctrlKey: true });
    // Clicked in id order 4 then 2, but membership is re-derived in document order (1,2,3,4,5).
    expect(useOutlineStore.getState().multiSelectedIds).toEqual([2, 4]);
  });

  it('clickNode with ctrlKey collapses back to a plain single selection once toggling leaves 0-1 ids', () => {
    useOutlineStore.getState().clickNode(4, { ctrlKey: true });
    useOutlineStore.getState().clickNode(2, { ctrlKey: true });
    // Toggle 4 back off — only 2 remains, so this should collapse to a plain single selection,
    // not a one-element multiSelectedIds array (matches legacy's own toggle handler exactly).
    useOutlineStore.getState().clickNode(4, { ctrlKey: true });
    const { selectedId, multiSelectedIds } = useOutlineStore.getState();
    expect(selectedId).toBe(2);
    expect(multiSelectedIds).toEqual([]);
  });

  it('clickNode with shiftKey selects a range from the anchor via the ported getSelectionRangeIds', () => {
    useOutlineStore.getState().clickNode(1, {}); // anchor = 1
    useOutlineStore.getState().clickNode(4, { shiftKey: true });
    expect(useOutlineStore.getState().multiSelectedIds).toEqual([1, 2, 3, 4]);
    expect(useOutlineStore.getState().selectedId).toBe(4);
  });

  it('selectedIds() falls back to a plain single selection when no multi-selection is active', () => {
    useOutlineStore.getState().clickNode(1, {});
    expect(useOutlineStore.getState().selectedIds()).toEqual([1]);
  });

  it('selectedIds() returns the multi-selection when active', () => {
    useOutlineStore.getState().clickNode(4, { ctrlKey: true });
    useOutlineStore.getState().clickNode(5, { ctrlKey: true });
    expect(useOutlineStore.getState().selectedIds()).toEqual([4, 5]);
  });

  it('indentSelected indents every root of a multi-selection at once, all-or-nothing on canIndentAt', () => {
    useOutlineStore.getState().clickNode(4, { ctrlKey: true });
    useOutlineStore.getState().clickNode(5, { ctrlKey: true });
    useOutlineStore.getState().indentSelected();
    const nodes = useOutlineStore.getState().nodes;
    expect(nodes.find((n) => n.id === 4)?.depth).toBe(2);
    expect(nodes.find((n) => n.id === 5)?.depth).toBe(2);
  });

  it('outdentSelected outdents every root of a multi-selection at once', () => {
    useOutlineStore.getState().clickNode(2, { ctrlKey: true });
    useOutlineStore.getState().clickNode(4, { ctrlKey: true });
    useOutlineStore.getState().outdentSelected();
    const nodes = useOutlineStore.getState().nodes;
    expect(nodes.find((n) => n.id === 2)?.depth).toBe(0);
    expect(nodes.find((n) => n.id === 4)?.depth).toBe(0);
    // node 3 is node 2's child, carried along with its parent's whole subtree.
    expect(nodes.find((n) => n.id === 3)?.depth).toBe(1);
  });

  it('deleteSelected removes every root of a multi-selection, including each root\'s whole subtree', () => {
    useOutlineStore.getState().clickNode(2, { ctrlKey: true }); // has child 3
    useOutlineStore.getState().clickNode(5, { ctrlKey: true });
    useOutlineStore.getState().deleteSelected();
    const { nodes, multiSelectedIds } = useOutlineStore.getState();
    expect(nodes.map((n) => n.id)).toEqual([1, 4]);
    expect(multiSelectedIds).toEqual([]);
  });

  it('moveNode with a draggedIds array moves a whole multi-selection as one combined block', () => {
    useOutlineStore.getState().clickNode(4, { ctrlKey: true });
    useOutlineStore.getState().clickNode(5, { ctrlKey: true });
    const moved = useOutlineStore.getState().moveNode(4, 2, 'child', [4, 5]);
    expect(moved).toBe(true);
    const { nodes, selectedId, selectionAnchorId, multiSelectedIds } = useOutlineStore.getState();
    // 4 and 5 both nested under node 2, ahead of its existing child (3).
    expect(nodes.map((n) => n.id)).toEqual([1, 2, 4, 5, 3]);
    expect(nodes.find((n) => n.id === 4)?.depth).toBe(2);
    expect(nodes.find((n) => n.id === 5)?.depth).toBe(2);
    // Matches legacy's moveMultipleNodeBlocks: selection collapses to the surviving multi-set,
    // anchored on the first originally-dragged id.
    expect(selectedId).toBe(4);
    expect(selectionAnchorId).toBe(4);
    expect(multiSelectedIds).toEqual([4, 5]);
  });
});

describe('outlineStore sortChildren', () => {
  beforeEach(() => {
    // Charlie(0)=1, Alice(0)=2 -> child(1)=3, Bob(0)=4
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'Charlie', parentId: null },
        { id: 2, depth: 0, text: 'Alice', parentId: null },
        { id: 3, depth: 1, text: 'Alice-child', parentId: 2 },
        { id: 4, depth: 0, text: 'Bob', parentId: null }
      ],
      selectedId: 1,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 1
    });
  });

  it('sorts root blocks (parentId null) A -> Z via the real ported sortChildBlocksCore', () => {
    const sorted = useOutlineStore.getState().sortChildren(null, 'az');
    expect(sorted).toBe(true);
    const nodes = useOutlineStore.getState().nodes;
    expect(nodes.map((n) => n.id)).toEqual([2, 3, 4, 1]); // Alice(+child), Bob, Charlie
  });

  it('sorts root blocks Z -> A', () => {
    useOutlineStore.getState().sortChildren(null, 'za');
    const nodes = useOutlineStore.getState().nodes;
    expect(nodes.map((n) => n.id)).toEqual([1, 4, 2, 3]); // Charlie, Bob, Alice(+child)
  });

  it('sorts an existing node\'s children when given a specific parentId, not root blocks', () => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'Root', parentId: null },
        { id: 2, depth: 1, text: 'Zed', parentId: 1 },
        { id: 3, depth: 1, text: 'Amy', parentId: 1 }
      ]
    });
    const sorted = useOutlineStore.getState().sortChildren(1, 'az');
    expect(sorted).toBe(true);
    expect(useOutlineStore.getState().nodes.map((n) => n.id)).toEqual([1, 3, 2]); // Root, Amy, Zed
  });

  it('rebuilds parentId after reordering, since sortChildBlocksCore does not do this itself', () => {
    useOutlineStore.getState().sortChildren(null, 'az');
    const nodes = useOutlineStore.getState().nodes;
    // node 3 (Alice's child) should still point at Alice (id 2) as its parent post-sort.
    expect(nodes.find((n) => n.id === 3)?.parentId).toBe(2);
  });

  it('returns false and leaves nodes unchanged for an unknown parentId', () => {
    const before = useOutlineStore.getState().nodes;
    const sorted = useOutlineStore.getState().sortChildren(9999, 'az');
    expect(sorted).toBe(false);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('returns false and leaves nodes unchanged when there are fewer than 2 blocks to sort', () => {
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'only', parentId: null }] });
    const before = useOutlineStore.getState().nodes;
    const sorted = useOutlineStore.getState().sortChildren(null, 'az');
    expect(sorted).toBe(false);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });
});
