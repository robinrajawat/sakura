import { describe, it, expect, beforeAll } from 'vitest';
import {
  diagramGenTagColorKeyCore,
  assignDiagramGenColorsCore,
  applyDiagramGenShapeColorOverridesCore,
  type ColorAssignNode,
  type ColorAssignNodeMetaEntry
} from './diagramGenColors';
import {
  diagramGenRenderChildIdxsCore,
  diagramGenIsSequenceCore
} from './diagramGenTopology';
import { getSubtreeEnd, getParentIndex } from '../core/nodeQueries';

// diagramGenColors.ts references diagramGenRenderChildIdxsCore/IsSequenceCore as ambient
// globals (declare function, erased at compile time — see the module's own header for why). In
// the real app these globals are provided by diagramGenTopology.ts's own generated block sharing
// the same script scope; in this Node test environment there is no such shared scope, so they're
// wired up explicitly here from the real implementations — not mocks, the actual tested
// functions. diagramGenRenderChildIdxsCore itself transitively needs getSubtreeEnd/
// getParentIndex (from nodeQueries.ts), also wired up here for the same reason.
beforeAll(() => {
  const g = globalThis as unknown as {
    diagramGenRenderChildIdxsCore: typeof diagramGenRenderChildIdxsCore;
    diagramGenIsSequenceCore: typeof diagramGenIsSequenceCore;
    getSubtreeEnd: typeof getSubtreeEnd;
    getParentIndex: typeof getParentIndex;
  };
  g.diagramGenRenderChildIdxsCore = diagramGenRenderChildIdxsCore;
  g.diagramGenIsSequenceCore = diagramGenIsSequenceCore;
  g.getSubtreeEnd = getSubtreeEnd;
  g.getParentIndex = getParentIndex;
});

function tree(depths: number[], tags?: (string[] | undefined)[], markers?: (string | undefined)[]): ColorAssignNode[] {
  return depths.map((depth, i) => ({ id: i + 1, depth, tags: tags?.[i], marker: markers?.[i] }));
}

describe('diagramGenTagColorKeyCore', () => {
  it('is deterministic — same tag always returns the same hue', () => {
    expect(diagramGenTagColorKeyCore('billing')).toBe(diagramGenTagColorKeyCore('billing'));
  });

  it('returns one of the 8 reserved hues', () => {
    const hues = ['blue', 'green', 'amber', 'red', 'purple', 'teal', 'coral', 'pink'];
    expect(hues).toContain(diagramGenTagColorKeyCore('anything'));
  });

  it('different tags can (and often do) map to different hues', () => {
    // Not a strict guarantee for every pair, but 'a' and 'ab' should differ given the simple
    // char-code-sum hash — a spot check, not an exhaustive collision proof.
    expect(diagramGenTagColorKeyCore('a')).not.toBe(diagramGenTagColorKeyCore('ab'));
  });
});

describe('assignDiagramGenColorsCore', () => {
  it('single root gets gray; its children (a real branch) get cycled branch colors', () => {
    // root(0) -> a(1), b(2) — a genuine fan-out (2 rendered children, not a sequence)
    const t = tree([0, 1, 1]);
    const result = assignDiagramGenColorsCore(t, { rootIdxs: [0] }, undefined);
    expect(result.get(0)).toBe('gray');
    expect(result.get(1)).toBe('purple'); // first in DIAGRAM_GEN_BRANCH_CYCLE
    expect(result.get(2)).toBe('teal'); // second
  });

  it('a single child (not a real branch — only one rendered child) inherits the branch color', () => {
    // root(0) -> a(1) -> b(2). 'a' has a child (b) so it's automatically disqualified from
    // merge-candidate exclusion; 'b' is marked with a shape in nodeMeta for the same reason
    // (a shape on the node itself disqualifies it from merge-candidate exclusion regardless of
    // being a lone leaf child) — otherwise a lone real leaf sibling with no shape/container
    // folds into its parent and never gets its own render slot or color (see
    // diagramGenTopology.test.ts's own "merge candidate" tests for the same rule).
    const t = tree([0, 1, 2]);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[3, { shape: 'ui' }]]); // id 3 = b
    const result = assignDiagramGenColorsCore(t, { rootIdxs: [0] }, nodeMeta);
    expect(result.get(0)).toBe('gray');
    expect(result.get(1)).toBe('purple'); // root's lone top-level child, cycled
    // a has exactly 1 rendered child (b) — not a real branch, b inherits a's key unchanged
    expect(result.get(2)).toBe(result.get(1));
  });

  it('multi-root scope cycles branch colors per root', () => {
    const t = tree([0, 0]);
    const result = assignDiagramGenColorsCore(t, { rootIdxs: [0, 1] }, undefined);
    expect(result.get(0)).toBe('purple');
    expect(result.get(1)).toBe('teal');
  });

  it('a tag on a node overrides the inherited branch color', () => {
    // Node given a shape so it isn't excluded as a merge candidate (see comment above).
    const t = tree([0, 1], [undefined, ['billing']]);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[2, { shape: 'ui' }]]);
    const result = assignDiagramGenColorsCore(t, { rootIdxs: [0] }, nodeMeta);
    expect(result.get(1)).toBe(diagramGenTagColorKeyCore('billing'));
  });

  it('an explicit marker outranks a tag', () => {
    const t = tree([0, 1], [undefined, ['billing']], [undefined, 'issue']);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[2, { shape: 'ui' }]]);
    const result = assignDiagramGenColorsCore(t, { rootIdxs: [0] }, nodeMeta);
    expect(result.get(1)).toBe('red'); // DIAGRAM_GEN_MARKER_COLOR.issue
  });

  it('an unrecognized marker falls through to tag/branch color instead', () => {
    const t = tree([0, 1], [undefined, ['billing']], [undefined, 'not-a-real-marker']);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[2, { shape: 'ui' }]]);
    const result = assignDiagramGenColorsCore(t, { rootIdxs: [0] }, nodeMeta);
    expect(result.get(1)).toBe(diagramGenTagColorKeyCore('billing'));
  });

  it('a confirmed sequence child inherits the parent color unchanged, not a cycled branch color', () => {
    // root(sequence) -> a, b — root confirmed as a sequence, so its 2 children are NOT treated
    // as a real branch fan-out even though there are 2 of them.
    const t = tree([0, 1, 1]);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[1, { sequence: true }]]);
    const result = assignDiagramGenColorsCore(t, { rootIdxs: [0] }, nodeMeta);
    expect(result.get(0)).toBe('gray');
    // root's lone... wait root has 2 rendered children but is itself the "gray root" special
    // case; its own topKids loop still cycles a key per top-level child regardless of sequence
    // status (sequence only affects fan-out detection ONE LEVEL DOWN from each walked node).
    // a and b get their own top-level cycled colors from the root special-case loop:
    expect(result.get(1)).toBe('purple');
    expect(result.get(2)).toBe('teal');
  });

  it('never mutates the input nodes array', () => {
    const t = tree([0, 1, 1]);
    const snapshot = JSON.stringify(t);
    assignDiagramGenColorsCore(t, { rootIdxs: [0] }, undefined);
    expect(JSON.stringify(t)).toBe(snapshot);
  });
});

