import { describe, expect, it, beforeEach } from 'vitest';
import { useOutlineStore, duplicateRootIndexesCore, defaultNodeStyles } from './outlineStore';

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
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2,
      undoStack: [],
      redoStack: []
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

  it('commitEdit rewrites every [[mention]] of a node when that node itself is renamed (Phase 6.4 backlinks)', () => {
    // node 3 "sibling" is @-mentioned from node 1's text; renaming node 2 (the mentioner)
    // shouldn't touch it -- only renaming the MENTIONED node (3) should rewrite the reference.
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'see [[sibling]] for context', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ]
    });
    useOutlineStore.getState().commitEdit(3, 'renamed target');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('see [[renamed target]] for context');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.text).toBe('renamed target');
  });

  it('commitEdit does NOT rewrite mentions on a case-only rename (matches legacy: renameBacklinksFor is a no-op then)', () => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'see [[sibling]] for context', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 0, text: 'sibling', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ]
    });
    useOutlineStore.getState().commitEdit(3, 'Sibling');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('see [[sibling]] for context');
  });

  it('applyAiTextResult updates the node text without touching editingId (unlike commitEdit)', () => {
    useOutlineStore.getState().startEditing(3); // a DIFFERENT node is actively being edited
    useOutlineStore.getState().applyAiTextResult(2, 'ai-rewritten text');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('ai-rewritten text');
    expect(useOutlineStore.getState().editingId).toBe(3); // still node 3's edit session, untouched
  });

  it('applyAiTextResult is a no-op for a node id that no longer exists', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().applyAiTextResult(999999, 'ignored');
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('applyAiTextResult is a no-op (no undo checkpoint) when the text is unchanged', () => {
    const before = useOutlineStore.getState().nodes;
    const canUndoBefore = useOutlineStore.getState().canUndo();
    useOutlineStore.getState().applyAiTextResult(2, useOutlineStore.getState().nodes.find((n) => n.id === 2)!.text ?? '');
    expect(useOutlineStore.getState().nodes).toBe(before);
    expect(useOutlineStore.getState().canUndo()).toBe(canUndoBefore);
  });

  it('applyAiTextResult rewrites [[mentions]] of the renamed node, same as commitEdit', () => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'see [[sibling]] for context', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 0, text: 'sibling', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ]
    });
    useOutlineStore.getState().applyAiTextResult(3, 'renamed target');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('see [[renamed target]] for context');
  });

  it('applyAiTextResult pushes a real undo checkpoint that undo() can revert', () => {
    const originalText = useOutlineStore.getState().nodes.find((n) => n.id === 2)!.text;
    useOutlineStore.getState().applyAiTextResult(2, 'ai-rewritten text');
    expect(useOutlineStore.getState().canUndo()).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe(originalText);
  });

  it('insertGeneratedOutline nests rows as children of the selected node (depth+1)', () => {
    // seed: selectedId=2 (depth 1)
    const ids = useOutlineStore.getState().insertGeneratedOutline([
      { text: 'child of 2', depth: 0 },
      { text: 'grandchild', depth: 1 }
    ]);
    expect(ids).toHaveLength(2);
    const nodes = useOutlineStore.getState().nodes;
    const a = nodes.find((n) => n.id === ids[0])!;
    const b = nodes.find((n) => n.id === ids[1])!;
    expect(a.depth).toBe(2); // selected node 2's own depth (1) + 1
    expect(b.depth).toBe(3);
    expect(a.text).toBe('child of 2');
    expect(b.text).toBe('grandchild');
  });

  it('insertGeneratedOutline splices right after the selected node\'s own subtree', () => {
    const ids = useOutlineStore.getState().insertGeneratedOutline([{ text: 'new', depth: 0 }]);
    const nodes = useOutlineStore.getState().nodes;
    // seed order: 1 (root), 2 (child, selected), 3 (sibling) -- inserted after node 2's subtree end
    expect(nodes.map((n) => n.id)).toEqual([1, 2, ids[0], 3]);
  });

  it('insertGeneratedOutline replaces the whole document when nothing is selected', () => {
    useOutlineStore.setState({ selectedId: null });
    const ids = useOutlineStore.getState().insertGeneratedOutline([
      { text: 'a', depth: 0 },
      { text: 'b', depth: 1 }
    ]);
    const nodes = useOutlineStore.getState().nodes;
    expect(nodes.map((n) => n.id)).toEqual(ids);
    expect(nodes.map((n) => n.depth)).toEqual([0, 1]);
  });

  it('insertGeneratedOutline replaces the whole document when it is empty', () => {
    useOutlineStore.setState({ nodes: [], selectedId: null });
    const ids = useOutlineStore.getState().insertGeneratedOutline([{ text: 'only node', depth: 0 }]);
    expect(useOutlineStore.getState().nodes.map((n) => n.id)).toEqual(ids);
  });

  it('insertGeneratedOutline is a no-op for an empty rows array', () => {
    const before = useOutlineStore.getState().nodes;
    const ids = useOutlineStore.getState().insertGeneratedOutline([]);
    expect(ids).toEqual([]);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('insertGeneratedOutline mints new ids from nextId and bumps it past what it used', () => {
    const startNextId = useOutlineStore.getState().nextId;
    const ids = useOutlineStore.getState().insertGeneratedOutline([{ text: 'a', depth: 0 }, { text: 'b', depth: 0 }]);
    expect(ids).toEqual([startNextId, startNextId + 1]);
    expect(useOutlineStore.getState().nextId).toBe(startNextId + 2);
  });

  it('insertGeneratedOutline selects the first newly-inserted node', () => {
    const ids = useOutlineStore.getState().insertGeneratedOutline([{ text: 'a', depth: 0 }]);
    expect(useOutlineStore.getState().selectedId).toBe(ids[0]);
  });

  it('insertGeneratedOutline pushes a real undo checkpoint', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().insertGeneratedOutline([{ text: 'a', depth: 0 }]);
    expect(useOutlineStore.getState().canUndo()).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toEqual(before);
  });

  it('expandNodeChildren inserts new children right after the parent, at depth+1', () => {
    // seed: node 1 (depth 0), node 2 (depth 1, child of 1), node 3 (depth 1, sibling)
    const ids = useOutlineStore.getState().expandNodeChildren(1, ['a', 'b']);
    expect(ids).toHaveLength(2);
    const nodes = useOutlineStore.getState().nodes;
    // spliced at idx+1 (immediately after node 1), so they land BEFORE node 1's existing child 2
    expect(nodes.map((n) => n.id)).toEqual([1, ids[0], ids[1], 2, 3]);
    expect(nodes.find((n) => n.id === ids[0])?.depth).toBe(1);
    expect(nodes.find((n) => n.id === ids[0])?.parentId).toBe(1);
  });

  it('expandNodeChildren is a no-op for an empty texts array', () => {
    const before = useOutlineStore.getState().nodes;
    const ids = useOutlineStore.getState().expandNodeChildren(1, []);
    expect(ids).toEqual([]);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('expandNodeChildren is a no-op for a parent id that does not exist', () => {
    const before = useOutlineStore.getState().nodes;
    const ids = useOutlineStore.getState().expandNodeChildren(999999, ['a']);
    expect(ids).toEqual([]);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('expandNodeChildren selects the first new child and pushes a real undo checkpoint', () => {
    const before = useOutlineStore.getState().nodes;
    const ids = useOutlineStore.getState().expandNodeChildren(1, ['a', 'b']);
    expect(useOutlineStore.getState().selectedId).toBe(ids[0]);
    expect(useOutlineStore.getState().canUndo()).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toEqual(before);
  });

  it('addSuggestedTags adds only genuinely new tags and returns them', () => {
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.map((n) => (n.id === 2 ? { ...n, tags: ['existing'] } : n))
    });
    const added = useOutlineStore.getState().addSuggestedTags(2, ['existing', 'new-one', 'new-two']);
    expect(added).toEqual(['new-one', 'new-two']);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.tags).toEqual(['existing', 'new-one', 'new-two']);
  });

  it('addSuggestedTags is a real no-op (no undo checkpoint) when every tag is already present', () => {
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.map((n) => (n.id === 2 ? { ...n, tags: ['a', 'b'] } : n))
    });
    const canUndoBefore = useOutlineStore.getState().canUndo();
    const added = useOutlineStore.getState().addSuggestedTags(2, ['a', 'b']);
    expect(added).toEqual([]);
    expect(useOutlineStore.getState().canUndo()).toBe(canUndoBefore);
  });

  it('addSuggestedTags returns [] for a node id that does not exist', () => {
    expect(useOutlineStore.getState().addSuggestedTags(999999, ['x'])).toEqual([]);
  });

  it('addSuggestedTags pushes a real undo checkpoint when tags actually change', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().addSuggestedTags(2, ['brand-new']);
    expect(useOutlineStore.getState().canUndo()).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toEqual(before);
  });

  it('applySuggestedIcons applies matching entries and reports how many applied', () => {
    const applied = useOutlineStore.getState().applySuggestedIcons([
      { id: 2, expectedText: 'child', finalText: '🛒 child' },
      { id: 3, expectedText: 'sibling', finalText: '🚀 sibling' }
    ]);
    expect(applied).toBe(2);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('🛒 child');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.text).toBe('🚀 sibling');
  });

  it('applySuggestedIcons skips an entry with an empty finalText (no usable icon found)', () => {
    const applied = useOutlineStore.getState().applySuggestedIcons([{ id: 2, expectedText: 'child', finalText: '' }]);
    expect(applied).toBe(0);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('child');
  });

  it('applySuggestedIcons skips an entry whose text no longer matches expectedText (in-flight-edit guard)', () => {
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.map((n) => (n.id === 2 ? { ...n, text: 'edited since' } : n))
    });
    const applied = useOutlineStore.getState().applySuggestedIcons([{ id: 2, expectedText: 'child', finalText: '🛒 child' }]);
    expect(applied).toBe(0);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('edited since');
  });

  it('applySuggestedIcons skips an entry whose node no longer exists', () => {
    const applied = useOutlineStore.getState().applySuggestedIcons([{ id: 999999, expectedText: 'x', finalText: '🛒 x' }]);
    expect(applied).toBe(0);
  });

  it('applySuggestedIcons is a real no-op (no undo checkpoint) when nothing applies', () => {
    const canUndoBefore = useOutlineStore.getState().canUndo();
    useOutlineStore.getState().applySuggestedIcons([{ id: 2, expectedText: 'not the real text', finalText: '🛒 child' }]);
    expect(useOutlineStore.getState().canUndo()).toBe(canUndoBefore);
  });

  it('applySuggestedIcons pushes one real undo checkpoint covering every applied entry', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().applySuggestedIcons([
      { id: 2, expectedText: 'child', finalText: '🛒 child' },
      { id: 3, expectedText: 'sibling', finalText: '🚀 sibling' }
    ]);
    expect(useOutlineStore.getState().canUndo()).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toEqual(before);
  });

  it('applyIconChoice prepends the icon to the node\'s bare text', () => {
    const ok = useOutlineStore.getState().applyIconChoice(2, '🛒');
    expect(ok).toBe(true);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('🛒 child');
  });

  it('applyIconChoice re-strips an existing leading icon before applying the new one', () => {
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.map((n) => (n.id === 2 ? { ...n, text: '📌 child' } : n))
    });
    useOutlineStore.getState().applyIconChoice(2, '🛒');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('🛒 child');
  });

  it('applyIconChoice returns false for a node id that does not exist', () => {
    expect(useOutlineStore.getState().applyIconChoice(999999, '🛒')).toBe(false);
  });

  it('applyIconChoice pushes a real undo checkpoint', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().applyIconChoice(2, '🛒');
    expect(useOutlineStore.getState().canUndo()).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toEqual(before);
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

  it('deleteNode strips [[mentions]] of the deleted node from every other node (Phase 6.4 backlinks)', () => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'see [[sibling]] for context', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ]
    });
    useOutlineStore.getState().deleteNode(3);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('see for context');
  });

  it('deleteNode refuses to delete the last remaining node', () => {
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'only', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() }], selectedId: 1 });
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
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child-a', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 2, text: 'grandchild', parentId: 2, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 4, depth: 1, text: 'child-b', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 5, depth: 1, text: 'child-c', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() }
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

  it('deleteSelected strips [[mentions]] of every deleted node (including whole-subtree deletes) from the survivors (Phase 6.4 backlinks)', () => {
    // node 1 mentions both "grandchild" (inside node 2's own deleted subtree) and "child-c"
    // (a root of the selection itself) -- both references should be stripped.
    useOutlineStore.setState((s) => ({
      nodes: s.nodes.map((n) => (n.id === 1 ? { ...n, text: 'see [[grandchild]] and [[child-c]]' } : n))
    }));
    useOutlineStore.getState().clickNode(2, { ctrlKey: true }); // subtree includes node 3 "grandchild"
    useOutlineStore.getState().clickNode(5, { ctrlKey: true }); // "child-c"
    useOutlineStore.getState().deleteSelected();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('see and');
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
        { id: 1, depth: 0, text: 'Charlie', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 0, text: 'Alice', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'Alice-child', parentId: 2, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 4, depth: 0, text: 'Bob', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() }
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
        { id: 1, depth: 0, text: 'Root', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'Zed', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'Amy', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() }
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
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'only', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() }] });
    const before = useOutlineStore.getState().nodes;
    const sorted = useOutlineStore.getState().sortChildren(null, 'az');
    expect(sorted).toBe(false);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });
});

