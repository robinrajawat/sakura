import { describe, it, expect, beforeAll } from 'vitest';
import { diagramGenFinishGenerateXmlCore, type FGNode, type FGNodeMetaMap } from '../../src/state/diagramGenFinishGenerate';
import { getSubtreeEnd, getParentIndex } from '../../src/core/nodeQueries';
import { assignDiagramGenColorsCore, applyDiagramGenShapeColorOverridesCore } from '../../src/state/diagramGenColors';
import {
  diagramGenHardTruncateCore,
  diagramGenLightenCore,
  diagramGenAdjustDimsForShapeCore,
  diagramGenBoxDimsCore,
  diagramGenMergedBoxDimsCore,
} from '../../src/core/diagramGenDims';
import {
  diagramGenAllChildIdxsCore,
  diagramGenIsMergeCandidateCore,
  diagramGenChainHeaderSuppressedCore,
  diagramGenIsContainerCore,
  diagramGenIsPassthroughCore,
  diagramGenIsConfirmedEdgeLabelCore,
  diagramGenRenderChildIdxsCore,
  diagramGenChainTailIdxCore,
  diagramGenEdgeLabelBeforeCore,
  diagramGenIsSequenceCore,
  diagramGenIsHorizontalCore,
} from '../../src/state/diagramGenTopology';
import { layoutDiagramGenTreeCore } from '../../src/state/diagramGenLayout';
import { computeDiagramGenFinalRectsCore } from '../../src/state/diagramGenRects';
import { diagramGenLegendEntriesCore, diagramGenLegendCellsCore } from '../../src/state/diagramGenLegend';

// diagramGenFinishGenerate.ts references ~20 already-generated functions from six sibling
// modules as ambient globals (declare function, erased at compile time — see the module's own
// header for why). In the real app those globals are provided by their own already-spliced
// generated blocks sharing the same script scope; in this Node test environment there is no such
// shared scope, so they're wired up explicitly here from the real implementations — not mocks,
// the actual tested code from every module this one builds on.
beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.getSubtreeEnd = getSubtreeEnd;
  g.getParentIndex = getParentIndex;
  g.assignDiagramGenColorsCore = assignDiagramGenColorsCore;
  g.applyDiagramGenShapeColorOverridesCore = applyDiagramGenShapeColorOverridesCore;
  g.diagramGenHardTruncateCore = diagramGenHardTruncateCore;
  g.diagramGenLightenCore = diagramGenLightenCore;
  g.diagramGenAdjustDimsForShapeCore = diagramGenAdjustDimsForShapeCore;
  g.diagramGenBoxDimsCore = diagramGenBoxDimsCore;
  g.diagramGenMergedBoxDimsCore = diagramGenMergedBoxDimsCore;
  g.diagramGenAllChildIdxsCore = diagramGenAllChildIdxsCore;
  g.diagramGenIsMergeCandidateCore = diagramGenIsMergeCandidateCore;
  g.diagramGenChainHeaderSuppressedCore = diagramGenChainHeaderSuppressedCore;
  g.diagramGenIsContainerCore = diagramGenIsContainerCore;
  g.diagramGenIsPassthroughCore = diagramGenIsPassthroughCore;
  g.diagramGenIsConfirmedEdgeLabelCore = diagramGenIsConfirmedEdgeLabelCore;
  g.diagramGenRenderChildIdxsCore = diagramGenRenderChildIdxsCore;
  g.diagramGenChainTailIdxCore = diagramGenChainTailIdxCore;
  g.diagramGenEdgeLabelBeforeCore = diagramGenEdgeLabelBeforeCore;
  g.diagramGenIsSequenceCore = diagramGenIsSequenceCore;
  g.diagramGenIsHorizontalCore = diagramGenIsHorizontalCore;
  g.layoutDiagramGenTreeCore = layoutDiagramGenTreeCore;
  g.computeDiagramGenFinalRectsCore = computeDiagramGenFinalRectsCore;
  g.diagramGenLegendEntriesCore = diagramGenLegendEntriesCore;
  g.diagramGenLegendCellsCore = diagramGenLegendCellsCore;
});

function node(id: number, depth: number, text = ''): FGNode {
  return { id, depth, text };
}

