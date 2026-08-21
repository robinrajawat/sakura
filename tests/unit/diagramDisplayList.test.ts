import { describe, it, expect, beforeAll } from 'vitest';
import { computeDiagramDisplayListCore, computeDiagramCanReorderCore, DisplayableDiagram } from '../../src/state/diagramDisplayList';
import { isDiagramOrphaned, diagramNeedsAttentionCore } from '../../src/state/diagramAnchor';

// diagramDisplayList.ts references isDiagramOrphaned/diagramNeedsAttentionCore as ambient
// globals (a `declare function`, erased at compile time — see the module's own header comment
// for why). In the real app these globals are provided by diagramAnchor.ts's own generated
// block sharing the same script scope; in this Node test environment there is no such shared
// scope, so they're wired up explicitly here from the real implementations — not mocks, the
// actual tested functions.
beforeAll(() => {
  const g = globalThis as unknown as {
    isDiagramOrphaned: typeof isDiagramOrphaned;
    diagramNeedsAttentionCore: typeof diagramNeedsAttentionCore;
  };
  g.isDiagramOrphaned = isDiagramOrphaned;
  g.diagramNeedsAttentionCore = diagramNeedsAttentionCore;
});

function diagram(overrides: Partial<DisplayableDiagram>): DisplayableDiagram {
  return { id: 'd1', title: 'Diagram', status: 'draft', modifiedAt: 0, anchorNodeId: null, isWhiteboard: false, ...overrides };
}

const defaultOptions = { searchQuery: '', unlinkedOnly: false, sortMode: 'manual' };