describe('outlineStore splitAtCursor', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'hello world', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      editingId: 2,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2
    });
  });

  it('keeps the text before the caret on the original node, moving the rest to a new sibling', () => {
    useOutlineStore.getState().splitAtCursor(2, 'hello world', 5);
    const { nodes } = useOutlineStore.getState();
    expect(nodes.find((n) => n.id === 2)?.text).toBe('hello');
    const newNode = nodes.find((n) => n.id === 100);
    expect(newNode?.text).toBe(' world');
    expect(newNode?.depth).toBe(1);
    expect(newNode?.parentId).toBe(1);
  });

  it('inserts the new sibling right after the whole subtree, not immediately after the node', () => {
    useOutlineStore.getState().newChild(2); // gives node 2 a child, id 100
    useOutlineStore.getState().splitAtCursor(2, 'hello world', 5);
    const { nodes } = useOutlineStore.getState();
    // node 2's subtree is [2, 100(child)]; the split-off sibling (id 101) must land after
    // both, not wedged between node 2 and its existing child.
    expect(nodes.map((n) => n.id)).toEqual([1, 2, 100, 101, 3]);
  });

  it('selects and begins editing the new node, clearing any stale multi-selection', () => {
    useOutlineStore.getState().splitAtCursor(2, 'hello world', 5);
    const { selectedId, editingId, multiSelectedIds, selectionAnchorId } = useOutlineStore.getState();
    expect(selectedId).toBe(100);
    expect(editingId).toBe(100);
    expect(multiSelectedIds).toEqual([]);
    expect(selectionAnchorId).toBe(100);
  });

  it('clamps an out-of-range caret position to the text bounds', () => {
    useOutlineStore.getState().splitAtCursor(2, 'hello world', 9999);
    const { nodes } = useOutlineStore.getState();
    expect(nodes.find((n) => n.id === 2)?.text).toBe('hello world');
    expect(nodes.find((n) => n.id === 100)?.text).toBe('');
  });

  it('is a no-op for an unknown node id', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().splitAtCursor(9999, 'anything', 3);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });
});