describe('diagramGenFinishGenerateXmlCore', () => {
  it('renders a valid mxfile document for a simple two-node tree (merge-candidate folding applies, matching the real function\'s own default rules)', () => {
    const nodes = [node(1, 0, 'Root'), node(2, 1, 'Child')];
    const labels = new Map([[0, 'Root'], [1, 'Child']]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0, 1], rootIdxs: [0] }, labels, new Map(), 12345);
    expect(xml).toContain('<mxfile host="app.diagrams.net">');
    expect(xml).toContain('id="gd-12345"');
    // A single childless leaf under a plain (non-sequence) parent is a real merge candidate —
    // it folds into the parent's own box as a bold second line rather than getting its own box,
    // same as the real diagramGenFinishGenerate always did for this exact shape.
    expect(xml).toContain('<mxCell id="gd-n0"');
    expect(xml).not.toContain('<mxCell id="gd-n1"');
    expect(xml).toContain('&lt;b&gt;Root&lt;/b&gt;&lt;br&gt;Child');
  });

  it('is deterministic given an explicit now, and varies with it', () => {
    const nodes = [node(1, 0, 'Root')];
    const labels = new Map([[0, 'Root']]);
    const a = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0], rootIdxs: [0] }, labels, new Map(), 111);
    const b = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0], rootIdxs: [0] }, labels, new Map(), 111);
    const c = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0], rootIdxs: [0] }, labels, new Map(), 222);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain('id="gd-111"');
    expect(c).toContain('id="gd-222"');
  });

  it('defaults now to the current time when not provided', () => {
    const before = Date.now();
    const xml = diagramGenFinishGenerateXmlCore([node(1, 0, 'Root')], { scopeIdxs: [0], rootIdxs: [0] }, new Map([[0, 'Root']]), new Map());
    const after = Date.now();
    const match = xml.match(/id="gd-(\d+)"/);
    expect(match).not.toBeNull();
    const usedNow = Number(match![1]);
    expect(usedNow).toBeGreaterThanOrEqual(before);
    expect(usedNow).toBeLessThanOrEqual(after);
  });

  it('hard-truncates a decision-shaped label past its own tighter character budget', () => {
    const longText = 'This is a very long decision label that definitely exceeds the forty-two character decision budget';
    const nodes = [node(1, 0, longText)];
    const labels = new Map([[0, longText]]);
    const nodeMeta: FGNodeMetaMap = new Map([[1, { shape: 'decision' }]]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0], rootIdxs: [0] }, labels, nodeMeta, 1);
    expect(xml).not.toContain(longText);
    expect(labels.get(0)!.length).toBeLessThan(longText.length);
  });

  it('does NOT truncate a non-decision label, however long', () => {
    const longText = 'This is a very long ordinary label that also exceeds forty-two characters easily';
    const nodes = [node(1, 0, longText)];
    const labels = new Map([[0, longText]]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0], rootIdxs: [0] }, labels, new Map(), 1);
    expect(xml).toContain(longText);
  });

  it('renders a container background cell for a node with nodeMeta.container', () => {
    const nodes = [node(1, 0, 'Group'), node(2, 1, 'Inner')];
    const labels = new Map([[0, 'Group'], [1, 'Inner']]);
    const nodeMeta: FGNodeMetaMap = new Map([[1, { container: true }]]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0, 1], rootIdxs: [0] }, labels, nodeMeta, 1);
    expect(xml).toContain('<mxCell id="gd-grp0"');
    expect(xml).toContain('value="Group"');
  });

  it('does not merge a child that has its own classified shape (excluded by diagramGenIsMergeCandidateCore, already covered by diagramGenTopology.test.ts)', () => {
    const nodes = [node(1, 0, 'Parent'), node(2, 1, 'Detail')];
    const labels = new Map([[0, 'Parent'], [1, 'Detail']]);
    const nodeMeta: FGNodeMetaMap = new Map([[2, { shape: 'ui' }]]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0, 1], rootIdxs: [0] }, labels, nodeMeta, 1);
    // A child with its own classified shape keeps its own box instead of merging into the
    // parent's — this module only needs to prove it correctly ORCHESTRATES
    // diagramGenIsMergeCandidateCore's real verdict, not re-verify that function's own
    // exclusion rules (already covered elsewhere).
    expect(xml).toContain('<mxCell id="gd-n0"');
    expect(xml).toContain('<mxCell id="gd-n1"');
  });

  it('includes a legend when a classified shape or marker is present in scope', () => {
    const nodes = [node(1, 0, 'UI Node')];
    const labels = new Map([[0, 'UI Node']]);
    const nodeMeta: FGNodeMetaMap = new Map([[1, { shape: 'ui' }]]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0], rootIdxs: [0] }, labels, nodeMeta, 1);
    expect(xml).toContain('gd-legend-sw0');
    expect(xml).toContain('UI / Frontend');
  });

  it('omits the legend entirely when nothing in scope is classified or marked', () => {
    const nodes = [node(1, 0, 'Plain')];
    const labels = new Map([[0, 'Plain']]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0], rootIdxs: [0] }, labels, new Map(), 1);
    expect(xml).not.toContain('gd-legend');
  });

  it('dashes the edge into an excluded-shaped node', () => {
    const nodes = [node(1, 0, 'Root'), node(2, 1, 'Skipped')];
    const labels = new Map([[0, 'Root'], [1, 'Skipped']]);
    const nodeMeta: FGNodeMetaMap = new Map([[2, { shape: 'excluded' }]]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0, 1], rootIdxs: [0] }, labels, nodeMeta, 1);
    const edgeMatch = xml.match(/<mxCell id="gd-e0"[^>]*style="([^"]*)"/);
    expect(edgeMatch).not.toBeNull();
    expect(edgeMatch![1]).toContain('dashed=1;');
  });

  it('requires a non-empty scope, matching the real function\'s own precondition (pickDiagramGenScope never returns an empty one — it bails with null instead)', () => {
    // assignDiagramGenColorsCore's single-root branch unconditionally reads scope.rootIdxs[0] —
    // an empty scope was never a real input the original diagramGenFinishGenerate had to
    // handle, since its only real caller (generateDiagramFromOutline) already bails via
    // pickDiagramGenScope() returning null before ever reaching this function. Documenting the
    // precondition here rather than adding defensive handling the original never had.
    expect(() => diagramGenFinishGenerateXmlCore([], { scopeIdxs: [], rootIdxs: [] }, new Map(), new Map(), 1)).toThrow();
  });

  it('produces well-formed XML with no unescaped angle brackets in attribute values from raw text', () => {
    const nodes = [node(1, 0, '<script>alert(1)</script>')];
    const labels = new Map([[0, '<script>alert(1)</script>']]);
    const xml = diagramGenFinishGenerateXmlCore(nodes, { scopeIdxs: [0], rootIdxs: [0] }, labels, new Map(), 1);
    expect(xml).not.toContain('<script>alert');
    expect(xml).toContain('&lt;script&gt;');
  });
});