describe('computeDiagramDisplayListCore', () => {
  it('returns all diagrams unchanged in manual mode with no filters', () => {
    const list = [diagram({ id: 1 }), diagram({ id: 2 })];
    const result = computeDiagramDisplayListCore(list, [], defaultOptions);
    expect(result.map((d) => d.id)).toEqual([1, 2]);
  });

  it('never mutates the input array', () => {
    const list = [diagram({ id: 1 }), diagram({ id: 2 })];
    const original = list.slice();
    computeDiagramDisplayListCore(list, [], { ...defaultOptions, sortMode: 'modified' });
    expect(list).toEqual(original);
  });

  it('filters by title, case-insensitively', () => {
    const list = [diagram({ id: 1, title: 'Auth Flow' }), diagram({ id: 2, title: 'Payments' })];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, searchQuery: 'auth' });
    expect(result.map((d) => d.id)).toEqual([1]);
  });

  it('filters by status label as well as title', () => {
    const list = [diagram({ id: 1, title: 'X', status: 'review' }), diagram({ id: 2, title: 'Y', status: 'draft' })];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, searchQuery: 'review' });
    expect(result.map((d) => d.id)).toEqual([1]);
  });

  it('an empty/whitespace-only search query applies no filter', () => {
    const list = [diagram({ id: 1 }), diagram({ id: 2 })];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, searchQuery: '   ' });
    expect(result).toHaveLength(2);
  });

  it('unlinkedOnly keeps only unlinked/orphaned diagrams, never a whiteboard', () => {
    const list = [
      diagram({ id: 1, anchorNodeId: null }), // unlinked -> kept
      diagram({ id: 2, anchorNodeId: 5 }), // orphaned (node 5 missing) -> kept
      diagram({ id: 3, anchorNodeId: 1 }), // linked to real node -> excluded
      diagram({ id: 4, anchorNodeId: null, isWhiteboard: true }), // whiteboard -> never "needs attention"
    ];
    const nodes = [{ id: 1 }];
    const result = computeDiagramDisplayListCore(list, nodes, { ...defaultOptions, unlinkedOnly: true });
    expect(result.map((d) => d.id)).toEqual([1, 2]);
  });

  it('sorts by status in draft -> in-progress -> review -> final order', () => {
    const list = [
      diagram({ id: 1, status: 'final' }),
      diagram({ id: 2, status: 'draft' }),
      diagram({ id: 3, status: 'review' }),
      diagram({ id: 4, status: 'in-progress' }),
    ];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, sortMode: 'status' });
    expect(result.map((d) => d.id)).toEqual([2, 4, 3, 1]);
  });

  it('an unknown/missing status sorts as draft', () => {
    const list = [diagram({ id: 1, status: 'bogus' }), diagram({ id: 2, status: 'final' })];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, sortMode: 'status' });
    expect(result.map((d) => d.id)).toEqual([1, 2]);
  });

  it('sorts by modifiedAt, newest first', () => {
    const list = [diagram({ id: 1, modifiedAt: 100 }), diagram({ id: 2, modifiedAt: 300 }), diagram({ id: 3, modifiedAt: 200 })];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, sortMode: 'modified' });
    expect(result.map((d) => d.id)).toEqual([2, 3, 1]);
  });

  it('treats a missing modifiedAt as 0 for sort purposes', () => {
    const list = [diagram({ id: 1, modifiedAt: undefined }), diagram({ id: 2, modifiedAt: 5 })];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, sortMode: 'modified' });
    expect(result.map((d) => d.id)).toEqual([2, 1]);
  });

  it('pins a whiteboard to the front regardless of sort mode', () => {
    const list = [
      diagram({ id: 1, status: 'draft' }),
      diagram({ id: 2, status: 'final' }),
      diagram({ id: 3, isWhiteboard: true, status: 'draft' }),
    ];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, sortMode: 'status' });
    expect(result[0].id).toBe(3);
  });

  it('leaves a whiteboard already at the front untouched (no-op unshift)', () => {
    const list = [diagram({ id: 1, isWhiteboard: true }), diagram({ id: 2 })];
    const result = computeDiagramDisplayListCore(list, [], defaultOptions);
    expect(result.map((d) => d.id)).toEqual([1, 2]);
  });

  it('a whiteboard excluded by an active search filter stays excluded (filter runs before the pin)', () => {
    const list = [diagram({ id: 1, title: 'Board', isWhiteboard: true }), diagram({ id: 2, title: 'Other' })];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, searchQuery: 'other' });
    expect(result.map((d) => d.id)).toEqual([2]);
  });

  it('a whiteboard is never matched by the unlinkedOnly filter, so it is excluded rather than pinned when that filter is active', () => {
    const list = [diagram({ id: 1, anchorNodeId: null }), diagram({ id: 2, isWhiteboard: true, anchorNodeId: null })];
    const result = computeDiagramDisplayListCore(list, [], { ...defaultOptions, unlinkedOnly: true });
    expect(result.map((d) => d.id)).toEqual([1]);
  });

  it('applies search, unlinkedOnly filter, sort, and whiteboard pin together in the original order', () => {
    const list = [
      diagram({ id: 1, title: 'Draft flow', status: 'draft', anchorNodeId: null, modifiedAt: 50 }),
      diagram({ id: 2, title: 'Final flow', status: 'final', anchorNodeId: 1, modifiedAt: 10 }), // linked -> excluded by unlinkedOnly
      diagram({ id: 3, title: 'Other flow', status: 'draft', anchorNodeId: null, modifiedAt: 30 }),
      diagram({ id: 4, title: 'Flow board', isWhiteboard: true, modifiedAt: 5 }),
    ];
    const nodes = [{ id: 1 }];
    const result = computeDiagramDisplayListCore(list, nodes, {
      searchQuery: 'flow',
      unlinkedOnly: true,
      sortMode: 'modified',
    });
    // Matches "flow" in title: 1,2,3,4 all match. unlinkedOnly excludes 2 (linked) AND 4 (a
    // whiteboard is never "needs attention", per diagramNeedsAttentionCore's own rule — so it
    // doesn't even reach the whiteboard-pin step here). Remaining 1,3 sorted by modified desc.
    expect(result.map((d) => d.id)).toEqual([1, 3]);
  });
});

describe('computeDiagramCanReorderCore', () => {
  const base = { sortMode: 'manual', searchQuery: '', unlinkedOnly: false, selectMode: true };

  it('true only when manual sort, no search, no unlinkedOnly filter, and select mode is on', () => {
    expect(computeDiagramCanReorderCore(base)).toBe(true);
  });

  it('false when sort mode is not manual', () => {
    expect(computeDiagramCanReorderCore({ ...base, sortMode: 'status' })).toBe(false);
  });

  it('false when a search query is active', () => {
    expect(computeDiagramCanReorderCore({ ...base, searchQuery: 'x' })).toBe(false);
  });

  it('a whitespace-only search query still counts as "no search" (trimmed)', () => {
    expect(computeDiagramCanReorderCore({ ...base, searchQuery: '   ' })).toBe(true);
  });

  it('false when the unlinkedOnly filter is active', () => {
    expect(computeDiagramCanReorderCore({ ...base, unlinkedOnly: true })).toBe(false);
  });

  it('false when select mode is off', () => {
    expect(computeDiagramCanReorderCore({ ...base, selectMode: false })).toBe(false);
  });
});
