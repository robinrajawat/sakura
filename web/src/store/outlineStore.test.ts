import { describe, expect, it, beforeEach } from 'vitest';
import { useOutlineStore } from './outlineStore';

/**
 * Phase 0 validation spike tests (docs/framework-migration-plan.md). These test the store's
 * wiring to the real ported core logic (nodeMutations/nodeQueries/nodeSelection), not the
 * core logic itself — that's already covered by nodeMutations.test.ts, nodeQueries.test.ts,
 * and nodeSelection's own coverage inside nodeMutations.test.ts/nodeSelection usage
 * elsewhere. The point here is proving a Zustand store correctly calls into ported,
 * in-place-mutating functions without losing reactivity or introducing a state bug at the
 * wiring layer itself.
 */
describe('outlineStore (Phase 0 validation spike)', () => {
  beforeEach(() => {
    useOutlineStore.setState({ nodes: useOutlineStore.getState().nodes, selectedId: 1 });
    // Reset to a fresh seed each test so mutations in one test don't leak into the next —
    // re-invoking the store's own initializer isn't exposed, so reconstruct the same seed
    // shape directly here instead.
    useOutlineStore.setState({
      nodes: [
        { id: 1, depth: 0, text: 'root', parentId: null },
        { id: 2, depth: 1, text: 'child', parentId: 1 },
        { id: 3, depth: 1, text: 'sibling', parentId: 1 }
      ],
      selectedId: 2
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

  it('moveNode returns false and leaves nodes unchanged for an invalid move (dragging onto itself)', () => {
    const before = useOutlineStore.getState().nodes;
    const moved = useOutlineStore.getState().moveNode(2, 2, 'above');
    expect(moved).toBe(false);
    expect(useOutlineStore.getState().nodes).toBe(before);
  });
});