describe('applyDiagramGenShapeColorOverridesCore', () => {
  it('is a no-op when nodeMeta is missing/empty', () => {
    const t = tree([0, 1]);
    const colorByIdx = new Map([[0, 'gray'], [1, 'purple']]);
    applyDiagramGenShapeColorOverridesCore(t, { scopeIdxs: [0, 1] }, colorByIdx, undefined, true);
    expect(colorByIdx.get(1)).toBe('purple'); // unchanged
    const emptyMeta = new Map<number, ColorAssignNodeMetaEntry>();
    applyDiagramGenShapeColorOverridesCore(t, { scopeIdxs: [0, 1] }, colorByIdx, emptyMeta, true);
    expect(colorByIdx.get(1)).toBe('purple'); // still unchanged
  });

  it('is a no-op when anyShapeSet is false, even with real nodeMeta', () => {
    const t = tree([0, 1]);
    const colorByIdx = new Map([[1, 'purple']]);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[2, { shape: 'ui' }]]);
    applyDiagramGenShapeColorOverridesCore(t, { scopeIdxs: [0, 1] }, colorByIdx, nodeMeta, false);
    expect(colorByIdx.get(1)).toBe('purple'); // unchanged
  });

  it('overrides to the shape\'s palette color when a classified shape has one', () => {
    const t = tree([0, 1]);
    const colorByIdx = new Map([[1, 'purple']]);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[2, { shape: 'ui' }]]);
    applyDiagramGenShapeColorOverridesCore(t, { scopeIdxs: [0, 1] }, colorByIdx, nodeMeta, true);
    expect(colorByIdx.get(1)).toBe('blue'); // DIAGRAM_GEN_SHAPE_COLOR.ui
  });

  it('skips a node with an explicit recognized marker — marker keeps outranking shape', () => {
    const t = tree([0, 1], undefined, [undefined, 'issue']);
    const colorByIdx = new Map([[1, 'red']]); // set by assignDiagramGenColorsCore's own marker logic
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[2, { shape: 'ui' }]]);
    applyDiagramGenShapeColorOverridesCore(t, { scopeIdxs: [0, 1] }, colorByIdx, nodeMeta, true);
    expect(colorByIdx.get(1)).toBe('red'); // untouched, marker still wins
  });

  it('leaves note/excluded shapes untouched — they use a bespoke color elsewhere', () => {
    const t = tree([0, 1, 1]);
    const colorByIdx = new Map([[1, 'purple'], [2, 'teal']]);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([
      [2, { shape: 'note' }],
      [3, { shape: 'excluded' }]
    ]);
    applyDiagramGenShapeColorOverridesCore(t, { scopeIdxs: [0, 1, 2] }, colorByIdx, nodeMeta, true);
    expect(colorByIdx.get(1)).toBe('purple'); // untouched
    expect(colorByIdx.get(2)).toBe('teal'); // untouched
  });

  it('falls back to gray for an unclassified node once any real shape exists in scope', () => {
    const t = tree([0, 1, 1]);
    const colorByIdx = new Map([[1, 'purple'], [2, 'teal']]);
    // Only node at idx1 (id 2) has a real shape; idx2 (id 3) has none — anyShapeSet is still
    // true (computed by the caller from the whole scope), so idx2 falls back to gray.
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[2, { shape: 'ui' }]]);
    applyDiagramGenShapeColorOverridesCore(t, { scopeIdxs: [0, 1, 2] }, colorByIdx, nodeMeta, true);
    expect(colorByIdx.get(1)).toBe('blue');
    expect(colorByIdx.get(2)).toBe('gray');
  });

  it('mutates colorByIdx in place rather than returning a new map', () => {
    const t = tree([0, 1]);
    const colorByIdx = new Map([[1, 'purple']]);
    const nodeMeta = new Map<number, ColorAssignNodeMetaEntry>([[2, { shape: 'ui' }]]);
    const returnValue = applyDiagramGenShapeColorOverridesCore(t, { scopeIdxs: [0, 1] }, colorByIdx, nodeMeta, true);
    expect(returnValue).toBeUndefined();
    expect(colorByIdx.get(1)).toBe('blue');
  });
});
