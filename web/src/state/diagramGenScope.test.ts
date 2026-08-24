import { describe, it, expect } from 'vitest';
import {
  pickDiagramGenScopeCore,
  generateDiagramXmlFromOutline,
  DIAGRAM_GEN_MAX_NODES,
  DIAGRAM_GEN_MAX_DEPTH,
  type ScopeQueryNode,
  type GenerateNode
} from './diagramGenScope';

function n(id: number, depth: number, text = `node ${id}`): GenerateNode {
  return { id, depth, text };
}

describe('pickDiagramGenScopeCore', () => {
  it('errors on an empty document', () => {
    const result = pickDiagramGenScopeCore([], []);
    expect(result).toEqual({ ok: false, error: 'Nothing to diagram — this document is empty' });
  });

  it('whole document: every depth-0 node becomes a root, scope covers everything', () => {
    const nodes: ScopeQueryNode[] = [n(1, 0), n(2, 1), n(3, 0), n(4, 1)];
    const result = pickDiagramGenScopeCore(nodes, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.rootIdxs).toEqual([0, 2]);
      expect(result.scope.scopeIdxs).toEqual([0, 1, 2, 3]);
    }
  });

  it('single selection: scope is just that node\'s subtree', () => {
    const nodes: ScopeQueryNode[] = [n(1, 0), n(2, 1), n(3, 1), n(4, 0)];
    const result = pickDiagramGenScopeCore(nodes, [1]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.scope.rootIdxs).toEqual([0]);
      expect(result.scope.scopeIdxs).toEqual([0, 1, 2]);
    }
  });

  it('errors when the selected id is not found', () => {
    const nodes: ScopeQueryNode[] = [n(1, 0)];
    const result = pickDiagramGenScopeCore(nodes, [999]);
    expect(result).toEqual({ ok: false, error: 'Selected node not found' });
  });

  it('errors on multi-selection', () => {
    const nodes: ScopeQueryNode[] = [n(1, 0), n(2, 0)];
    const result = pickDiagramGenScopeCore(nodes, [1, 2]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Select a single node/);
  });

  it('errors past the node cap', () => {
    const nodes: ScopeQueryNode[] = Array.from({ length: DIAGRAM_GEN_MAX_NODES + 1 }, (_, i) => n(i + 1, 0));
    const result = pickDiagramGenScopeCore(nodes, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Too much to diagram/);
  });

  it('errors past the depth cap', () => {
    const nodes: ScopeQueryNode[] = Array.from({ length: DIAGRAM_GEN_MAX_DEPTH + 1 }, (_, i) => n(i + 1, i));
    const result = pickDiagramGenScopeCore(nodes, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Too many levels deep/);
  });
});

describe('generateDiagramXmlFromOutline', () => {
  it('produces a well-formed mxfile for a simple tree', () => {
    const nodes: GenerateNode[] = [n(1, 0, 'Root'), n(2, 1, 'Child A'), n(3, 1, 'Child B')];
    const result = generateDiagramXmlFromOutline(nodes, [], 12345);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.xml).toContain('<mxfile');
      expect(result.xml).toContain('id="gd-12345"');
      expect(result.xml).toContain('Root');
      expect(result.xml).toContain('Child A');
      expect(result.xml).toContain('Child B');
    }
  });

  it('hard-truncates an overlong label using the generic (non-AI) budget', () => {
    const longText = 'x'.repeat(120);
    const nodes: GenerateNode[] = [n(1, 0, longText)];
    const result = generateDiagramXmlFromOutline(nodes, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.xml).not.toContain(longText);
      expect(result.xml).toContain('\u2026');
    }
  });

  it('propagates a scope error instead of generating', () => {
    const result = generateDiagramXmlFromOutline([], []);
    expect(result).toEqual({ ok: false, error: 'Nothing to diagram — this document is empty' });
  });
});
