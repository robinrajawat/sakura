import { describe, it, expect, beforeAll } from 'vitest';
import {
  computeDiagramAnchorLabel,
  isDiagramOrphaned,
  diagramNeedsAttentionCore,
  reorderDiagramsCore,
  type AnchorableDiagram
} from './diagramAnchor';
import { stripSemanticMarkers } from '../utils/stripSemanticMarkers';

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

describe('diagramNeedsAttentionCore', () => {
  it('is always false for a whiteboard, regardless of anchor/orphan state', () => {
    expect(diagramNeedsAttentionCore({ id: 'd1', isWhiteboard: true, anchorNodeId: null }, false)).toBe(false);
    expect(diagramNeedsAttentionCore({ id: 'd1', isWhiteboard: true, anchorNodeId: 999 }, true)).toBe(false);
  });

  it('is true when unlinked (not a whiteboard)', () => {
    expect(diagramNeedsAttentionCore({ id: 'd1', anchorNodeId: null }, false)).toBe(true);
  });

  it('is true when orphaned (not a whiteboard)', () => {
    expect(diagramNeedsAttentionCore({ id: 'd1', anchorNodeId: 5 }, true)).toBe(true);
  });

  it('is false when linked and not orphaned (not a whiteboard)', () => {
    expect(diagramNeedsAttentionCore({ id: 'd1', anchorNodeId: 1 }, false)).toBe(false);
  });
});

describe('reorderDiagramsCore', () => {
  function diags(ids: string[]): AnchorableDiagram[] {
    return ids.map((id) => ({ id }));
  }

  it('is a no-op when draggedId equals targetId (compared as strings)', () => {
    const d = diags(['a', 'b', 'c']);
    expect(reorderDiagramsCore(d, 'b', 'b')).toBe(false);
    expect(d.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op when draggedId is not found', () => {
    const d = diags(['a', 'b', 'c']);
    expect(reorderDiagramsCore(d, 'zzz', 'b')).toBe(false);
    expect(d.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op when targetId is not found', () => {
    const d = diags(['a', 'b', 'c']);
    expect(reorderDiagramsCore(d, 'a', 'zzz')).toBe(false);
    expect(d.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('compares ids as strings, so a numeric and string id can match', () => {
    const d: AnchorableDiagram[] = [{ id: 1 }, { id: 'b' }, { id: 3 }];
    const result = reorderDiagramsCore(d, 1, 3);
    expect(result).toBe(true);
  });

  // Pinned quirk (NOT a bug — this matches index.html's original exactly): the target index is
  // computed BEFORE the dragged item is spliced out, and is never recomputed afterward. Because
  // of that stale index, dragging FORWARD (fromIdx < toIdx) lands the moved item AFTER the
  // target (the shift-left from removal absorbs one position), while dragging BACKWARD
  // (fromIdx > toIdx) lands it BEFORE the target (unaffected by the shift, since the removal
  // happened after the target's index). There is no "side" parameter for diagrams, unlike
  // reorderTabsCore's explicit left/right — this asymmetry IS the real drag-and-drop behavior.
  it('dragging forward lands the item just AFTER the target (stale post-removal index)', () => {
    const d = diags(['a', 'b', 'c', 'd']);
    reorderDiagramsCore(d, 'b', 'd');
    expect(d.map((x) => x.id)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('dragging backward lands the item just BEFORE the target', () => {
    const d = diags(['a', 'b', 'c', 'd']);
    reorderDiagramsCore(d, 'd', 'a');
    expect(d.map((x) => x.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('dragging one position forward (adjacent) swaps the pair', () => {
    const d = diags(['a', 'b', 'c']);
    reorderDiagramsCore(d, 'a', 'b');
    expect(d.map((x) => x.id)).toEqual(['b', 'a', 'c']);
  });

  it('mutates the array in place — same object reference, no new array returned', () => {
    const d = diags(['a', 'b', 'c']);
    const originalRef = d;
    reorderDiagramsCore(d, 'c', 'a');
    expect(d).toBe(originalRef);
  });

  it('preserves other diagram properties across the move', () => {
    const d: AnchorableDiagram[] = [{ id: 'a', anchorNodeId: 7 }, { id: 'b' }, { id: 'c' }];
    reorderDiagramsCore(d, 'a', 'c');
    expect(d.find((x) => x.id === 'a')?.anchorNodeId).toBe(7);
  });
});
