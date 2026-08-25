import { describe, it, expect, beforeAll } from 'vitest';
import {
  findDecisionLogCore,
  decisionLogForNodeCore,
  decisionStatusLabelCore,
  decisionStatusOfCore,
  decisionLogAnchorLabelCore,
  getDecisionAnchorCandidatesCore,
  subtreeHasDecisionCore,
  decisionStatusColorKeyCore,
  type DecisionLogRecord,
  type AnchorableNode
} from './decisionLogQueries';
import { stripSemanticMarkers } from '../utils/stripSemanticMarkers';
import type { QueryableNode } from '../core/nodeQueries';

// decisionLogQueries.ts references stripSemanticMarkers as an ambient global (declare function,
// erased at compile time — see the module's own header for why). In the real app that global is
// provided by stripSemanticMarkers.ts's own generated block sharing the same script scope; in
// this Node test environment there is no such shared scope, so it's wired up explicitly here
// from the real implementation — not a mock, the actual tested function.
beforeAll(() => {
  const g = globalThis as unknown as { stripSemanticMarkers: typeof stripSemanticMarkers };
  g.stripSemanticMarkers = stripSemanticMarkers;
});

function logs(entries: DecisionLogRecord[]): DecisionLogRecord[] {
  return entries;
}

describe('findDecisionLogCore', () => {
  it('finds a decision log by id', () => {
    const l = logs([{ id: 'dl1' }, { id: 'dl2' }]);
    expect(findDecisionLogCore(l, 'dl2')).toEqual({ id: 'dl2' });
  });

  it('returns undefined when no log matches', () => {
    const l = logs([{ id: 'dl1' }]);
    expect(findDecisionLogCore(l, 'dl9')).toBeUndefined();
  });
});

describe('decisionLogForNodeCore', () => {
  it('returns null when nodeId is null or undefined', () => {
    const l = logs([{ id: 'dl1', anchorNodeId: 5 }]);
    expect(decisionLogForNodeCore(l, null)).toBeNull();
    expect(decisionLogForNodeCore(l, undefined)).toBeNull();
  });

  it('finds the decision log anchored to a given node', () => {
    const l = logs([{ id: 'dl1', anchorNodeId: 5 }, { id: 'dl2', anchorNodeId: 7 }]);
    expect(decisionLogForNodeCore(l, 7)).toEqual({ id: 'dl2', anchorNodeId: 7 });
  });

  it('returns null when no log is anchored to that node', () => {
    const l = logs([{ id: 'dl1', anchorNodeId: 5 }]);
    expect(decisionLogForNodeCore(l, 99)).toBeNull();
  });

  it('excludes a log matching excludeId, even if anchored to that node', () => {
    const l = logs([{ id: 'dl1', anchorNodeId: 5 }]);
    expect(decisionLogForNodeCore(l, 5, 'dl1')).toBeNull();
  });

  it('does not exclude a different log anchored to the same node', () => {
    const l = logs([{ id: 'dl1', anchorNodeId: 5 }, { id: 'dl2', anchorNodeId: 5 }]);
    expect(decisionLogForNodeCore(l, 5, 'dl1')).toEqual({ id: 'dl2', anchorNodeId: 5 });
  });
});

describe('decisionStatusLabelCore', () => {
  it('capitalizes a given status', () => {
    expect(decisionStatusLabelCore('approved')).toBe('Approved');
    expect(decisionStatusLabelCore('rejected')).toBe('Rejected');
  });

  it('defaults to "Proposed" for a falsy input', () => {
    expect(decisionStatusLabelCore('')).toBe('Proposed');
    expect(decisionStatusLabelCore(null)).toBe('Proposed');
    expect(decisionStatusLabelCore(undefined)).toBe('Proposed');
  });
});

describe('decisionStatusOfCore', () => {
  it('accepts a whitelisted status, case-insensitively', () => {
    expect(decisionStatusOfCore({ status: 'approved' })).toBe('approved');
    expect(decisionStatusOfCore({ status: 'REJECTED' })).toBe('rejected');
    expect(decisionStatusOfCore({ status: 'Proposed' })).toBe('proposed');
  });

  it('defaults an unrecognized or missing status to "proposed"', () => {
    expect(decisionStatusOfCore({ status: 'archived' })).toBe('proposed');
    expect(decisionStatusOfCore({})).toBe('proposed');
    expect(decisionStatusOfCore(null)).toBe('proposed');
    expect(decisionStatusOfCore(undefined)).toBe('proposed');
  });
});

describe('decisionLogAnchorLabelCore', () => {
  const nodes: AnchorableNode[] = [{ id: 1, text: '[Project Plan] overview' }];

  it('returns "Not linked" when anchorNodeId is null/undefined', () => {
    expect(decisionLogAnchorLabelCore({ anchorNodeId: null }, [])).toBe('Not linked to a node');
    expect(decisionLogAnchorLabelCore({}, [])).toBe('Not linked to a node');
  });

  it('returns "no longer exists" when the anchored node id is not found', () => {
    expect(decisionLogAnchorLabelCore({ anchorNodeId: 999 }, nodes)).toBe('Linked node no longer exists');
  });

  it("returns the anchored node's text, stripped of semantic markers", () => {
    expect(decisionLogAnchorLabelCore({ anchorNodeId: 1 }, nodes)).toBe('Under: Project Plan overview');
  });

  it('falls back to "(untitled node)" for a node with empty text', () => {
    const untitled: AnchorableNode[] = [{ id: 2, text: '' }];
    expect(decisionLogAnchorLabelCore({ anchorNodeId: 2 }, untitled)).toBe('Under: (untitled node)');
  });

  it('truncates the node text to 60 characters', () => {
    const longText = 'a'.repeat(100);
    const longNodes: AnchorableNode[] = [{ id: 3, text: longText }];
    const result = decisionLogAnchorLabelCore({ anchorNodeId: 3 }, longNodes);
    expect(result).toBe('Under: ' + longText.slice(0, 60));
  });
});

