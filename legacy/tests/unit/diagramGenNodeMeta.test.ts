import { describe, it, expect, beforeAll } from 'vitest';
import {
  diagramGenProposeNodeMetaCore,
  diagramGenNodeMetaFromPlainCore,
  diagramGenNodeMetaToPlainCore,
  type NodeMetaSourceNode,
  type ProposedNodeMetaEntry
} from '../../src/state/diagramGenNodeMeta';
import {
  diagramGenChildIdxsCore,
  diagramGenIsChainGroupCore,
  diagramGenHasEdgeLabelTagCore
} from '../../src/state/diagramGenTopology';
import { getSubtreeEnd } from '../../src/core/nodeQueries';

// diagramGenNodeMeta.ts references diagramGenChildIdxsCore/IsChainGroupCore/HasEdgeLabelTagCore
// as ambient globals (declare function, erased at compile time — see the module's own header for
// why). In the real app these globals are provided by diagramGenTopology.ts's own generated
// block sharing the same script scope; in this Node test environment there is no such shared
// scope, so they're wired up explicitly here from the real implementations — not mocks, the
// actual tested functions. diagramGenChildIdxsCore itself transitively needs getSubtreeEnd (from
// nodeQueries.ts), also wired up here for the same reason.
beforeAll(() => {
  const g = globalThis as unknown as {
    diagramGenChildIdxsCore: typeof diagramGenChildIdxsCore;
    diagramGenIsChainGroupCore: typeof diagramGenIsChainGroupCore;
    diagramGenHasEdgeLabelTagCore: typeof diagramGenHasEdgeLabelTagCore;
    getSubtreeEnd: typeof getSubtreeEnd;
  };
  g.diagramGenChildIdxsCore = diagramGenChildIdxsCore;
  g.diagramGenIsChainGroupCore = diagramGenIsChainGroupCore;
  g.diagramGenHasEdgeLabelTagCore = diagramGenHasEdgeLabelTagCore;
  g.getSubtreeEnd = getSubtreeEnd;
});

function tree(depths: number[], tags?: (string[] | undefined)[]): NodeMetaSourceNode[] {
  return depths.map((depth, i) => ({ id: i + 1, depth, tags: tags?.[i] }));
}

describe('diagramGenProposeNodeMetaCore', () => {
  it('reuses a shallow copy of existing (previously-confirmed) nodeMeta unchanged', () => {
    const t = tree([0]);
    const existing = new Map([[1, { shape: 'ui', container: false, sequence: false, direction: 'vertical' } as ProposedNodeMetaEntry]]);
    const result = diagramGenProposeNodeMetaCore(t, [0], existing);
    expect(result.get(1)).toEqual({ shape: 'ui', container: false, sequence: false, direction: 'vertical' });
    // shallow copy, not the same object reference
    expect(result.get(1)).not.toBe(existing.get(1));
  });

  it('proposes shape "edge-label" for a legacy #edge-label/#edgelabel tag, highest priority', () => {
    const t = tree([0, 1], [undefined, ['edge-label']]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1], undefined);
    expect(result.get(2)?.shape).toBe('edge-label');
  });

  it('proposes a shape from DIAGRAM_GEN_TAG_SHAPE_MAP keyword match', () => {
    const t = tree([0, 1, 1, 1], [undefined, ['database'], ['frontend'], ['unknown-tag']]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1, 2, 3], undefined);
    expect(result.get(2)?.shape).toBe('datastore');
    expect(result.get(3)?.shape).toBe('ui');
    expect(result.get(4)?.shape).toBe(null);
  });

  it('is case-insensitive when matching tags', () => {
    const t = tree([0, 1], [undefined, ['DataBase']]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1], undefined);
    expect(result.get(2)?.shape).toBe('datastore');
  });

  it('picks the first matching tag when several are present', () => {
    const t = tree([0, 1], [undefined, ['unknown-tag', 'api', 'ui']]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1], undefined);
    expect(result.get(2)?.shape).toBe('service');
  });

  it('rejects a "decision" guess when the node has fewer than 2 children', () => {
    // node has the 'decision' tag but is a leaf (no children) — guess rejected
    const t = tree([0, 1], [undefined, ['decision']]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1], undefined);
    expect(result.get(2)?.shape).toBe(null);
  });

  it('accepts a "decision" guess when the node has 2+ children (a real fork)', () => {
    const t = tree([0, 1, 2, 2], [undefined, ['decision'], undefined, undefined]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1, 2, 3], undefined);
    expect(result.get(2)?.shape).toBe('decision');
  });

  it('proposes sequence+container for a flat chain group (2+ leaf children), no shape', () => {
    const t = tree([0, 1, 1, 1]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1, 2, 3], undefined);
    const rootMeta = result.get(1);
    expect(rootMeta?.container).toBe(true);
    expect(rootMeta?.sequence).toBe(true);
    expect(rootMeta?.shape).toBe(null);
  });

  it('does not propose container/sequence when the node is not a chain group', () => {
    const t = tree([0, 1]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1], undefined);
    expect(result.get(1)?.container).toBe(false);
    expect(result.get(1)?.sequence).toBe(false);
  });

  it('suppresses sequence (but not container) when shape is edge-label on a chain-group node', () => {
    // A node that is both a chain-group header AND has the edge-label tag itself (unusual but
    // the guard exists): shape wins, container drops (since shape is set), sequence is
    // suppressed specifically because shape==='edge-label'.
    const t = tree([0, 1, 1, 1], [['edge-label'], undefined, undefined, undefined]);
    const result = diagramGenProposeNodeMetaCore(t, [0, 1, 2, 3], undefined);
    const rootMeta = result.get(1);
    expect(rootMeta?.shape).toBe('edge-label');
    expect(rootMeta?.container).toBe(false); // leafChain && !shape → shape is truthy → false
    expect(rootMeta?.sequence).toBe(false); // leafChain && !suppressed → suppressed is true → false
  });

  it('direction always proposes "vertical"', () => {
    const t = tree([0]);
    const result = diagramGenProposeNodeMetaCore(t, [0], undefined);
    expect(result.get(1)?.direction).toBe('vertical');
  });

  it('handles an empty scope, never throws', () => {
    const t = tree([0]);
    expect(() => diagramGenProposeNodeMetaCore(t, [], undefined)).not.toThrow();
    expect(diagramGenProposeNodeMetaCore(t, [], undefined).size).toBe(0);
  });
});