describe('outlineStore checkboxes', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: false, checked: false, note: "", codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      editingId: 2,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2
    });
  });

  it('commitEdit auto-converts "[ ] text" into an unchecked checkbox node', () => {
    useOutlineStore.getState().commitEdit(2, '[ ] buy milk');
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node?.isCheckbox).toBe(true);
    expect(node?.checked).toBe(false);
    expect(node?.text).toBe('buy milk');
  });

  it('commitEdit auto-converts "[x] text" (case-insensitive) into a checked checkbox node', () => {
    useOutlineStore.getState().commitEdit(2, '[X] done already');
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node?.isCheckbox).toBe(true);
    expect(node?.checked).toBe(true);
    expect(node?.text).toBe('done already');
  });

  it('commitEdit leaves ordinary text alone (no accidental checkbox conversion)', () => {
    useOutlineStore.getState().commitEdit(2, 'just a normal node');
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node?.isCheckbox).toBe(false);
    expect(node?.text).toBe('just a normal node');
  });

  it('toggleCheckbox flips .checked on a checkbox node', () => {
    useOutlineStore.getState().commitEdit(2, '[ ] task');
    useOutlineStore.getState().toggleCheckbox(2);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.checked).toBe(true);
    useOutlineStore.getState().toggleCheckbox(2);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.checked).toBe(false);
  });

  it('toggleCheckbox cascades down and propagates up via the real ported toggleCheckboxCore', () => {
    // root(1, checkbox) -> child(2, checkbox, unchecked, currently the only child)
    useOutlineStore.getState().commitEdit(1, '[ ] parent task');
    useOutlineStore.getState().commitEdit(2, '[ ] child task');
    // node 3 (sibling) stays a non-checkbox plain node -- but it's also a sibling of node 2 at
    // depth 1, not a child of node 1... wait, per the seeded tree, node 3 IS depth 1 under
    // node 1 too (both 2 and 3 are node 1's children). Convert it too, so completing "parent"
    // requires both.
    useOutlineStore.getState().commitEdit(3, '[ ] sibling task');
    useOutlineStore.getState().toggleCheckbox(2);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.checked).toBe(false); // sibling still unchecked
    useOutlineStore.getState().toggleCheckbox(3);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.checked).toBe(true); // now both done
  });

  it('is a no-op for an unknown node id', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().toggleCheckbox(9999);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });
});

describe('outlineStore setNote', () => {
  it('sets a note on a node', () => {
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }] });
    useOutlineStore.getState().setNote(1, 'remember this');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.note).toBe('remember this');
  });

  it('is a no-op for an unknown node id', () => {
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }] });
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().setNote(9999, 'x');
    expect(useOutlineStore.getState().nodes).toBe(before);
  });
});

describe('outlineStore setCodeBlock', () => {
  it('sets a code block on a node', () => {
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }] });
    useOutlineStore.getState().setCodeBlock(1, { lang: 'python', code: 'print(1)' });
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.codeBlock).toEqual({ lang: 'python', code: 'print(1)' });
  });

  it('clears a code block by setting it to null', () => {
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: { lang: 'plain', code: 'x' }, tags: [], styles: defaultNodeStyles() }] });
    useOutlineStore.getState().setCodeBlock(1, null);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.codeBlock).toBeNull();
  });

  it('is a no-op for an unknown node id', () => {
    useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }] });
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().setCodeBlock(9999, { lang: 'plain', code: 'x' });
    expect(useOutlineStore.getState().nodes).toBe(before);
  });
});

