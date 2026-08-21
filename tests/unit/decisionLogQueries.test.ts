import { describe, it, expect, beforeAll } from 'vitest';
import {
  findDecisionLogCore,
  decisionLogForNodeCore,
  decisionStatusLabelCore,
  decisionStatusOfCore,
  decisionLogAnchorLabelCore,
  type DecisionLogRecord,
  type AnchorableNode
} from '../../src/state/decisionLogQueries';
import { stripSemanticMarkers } from '../../src/utils/stripSemanticMarkers';

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