describe('getDecisionAnchorCandidatesCore', () => {
  const nodes: AnchorableNode[] = [
    { id: 1, text: '[Project Plan] overview', depth: 0 },
    { id: 2, text: 'Architecture decisions', depth: 1 },
    { id: 3, text: '', depth: 2 },
    { id: 4, text: 'Budget review', depth: 0 },
  ];

  it('returns every node as a candidate when query is empty', () => {
    const result = getDecisionAnchorCandidatesCore(nodes, [], '');
    expect(result.map((c) => c.id)).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    expect(result).toHaveLength(4);
  });

  it('strips semantic markers and falls back to "(untitled node)" for empty text', () => {
    const result = getDecisionAnchorCandidatesCore(nodes, [], '');
    expect(result.find((c) => c.id === 1)?.text).toBe('Project Plan overview');
    expect(result.find((c) => c.id === 3)?.text).toBe('(untitled node)');
  });

  it('filters case-insensitively by substring against the stripped text', () => {
    const result = getDecisionAnchorCandidatesCore(nodes, [], 'BUDGET');
    expect(result.map((c) => c.id)).toEqual([4]);
  });

  it('flags a node as taken when a decision log is anchored to it', () => {
    const logsList: DecisionLogRecord[] = [{ id: 'dl1', anchorNodeId: 2 }];
    const result = getDecisionAnchorCandidatesCore(nodes, logsList, '');
    expect(result.find((c) => c.id === 2)?.taken).toBe(true);
    expect(result.find((c) => c.id === 1)?.taken).toBe(false);
  });

  it('does not flag a node as taken when its only anchoring log matches excludeId', () => {
    const logsList: DecisionLogRecord[] = [{ id: 'dl1', anchorNodeId: 2 }];
    const result = getDecisionAnchorCandidatesCore(nodes, logsList, '', 'dl1');
    expect(result.find((c) => c.id === 2)?.taken).toBe(false);
  });

  it('sorts depth-first, preserving document order within a depth (stable sort)', () => {
    const result = getDecisionAnchorCandidatesCore(nodes, [], '');
    expect(result.map((c) => c.id)).toEqual([1, 4, 2, 3]);
  });

  it('defaults a missing depth to 0', () => {
    const noDepth: AnchorableNode[] = [{ id: 9, text: 'x' }];
    const result = getDecisionAnchorCandidatesCore(noDepth, [], '');
    expect(result[0].depth).toBe(0);
  });

  it('caps results at 50', () => {
    const many: AnchorableNode[] = Array.from({ length: 75 }, (_, i) => ({
      id: i,
      text: `node ${i}`,
      depth: 0,
    }));
    const result = getDecisionAnchorCandidatesCore(many, [], '');
    expect(result).toHaveLength(50);
  });
});

describe('subtreeHasDecisionCore', () => {
  const tree: QueryableNode[] = [
    { id: 1, text: 'Parent', depth: 0 },
    { id: 2, text: 'Child A', depth: 1 },
    { id: 3, text: 'Grandchild', depth: 2 },
    { id: 4, text: 'Sibling', depth: 0 },
  ];

  it('is false when no descendant has a decision log', () => {
    expect(subtreeHasDecisionCore(tree, [], 0)).toBe(false);
  });

  it('is true when a direct child has a decision log', () => {
    const logsList: DecisionLogRecord[] = [{ id: 'dl1', anchorNodeId: 2 }];
    expect(subtreeHasDecisionCore(tree, logsList, 0)).toBe(true);
  });

  it('is true when a deeper descendant has a decision log', () => {
    const logsList: DecisionLogRecord[] = [{ id: 'dl1', anchorNodeId: 3 }];
    expect(subtreeHasDecisionCore(tree, logsList, 0)).toBe(true);
  });

  it('excludes the node itself -- a decision log anchored to the subtree root does not count', () => {
    const logsList: DecisionLogRecord[] = [{ id: 'dl1', anchorNodeId: 1 }];
    expect(subtreeHasDecisionCore(tree, logsList, 0)).toBe(false);
  });

  it('does not look past the subtree boundary (a sibling with a decision log does not count)', () => {
    const logsList: DecisionLogRecord[] = [{ id: 'dl1', anchorNodeId: 4 }];
    expect(subtreeHasDecisionCore(tree, logsList, 0)).toBe(false);
  });

  it('is false for a leaf node (no descendants at all)', () => {
    expect(subtreeHasDecisionCore(tree, [{ id: 'dl1', anchorNodeId: 3 }], 2)).toBe(false);
  });
});

describe('decisionStatusColorKeyCore', () => {
  it('maps approved to green', () => {
    expect(decisionStatusColorKeyCore('approved')).toBe('green');
  });

  it('maps rejected to red', () => {
    expect(decisionStatusColorKeyCore('rejected')).toBe('red');
  });

  it('maps proposed to gray', () => {
    expect(decisionStatusColorKeyCore('proposed')).toBe('gray');
  });

  it('is case-insensitive, same as decisionStatusOfCore', () => {
    expect(decisionStatusColorKeyCore('APPROVED')).toBe('green');
  });

  it('defaults an unrecognized or missing status to gray (proposed)', () => {
    expect(decisionStatusColorKeyCore('archived')).toBe('gray');
    expect(decisionStatusColorKeyCore(null)).toBe('gray');
    expect(decisionStatusColorKeyCore(undefined)).toBe('gray');
  });
});