describe('outlineStore toggleTag', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 0, text: 'other', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: ['keep'], styles: defaultNodeStyles() }
      ],
      activeTagFilter: null,
      focusedId: null
    });
  });

  it('adds a tag that is not yet present', () => {
    useOutlineStore.getState().toggleTag(1, 'urgent');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.tags).toEqual(['urgent']);
  });

  it('removes a tag that is already present (toggle off)', () => {
    useOutlineStore.getState().toggleTag(2, 'keep');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.tags).toEqual([]);
  });

  it('trims whitespace and ignores an empty/whitespace-only tag', () => {
    useOutlineStore.getState().toggleTag(1, '  spaced  ');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.tags).toEqual(['spaced']);
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().toggleTag(1, '   ');
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('is a no-op for an unknown node id', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().toggleTag(9999, 'x');
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('does not affect other nodes\' tags', () => {
    useOutlineStore.getState().toggleTag(1, 'urgent');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.tags).toEqual(['keep']);
  });
});

describe('outlineStore setTagFilter + visibleIndexes (tag scoping)', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: ['work'], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child-tagged', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: ['home'], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'child-untagged', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      collapsedIds: new Set(),
      activeTagFilter: null,
      focusedId: null
    });
  });

  it('with no filter, every visible index is returned (unchanged base behavior)', () => {
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([0, 1, 2]);
  });

  it('restricts to only nodes carrying the active tag, flat (no ancestor context restored)', () => {
    useOutlineStore.getState().setTagFilter('home');
    // Only index 1 (child-tagged) carries 'home' -- its parent (index 0) does NOT carry it and
    // is deliberately not restored, matching the documented flat-filter scoping.
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([1]);
  });

  it('returns an empty list when no node carries the filtered tag', () => {
    useOutlineStore.getState().setTagFilter('nonexistent');
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([]);
  });

  it('clearing the filter (null) restores the full visible list', () => {
    useOutlineStore.getState().setTagFilter('home');
    useOutlineStore.getState().setTagFilter(null);
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([0, 1, 2]);
  });

  it('respects fold state underneath the tag filter', () => {
    useOutlineStore.setState({ collapsedIds: new Set([1]) }); // fold node id 1 (root)
    useOutlineStore.getState().setTagFilter('home');
    // Node 2 ('home') is now hidden by the fold, so no visible index should carry it through.
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([]);
  });
});

describe('outlineStore zoomIntoNode / exitFocus / focusPath + visibleIndexes (focus scoping)', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'branch', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 2, text: 'leaf-a', parentId: 2, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 4, depth: 2, text: 'leaf-b', parentId: 2, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 5, depth: 0, text: 'unrelated-root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      collapsedIds: new Set(),
      activeTagFilter: null,
      focusedId: null
    });
  });

  it('restricts visibleIndexes to only the focused node\'s subtree, excluding the focused node\'s own row', () => {
    useOutlineStore.getState().zoomIntoNode(2);
    // Index 1 is node id 2 (branch) itself -- excluded. Indexes 2,3 are its children (leaf-a/b).
    // Index 4 (unrelated-root) is outside the subtree entirely.
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([2, 3]);
  });

  it('is a no-op for an unknown node id', () => {
    useOutlineStore.getState().zoomIntoNode(9999);
    expect(useOutlineStore.getState().focusedId).toBeNull();
  });

  it('exitFocus clears focus and restores the full visible list', () => {
    useOutlineStore.getState().zoomIntoNode(2);
    useOutlineStore.getState().exitFocus();
    expect(useOutlineStore.getState().focusedId).toBeNull();
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([0, 1, 2, 3, 4]);
  });

  it('focusPath returns the ancestor chain from root down to (not including) the focused node', () => {
    useOutlineStore.getState().zoomIntoNode(3); // leaf-a, ancestors: root (1) -> branch (2)
    expect(useOutlineStore.getState().focusPath().map((n) => n.id)).toEqual([1, 2]);
  });

  it('focusPath is empty when nothing is focused', () => {
    expect(useOutlineStore.getState().focusPath()).toEqual([]);
  });

  it('focusPath is empty when focused on a top-level node (no ancestors)', () => {
    useOutlineStore.getState().zoomIntoNode(1);
    expect(useOutlineStore.getState().focusPath()).toEqual([]);
  });

  it('fails open to the full view if the focused node was deleted out from under an active focus', () => {
    useOutlineStore.getState().zoomIntoNode(2);
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.filter((n) => n.id !== 2 && n.id !== 3 && n.id !== 4)
    });
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([0, 1]);
  });

  it('combines focus subtree scoping with an active tag filter, narrowing within the subtree', () => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'branch', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: ['x'], styles: defaultNodeStyles() },
        { id: 3, depth: 2, text: 'leaf-a', parentId: 2, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: ['x'], styles: defaultNodeStyles() },
        { id: 4, depth: 2, text: 'leaf-b', parentId: 2, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ]
    });
    useOutlineStore.getState().zoomIntoNode(2);
    useOutlineStore.getState().setTagFilter('x');
    // Subtree of node 2 is indexes [2,3] (leaf-a, leaf-b); only leaf-a (index 2) carries 'x'.
    expect(useOutlineStore.getState().visibleIndexes()).toEqual([2]);
  });
});

