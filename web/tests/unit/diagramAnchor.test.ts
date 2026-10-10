import { describe, it, expect, beforeAll } from 'vitest';
import {
  computeDiagramAnchorLabel,
  isDiagramOrphaned
} from '../../src/state/diagramAnchor';
import { stripSemanticMarkers } from '../../src/utils/stripSemanticMarkers';

// diagramAnchor.ts references stripSemanticMarkers as an ambient global (a `declare function`,
// erased at compile time — see the module's own header comment for why). In the real app that
// global is provided by stripSemanticMarkers.ts's own generated block sharing the same script
// scope; in this Node test environment there is no such shared scope, so it's wired up
// explicitly here from the real implementation — not a mock, the actual tested function.
beforeAll(() => {
  const g = globalThis as unknown as { stripSemanticMarkers: typeof stripSemanticMarkers };
  g.stripSemanticMarkers = stripSemanticMarkers;
});

interface TestNode {
  id: number;
  text?: string;
}

describe('computeDiagramAnchorLabel', () => {
  it('returns "Not linked" when anchorNodeId is null/undefined', () => {
    expect(computeDiagramAnchorLabel({ id: 'd1', anchorNodeId: null }, [])).toBe('Not linked to a node');
    expect(computeDiagramAnchorLabel({ id: 'd1' }, [])).toBe('Not linked to a node');
  });

  it('returns "no longer exists" when the anchored node id is not found', () => {
    const nodes: TestNode[] = [{ id: 1, text: 'hello' }];
    expect(computeDiagramAnchorLabel({ id: 'd1', anchorNodeId: 999 }, nodes)).toBe('Linked node no longer exists');
  });

  it('returns the anchored node\'s text, stripped of semantic markers', () => {
    const nodes: TestNode[] = [{ id: 1, text: '[Header] some `code` text' }];
    expect(computeDiagramAnchorLabel({ id: 'd1', anchorNodeId: 1 }, nodes)).toBe('Under: Header some code text');
  });

  it('falls back to "(untitled node)" when the anchored node has empty text', () => {
    const nodes: TestNode[] = [{ id: 1, text: '' }];
    expect(computeDiagramAnchorLabel({ id: 'd1', anchorNodeId: 1 }, nodes)).toBe('Under: (untitled node)');
  });

  it('truncates long node text to 60 characters', () => {
    const longText = 'x'.repeat(100);
    const nodes: TestNode[] = [{ id: 1, text: longText }];
    const label = computeDiagramAnchorLabel({ id: 'd1', anchorNodeId: 1 }, nodes);
    expect(label).toBe('Under: ' + 'x'.repeat(60));
  });
});

describe('isDiagramOrphaned', () => {
  it('is false when never anchored (anchorNodeId is null)', () => {
    expect(isDiagramOrphaned({ id: 'd1', anchorNodeId: null }, [])).toBe(false);
  });

  it('is true when anchored to a node id that no longer exists', () => {
    expect(isDiagramOrphaned({ id: 'd1', anchorNodeId: 5 }, [{ id: 1 }])).toBe(true);
  });

  it('is false when anchored to a node id that exists', () => {
    expect(isDiagramOrphaned({ id: 'd1', anchorNodeId: 1 }, [{ id: 1 }])).toBe(false);
  });
});
