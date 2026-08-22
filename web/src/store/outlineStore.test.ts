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
      nextId: 100
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
});