describe('outlineStore undo/redo (Phase 6.2: foundational undo/redo)', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2,
      undoStack: [],
      redoStack: []
    });
  });

  it('canUndo/canRedo are false with empty stacks', () => {
    expect(useOutlineStore.getState().canUndo()).toBe(false);
    expect(useOutlineStore.getState().canRedo()).toBe(false);
  });

  it('undo() on an empty stack is a safe no-op', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('redo() on an empty stack is a safe no-op', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().redo();
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('deleteNode is undoable -- the deleted node comes back', () => {
    useOutlineStore.getState().deleteNode(3);
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 3)).toBe(false);
    expect(useOutlineStore.getState().canUndo()).toBe(true);

    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 3)).toBe(true);
  });

  it('undo followed by redo restores the mutation again', () => {
    useOutlineStore.getState().deleteNode(3);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 3)).toBe(true);
    expect(useOutlineStore.getState().canRedo()).toBe(true);

    useOutlineStore.getState().redo();
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 3)).toBe(false);
  });

  it('a new mutation after undo clears the redo stack (matches legacy: a fresh edit discards the future it replaced)', () => {
    useOutlineStore.getState().deleteNode(3);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().canRedo()).toBe(true);

    useOutlineStore.getState().newSiblingBelow(2);
    expect(useOutlineStore.getState().canRedo()).toBe(false);
  });

  it('multiple undos walk back through several mutations in reverse order', () => {
    useOutlineStore.getState().newSiblingBelow(2); // creates a new node (id 100)
    useOutlineStore.getState().deleteNode(3);
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 100)).toBe(true);
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 3)).toBe(false);

    useOutlineStore.getState().undo(); // undoes the delete
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 3)).toBe(true);
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 100)).toBe(true);

    useOutlineStore.getState().undo(); // undoes the creation
    expect(useOutlineStore.getState().nodes.some((n) => n.id === 100)).toBe(false);
  });

  it('commitEdit does NOT push an undo checkpoint when the text is unchanged (matches legacy: no undo slot wasted on a no-op edit)', () => {
    const node2 = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node2).toBeDefined();
    const originalText: string = node2?.text ?? '';
    useOutlineStore.getState().commitEdit(2, originalText);
    expect(useOutlineStore.getState().canUndo()).toBe(false);
  });

  it('commitEdit DOES push an undo checkpoint when the text actually changes', () => {
    useOutlineStore.getState().commitEdit(2, 'changed text');
    expect(useOutlineStore.getState().canUndo()).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('child');
  });

  it('commitEdit still pushes a checkpoint for an unchanged-text checkbox auto-convert (matches legacy)', () => {
    useOutlineStore.getState().commitEdit(2, '[ ] child'); // same base text, but triggers checkbox auto-convert
    expect(useOutlineStore.getState().canUndo()).toBe(true);
  });

  it('setNote does not push an undo checkpoint for an unchanged value', () => {
    useOutlineStore.getState().setNote(2, '');
    expect(useOutlineStore.getState().canUndo()).toBe(false);
  });

  it('setNote pushes a checkpoint and is undoable when the note actually changes', () => {
    useOutlineStore.getState().setNote(2, 'a real note');
    expect(useOutlineStore.getState().canUndo()).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.note).toBe('');
  });

  it('a failed moveNode (e.g. dropping a node onto itself) does not leave a stray undo entry', () => {
    const before = useOutlineStore.getState().canUndo();
    const moved = useOutlineStore.getState().moveNode(2, 2, 'below');
    expect(moved).toBe(false);
    expect(useOutlineStore.getState().canUndo()).toBe(before);
  });

  it('undo restores selection state, not just node content', () => {
    useOutlineStore.getState().selectNode(3);
    useOutlineStore.getState().deleteNode(3);
    // deleteNode falls back the selection to node 2 (the preceding node)
    expect(useOutlineStore.getState().selectedId).toBe(2);

    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().selectedId).toBe(3);
  });

  it('undo never resumes mid-inline-edit (editingId is always cleared)', () => {
    useOutlineStore.getState().startEditing(2);
    expect(useOutlineStore.getState().editingId).toBe(2);
    useOutlineStore.getState().deleteNode(3);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().editingId).toBeNull();
  });

  it('nextId only ever moves forward across undo, even when restoring an earlier snapshot (prevents id collisions with anything still redoable)', () => {
    useOutlineStore.getState().newSiblingBelow(2); // consumes nextId 100, now nextId is 101
    expect(useOutlineStore.getState().nextId).toBe(101);
    useOutlineStore.getState().undo(); // back to nextId 100 semantically, but...
    expect(useOutlineStore.getState().nextId).toBe(101); // ...stays at 101, not rolled back to 100
  });

  it('the undo stack is capped at 200 entries, dropping the oldest', () => {
    for (let i = 0; i < 205; i++) {
      useOutlineStore.getState().setNote(2, `note ${i}`);
    }
    expect(useOutlineStore.getState().undoStack.length).toBe(200);
  });

  it('multi-select deleteSelected is undoable', () => {
    useOutlineStore.setState({ multiSelectedIds: [2, 3], selectionAnchorId: 2, selectedId: 3 });
    useOutlineStore.getState().deleteSelected();
    expect(useOutlineStore.getState().nodes).toHaveLength(1);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toHaveLength(3);
  });

  it('toggleCheckbox is undoable', () => {
    useOutlineStore.getState().toggleCheckbox(2);
    const afterToggle = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    useOutlineStore.getState().undo();
    const afterUndo = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(afterUndo?.checked).not.toBe(afterToggle?.checked);
  });

  it('indentSelected/outdentSelected are each undoable', () => {
    useOutlineStore.getState().selectNode(3);
    const depthBefore = useOutlineStore.getState().nodes.find((n) => n.id === 3)?.depth;
    useOutlineStore.getState().indentSelected();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.depth).not.toBe(depthBefore);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.depth).toBe(depthBefore);
  });

  it('toggleCollapse does NOT push an undo checkpoint (matches legacy: fold state is not part of the undo snapshot)', () => {
    useOutlineStore.getState().toggleCollapse(1);
    expect(useOutlineStore.getState().canUndo()).toBe(false);
  });
});

function n(overrides: Partial<{
  id: number; depth: number; text: string; parentId: number | null;
  isCheckbox: boolean; checked: boolean; note: string; codeBlock: { lang: string; code: string } | null; tags: string[];
  styles: ReturnType<typeof defaultNodeStyles>;
}>) {
  return {
    id: overrides.id ?? 1,
    depth: overrides.depth ?? 0,
    text: overrides.text ?? '',
    parentId: overrides.parentId ?? null,
    isCheckbox: overrides.isCheckbox ?? false,
    checked: overrides.checked ?? false,
    note: overrides.note ?? '',
    codeBlock: overrides.codeBlock ?? null,
    tags: overrides.tags ?? [],
    styles: overrides.styles ?? defaultNodeStyles()
  };
}