describe('diagramGenNodeMetaFromPlainCore', () => {
  it('converts a plain object keyed by stringified id into a Map', () => {
    const obj = { '1': { shape: 'ui' }, '2': { shape: 'service' } };
    const result = diagramGenNodeMetaFromPlainCore(obj);
    expect(result.get(1)).toEqual({ shape: 'ui' });
    expect(result.get(2)).toEqual({ shape: 'service' });
  });

  it('skips keys that do not parse as a finite number', () => {
    const obj = { '1': { shape: 'ui' }, notANumber: { shape: 'service' } };
    const result = diagramGenNodeMetaFromPlainCore(obj);
    expect(result.size).toBe(1);
    expect(result.has(1)).toBe(true);
  });

  it('returns an empty Map for null/undefined/non-object input, never throws', () => {
    expect(diagramGenNodeMetaFromPlainCore(null).size).toBe(0);
    expect(diagramGenNodeMetaFromPlainCore(undefined).size).toBe(0);
    expect(() => diagramGenNodeMetaFromPlainCore(null)).not.toThrow();
  });
});

describe('diagramGenNodeMetaToPlainCore', () => {
  it('converts a Map into a plain object keyed by id', () => {
    const m = new Map<number, unknown>([[1, { shape: 'ui' }], [2, { shape: 'service' }]]);
    expect(diagramGenNodeMetaToPlainCore(m)).toEqual({ 1: { shape: 'ui' }, 2: { shape: 'service' } });
  });

  it('returns an empty object for null/undefined input, never throws', () => {
    expect(diagramGenNodeMetaToPlainCore(null)).toEqual({});
    expect(diagramGenNodeMetaToPlainCore(undefined)).toEqual({});
    expect(() => diagramGenNodeMetaToPlainCore(null)).not.toThrow();
  });
});

describe('round-trip: ToPlain then FromPlain', () => {
  it('preserves entries through a full round trip', () => {
    const original = new Map<number, unknown>([
      [1, { shape: 'ui', container: false, sequence: false, direction: 'vertical' }],
      [5, { shape: null, container: true, sequence: true, direction: 'horizontal' }]
    ]);
    const plain = diagramGenNodeMetaToPlainCore(original);
    const roundTripped = diagramGenNodeMetaFromPlainCore(plain as Record<string, unknown>);
    expect(roundTripped).toEqual(original);
  });
});