describe('duplicateRootIndexesCore', () => {
  it('clones a single leaf node, inserting the clone directly after the original', () => {
    const nodes = [n({ id: 1, text: 'a' }), n({ id: 2, text: 'b' })];
    const { firstNewId, nextId } = duplicateRootIndexesCore(nodes, [0], 100);
    expect(nodes.map((x) => x.text)).toEqual(['a', 'a', 'b']);
    expect(firstNewId).toBe(100);
    expect(nextId).toBe(101);
    expect(nodes[1].id).toBe(100);
  });

  it('clones a whole subtree together, not just the root node', () => {
    const nodes = [n({ id: 1, depth: 0, text: 'parent' }), n({ id: 2, depth: 1, text: 'child', parentId: 1 })];
    const { firstNewId, nextId } = duplicateRootIndexesCore(nodes, [0], 100);
    expect(nodes.map((x) => x.text)).toEqual(['parent', 'child', 'parent', 'child']);
    expect(nodes[2].depth).toBe(0);
    expect(nodes[3].depth).toBe(1);
    expect(firstNewId).toBe(100);
    expect(nextId).toBe(102);
  });

  it('preserves text, depth, and note on the clone', () => {
    const nodes = [n({ id: 1, depth: 2, text: 'hello', note: 'a note' })];
    duplicateRootIndexesCore(nodes, [0], 100);
    expect(nodes[1]).toMatchObject({ text: 'hello', depth: 2, note: 'a note' });
  });

  it('does NOT preserve isCheckbox/checked/codeBlock/tags on the clone -- matches legacy exactly, not a bug', () => {
    const nodes = [
      n({ id: 1, text: 'task', isCheckbox: true, checked: true, codeBlock: { lang: 'js', code: 'x' }, tags: ['urgent'] })
    ];
    duplicateRootIndexesCore(nodes, [0], 100);
    expect(nodes[1]).toMatchObject({ isCheckbox: false, checked: false, codeBlock: null, tags: [] });
  });

  it('DOES preserve styles/formatting on the clone -- matches legacy\'s own explicit n.styles pass-through', () => {
    const nodes = [n({ id: 1, text: 'heading', styles: { ...defaultNodeStyles(), bold: true, heading: 2 } })];
    duplicateRootIndexesCore(nodes, [0], 100);
    expect(nodes[1].styles).toEqual({ ...defaultNodeStyles(), bold: true, heading: 2 });
  });

  it('the duplicate\'s styles object is a real copy, not a shared reference to the original\'s', () => {
    const nodes = [n({ id: 1, styles: { ...defaultNodeStyles(), bold: true } })];
    duplicateRootIndexesCore(nodes, [0], 100);
    nodes[1].styles.bold = false;
    expect(nodes[0].styles.bold).toBe(true);
  });

  it('assigns fresh sequential ids to every cloned node in a subtree', () => {
    const nodes = [n({ id: 1, depth: 0 }), n({ id: 2, depth: 1, parentId: 1 }), n({ id: 3, depth: 1, parentId: 1 })];
    duplicateRootIndexesCore(nodes, [0], 100);
    expect(nodes.slice(3).map((x) => x.id)).toEqual([100, 101, 102]);
  });

  it('leaves parentId null on every clone -- the caller is expected to rebuildParentIdsCore afterward', () => {
    const nodes = [n({ id: 1, depth: 0 }), n({ id: 2, depth: 1, parentId: 1 })];
    duplicateRootIndexesCore(nodes, [0], 100);
    expect(nodes[2].parentId).toBeNull();
    expect(nodes[3].parentId).toBeNull();
  });

  it('duplicating multiple roots processes them in reverse order without corrupting indices', () => {
    // Three top-level siblings; duplicate all three.
    const nodes = [n({ id: 1, text: 'a' }), n({ id: 2, text: 'b' }), n({ id: 3, text: 'c' })];
    const { firstNewId } = duplicateRootIndexesCore(nodes, [0, 1, 2], 100);
    expect(nodes.map((x) => x.text)).toEqual(['a', 'a', 'b', 'b', 'c', 'c']);
    // firstNewId is the duplicate of rootIndexes[0] (the FIRST originally-selected root) --
    // matching legacy's own real result. Because the loop runs BACKWARD (r=2,1,0), that root
    // is processed LAST, so its clone gets the LAST (highest) id from the counter (102, not
    // 100 -- roots[2]='c' is processed first and gets 100, roots[1]='b' gets 101, roots[0]='a'
    // gets 102), not the numerically-first id despite the "firstNewId" name.
    expect(firstNewId).toBe(102);
  });

  it('an empty rootIndexes array is a safe no-op', () => {
    const nodes = [n({ id: 1 })];
    const { firstNewId, nextId } = duplicateRootIndexesCore(nodes, [], 100);
    expect(nodes).toHaveLength(1);
    expect(firstNewId).toBeNull();
    expect(nextId).toBe(100);
  });
});

describe('outlineStore duplicateSelected', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2,
      undoStack: [],
      redoStack: []
    });
  });

  it('duplicates the selected node and its subtree', () => {
    useOutlineStore.getState().duplicateSelected();
    expect(useOutlineStore.getState().nodes).toHaveLength(3);
    expect(useOutlineStore.getState().nodes[2].text).toBe('child');
  });

  it('selects the newly duplicated node', () => {
    useOutlineStore.getState().duplicateSelected();
    const newNode = useOutlineStore.getState().nodes[2];
    expect(useOutlineStore.getState().selectedId).toBe(newNode.id);
    expect(useOutlineStore.getState().selectionAnchorId).toBe(newNode.id);
    expect(useOutlineStore.getState().multiSelectedIds).toEqual([]);
  });

  it('is undoable', () => {
    useOutlineStore.getState().duplicateSelected();
    expect(useOutlineStore.getState().nodes).toHaveLength(3);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toHaveLength(2);
  });

  it('is a no-op when nothing is selected', () => {
    useOutlineStore.setState({ selectedId: null, multiSelectedIds: [] });
    useOutlineStore.getState().duplicateSelected();
    expect(useOutlineStore.getState().nodes).toHaveLength(2);
    expect(useOutlineStore.getState().canUndo()).toBe(false);
  });

  it('rebuilds parentId correctly on the duplicated subtree', () => {
    useOutlineStore.getState().duplicateSelected();
    const nodes = useOutlineStore.getState().nodes;
    const newChild = nodes[2];
    expect(newChild.parentId).toBe(1);
  });
});

describe('outlineStore toggleNodeStyle / applyHeadingOption (Phase 6.2: rich per-node formatting)', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2,
      undoStack: [],
      redoStack: []
    });
  });

  it('toggleNodeStyle turns bold ON for a single selected node with no style yet', () => {
    useOutlineStore.getState().toggleNodeStyle('bold');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.bold).toBe(true);
  });

  it('toggleNodeStyle turns bold back OFF on a second toggle', () => {
    useOutlineStore.getState().toggleNodeStyle('bold');
    useOutlineStore.getState().toggleNodeStyle('bold');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.bold).toBe(false);
  });

  it('is undoable', () => {
    useOutlineStore.getState().toggleNodeStyle('italic');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.italic).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.italic).toBe(false);
  });

  it('is a no-op when nothing is selected', () => {
    useOutlineStore.setState({ selectedId: null, multiSelectedIds: [] });
    useOutlineStore.getState().toggleNodeStyle('bold');
    expect(useOutlineStore.getState().canUndo()).toBe(false);
  });

  it('across a multi-selection where NOT all nodes already have the style, turns it ON for all', () => {
    useOutlineStore.setState({ multiSelectedIds: [2, 3], selectionAnchorId: 2, selectedId: 3 });
    // Node 2 already bold, node 3 is not -- mixed state.
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.map((n) => (n.id === 2 ? { ...n, styles: { ...n.styles, bold: true } } : n))
    });
    useOutlineStore.getState().toggleNodeStyle('bold');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.bold).toBe(true);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.styles.bold).toBe(true);
  });

  it('across a multi-selection where ALL nodes already have the style, turns it OFF for all', () => {
    useOutlineStore.setState({ multiSelectedIds: [2, 3], selectionAnchorId: 2, selectedId: 3 });
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.map((n) => (n.id === 2 || n.id === 3 ? { ...n, styles: { ...n.styles, bold: true } } : n))
    });
    useOutlineStore.getState().toggleNodeStyle('bold');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.bold).toBe(false);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.styles.bold).toBe(false);
  });

  it('toggling one style does not affect the others on the same node', () => {
    useOutlineStore.getState().toggleNodeStyle('bold');
    useOutlineStore.getState().toggleNodeStyle('underline');
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node?.styles).toMatchObject({ bold: true, underline: true, italic: false, strike: false });
  });

  it('applyHeadingOption sets the heading level on the selected node', () => {
    useOutlineStore.getState().applyHeadingOption(2);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.heading).toBe(2);
  });

  it('applyHeadingOption clears the level on a second click of the SAME level', () => {
    useOutlineStore.getState().applyHeadingOption(2);
    useOutlineStore.getState().applyHeadingOption(2);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.heading).toBe(0);
  });

  it('applyHeadingOption with a DIFFERENT level overrides, does not clear', () => {
    useOutlineStore.getState().applyHeadingOption(2);
    useOutlineStore.getState().applyHeadingOption(4);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.heading).toBe(4);
  });

  it('applyHeadingOption(0) always clears regardless of current level', () => {
    useOutlineStore.getState().applyHeadingOption(3);
    useOutlineStore.getState().applyHeadingOption(0);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.heading).toBe(0);
  });

  it('applyHeadingOption across a mixed-level multi-selection sets all to the new level, not clear', () => {
    useOutlineStore.setState({ multiSelectedIds: [2, 3], selectionAnchorId: 2, selectedId: 3 });
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.map((n) => (n.id === 2 ? { ...n, styles: { ...n.styles, heading: 1 } } : n))
    });
    // node 2 is heading 1, node 3 is heading 0 -- NOT allSame, so applying level 1 should SET
    // both to 1 (not clear), matching legacy's own allSame-only-clears semantics.
    useOutlineStore.getState().applyHeadingOption(1);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.heading).toBe(1);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.styles.heading).toBe(1);
  });

  it('applyHeadingOption is undoable', () => {
    useOutlineStore.getState().applyHeadingOption(3);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.heading).toBe(0);
  });

  it('commitEdit auto-converts a leading # into heading level 1 and strips the marker', () => {
    useOutlineStore.getState().commitEdit(2, '# My Heading');
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node?.text).toBe('My Heading');
    expect(node?.styles.heading).toBe(1);
  });

  it('commitEdit auto-converts ###### (6 hashes) into heading level 6', () => {
    useOutlineStore.getState().commitEdit(2, '###### Deep Heading');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.styles.heading).toBe(6);
  });

  it('commitEdit does NOT auto-convert 7+ hashes -- caps at level 6, matching legacy exactly', () => {
    useOutlineStore.getState().commitEdit(2, '####### Too Many');
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    // The regex only matches 1-6 hashes; 7 hashes means the whole line no longer matches the
    // heading pattern at all, so it's left as plain text -- matches legacy's own regex cap.
    expect(node?.text).toBe('####### Too Many');
    expect(node?.styles.heading).toBe(0);
  });

  it('commitEdit heading auto-convert pushes an undo checkpoint even if the base text is otherwise unchanged', () => {
    useOutlineStore.setState({
      nodes: [{ id: 2, depth: 1, text: '# child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }]
    });
    useOutlineStore.getState().commitEdit(2, '# child');
    expect(useOutlineStore.getState().canUndo()).toBe(true);
  });

  it('commitEdit heading auto-convert is undoable', () => {
    useOutlineStore.getState().commitEdit(2, '## Heading');
    useOutlineStore.getState().undo();
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node?.text).toBe('child');
    expect(node?.styles.heading).toBe(0);
  });

  it('commitEdit checkbox and heading auto-convert do not both apply to the same text (mutually exclusive)', () => {
    useOutlineStore.getState().commitEdit(2, '[ ] not a heading');
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node?.isCheckbox).toBe(true);
    expect(node?.styles.heading).toBe(0);
  });
});

describe('outlineStore toggleCheckboxType (Phase 6.2: checkbox toolbar button)', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: true, checked: true, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2,
      undoStack: [],
      redoStack: []
    });
  });

  it('converts a plain selected node into a checkbox, unchecked', () => {
    useOutlineStore.getState().toggleCheckboxType();
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 2);
    expect(node?.isCheckbox).toBe(true);
    expect(node?.checked).toBe(false);
  });

  it('removes checkbox status (and unchecks) from an already-checkbox selected node', () => {
    useOutlineStore.getState().selectNode(3);
    useOutlineStore.getState().toggleCheckboxType();
    const node = useOutlineStore.getState().nodes.find((n) => n.id === 3);
    expect(node?.isCheckbox).toBe(false);
    expect(node?.checked).toBe(false);
  });

  it('across a mixed multi-selection (some checkbox, some not), ANY checkbox present means REMOVE from all', () => {
    useOutlineStore.setState({ multiSelectedIds: [2, 3], selectionAnchorId: 2, selectedId: 3 });
    useOutlineStore.getState().toggleCheckboxType();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.isCheckbox).toBe(false);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.isCheckbox).toBe(false);
  });

  it('across a multi-selection with NO checkboxes at all, converts all to checkboxes', () => {
    useOutlineStore.setState({
      nodes: useOutlineStore.getState().nodes.map((n) => (n.id === 3 ? { ...n, isCheckbox: false, checked: false } : n)),
      multiSelectedIds: [2, 3],
      selectionAnchorId: 2,
      selectedId: 3
    });
    useOutlineStore.getState().toggleCheckboxType();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.isCheckbox).toBe(true);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 3)?.isCheckbox).toBe(true);
  });

  it('is undoable', () => {
    useOutlineStore.getState().toggleCheckboxType();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.isCheckbox).toBe(true);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.isCheckbox).toBe(false);
  });

  it('is a no-op when nothing is selected', () => {
    useOutlineStore.setState({ selectedId: null, multiSelectedIds: [] });
    useOutlineStore.getState().toggleCheckboxType();
    expect(useOutlineStore.getState().canUndo()).toBe(false);
  });
});

describe('outlineStore newSiblingAbove (Phase 6.2: node hover toolbar)', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'sibling', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 2,
      undoStack: [],
      redoStack: []
    });
  });

  it('inserts a blank node immediately BEFORE the target, at the same depth', () => {
    useOutlineStore.getState().newSiblingAbove(2);
    const nodes = useOutlineStore.getState().nodes;
    expect(nodes.map((n) => n.text)).toEqual(['root', '', 'child', 'sibling']);
    expect(nodes[1].depth).toBe(1);
  });

  it('does NOT insert past the target\'s own subtree (lands directly before it, not after any children)', () => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'parent', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 2, text: 'grandchild', parentId: 2, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ]
    });
    useOutlineStore.getState().newSiblingAbove(2);
    // The new blank node lands right before "parent", NOT after "grandchild" -- confirms this
    // is a plain positional insert, not a subtree-end insert like newSiblingBelow's.
    expect(useOutlineStore.getState().nodes.map((n) => n.text)).toEqual(['root', '', 'parent', 'grandchild']);
  });

  it('selects and begins editing the new node', () => {
    useOutlineStore.getState().newSiblingAbove(2);
    const newNode = useOutlineStore.getState().nodes[1];
    expect(useOutlineStore.getState().selectedId).toBe(newNode.id);
    expect(useOutlineStore.getState().editingId).toBe(newNode.id);
  });

  it('is undoable', () => {
    useOutlineStore.getState().newSiblingAbove(2);
    expect(useOutlineStore.getState().nodes).toHaveLength(4);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes).toHaveLength(3);
  });

  it('is a no-op for an unknown node id', () => {
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().newSiblingAbove(9999);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('rebuilds parentId correctly for the new node', () => {
    useOutlineStore.getState().newSiblingAbove(2);
    expect(useOutlineStore.getState().nodes[1].parentId).toBe(1);
  });
});

describe('outlineStore moveSelected (Phase 6.2: context-menu up/down)', () => {
  beforeEach(() => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 1, text: 'first', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'second', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 4, depth: 1, text: 'third', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 3,
      editingId: null,
      collapsedIds: new Set(),
      nextId: 100,
      multiSelectedIds: [],
      selectionAnchorId: 3,
      undoStack: [],
      redoStack: []
    });
  });

  it('moves the selected node up past its preceding sibling', () => {
    useOutlineStore.getState().moveSelected(-1);
    expect(useOutlineStore.getState().nodes.map((n) => n.text)).toEqual(['root', 'second', 'first', 'third']);
  });

  it('moves the selected node down past its following sibling', () => {
    useOutlineStore.getState().moveSelected(1);
    expect(useOutlineStore.getState().nodes.map((n) => n.text)).toEqual(['root', 'first', 'third', 'second']);
  });

  it('keeps the moved node selected', () => {
    useOutlineStore.getState().moveSelected(-1);
    expect(useOutlineStore.getState().selectedId).toBe(3);
    expect(useOutlineStore.getState().selectionAnchorId).toBe(3);
  });

  it('is a no-op when the first sibling tries to move up', () => {
    useOutlineStore.getState().selectNode(2);
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().moveSelected(-1);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('is a no-op when the last sibling tries to move down', () => {
    useOutlineStore.getState().selectNode(4);
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().moveSelected(1);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('is a no-op when more than one node is selected (matches legacy: roots.length!==1 guard)', () => {
    useOutlineStore.setState({ multiSelectedIds: [3, 4], selectionAnchorId: 3, selectedId: 4 });
    const before = useOutlineStore.getState().nodes;
    useOutlineStore.getState().moveSelected(-1);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });

  it('is undoable', () => {
    useOutlineStore.getState().moveSelected(-1);
    expect(useOutlineStore.getState().nodes.map((n) => n.text)).toEqual(['root', 'second', 'first', 'third']);
    useOutlineStore.getState().undo();
    expect(useOutlineStore.getState().nodes.map((n) => n.text)).toEqual(['root', 'first', 'second', 'third']);
  });

  it('moves a whole subtree together, not just the root node', () => {
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'a', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 2, depth: 0, text: 'b', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
        { id: 3, depth: 1, text: 'b-child', parentId: 2, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
      ],
      selectedId: 2,
      selectionAnchorId: 2,
      multiSelectedIds: []
    });
    useOutlineStore.getState().moveSelected(-1);
    expect(useOutlineStore.getState().nodes.map((n) => n.text)).toEqual(['b', 'b-child', 'a']);
  });
});
