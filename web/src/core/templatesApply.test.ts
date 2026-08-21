import { describe, it, expect } from 'vitest';
import { applyTemplateNodesCore, AppliedTemplateNode, TemplatesApplyDeps } from './templatesApply';

// Fake makeNode — mirrors index.html's real makeNode's id-minting/timestamp behavior (a
// module-local counter standing in for the real ambient `nextId`), without depending on any
// ambient global, so these tests exercise applyTemplateNodesCore exactly the way the real
// injected makeNode would be called, while staying fully isolated per test.
function makeFakeDeps(startId = 1): { deps: TemplatesApplyDeps; getNextId: () => number } {
  let counter = startId;
  const deps: TemplatesApplyDeps = {
    makeNode: (text, depth, parentId, styles, note, isCheckbox): AppliedTemplateNode => ({
      id: counter++,
      text,
      depth,
      parentId,
      styles,
      note,
      isCheckbox,
      checked: false,
      tags: [],
    }),
    emptyStyles: () => ({ bold: false, italic: false, underline: false, strike: false, highlight: false, color: false, heading: 0 }),
  };
  return { deps, getNextId: () => counter };
}

describe('applyTemplateNodesCore', () => {
  it('returns empty nodes and nextId=1 for null/undefined/empty input', () => {
    const { deps } = makeFakeDeps();
    expect(applyTemplateNodesCore(null, deps)).toEqual({ nodes: [], nextId: 1 });
    expect(applyTemplateNodesCore(undefined, deps)).toEqual({ nodes: [], nextId: 1 });
    expect(applyTemplateNodesCore([], deps)).toEqual({ nodes: [], nextId: 1 });
  });

  it('constructs one node per raw entry via the injected makeNode, in order', () => {
    const { deps } = makeFakeDeps();
    const result = applyTemplateNodesCore(
      [
        { text: 'Root', depth: 0 },
        { text: 'Child', depth: 1 },
      ],
      deps
    );
    expect(result.nodes.map((n) => n.text)).toEqual(['Root', 'Child']);
    expect(result.nodes.map((n) => n.depth)).toEqual([0, 1]);
  });

  it('always passes parentId=null to makeNode — parentage is derived later by rebuildParentIds from depth, never set here', () => {
    const { deps } = makeFakeDeps();
    const result = applyTemplateNodesCore([{ text: 'A', depth: 0 }, { text: 'B', depth: 2 }], deps);
    expect(result.nodes.every((n) => n.parentId === null)).toBe(true);
  });

  it('defaults text/depth/note for missing fields, and isCheckbox for a missing/falsy flag', () => {
    const { deps } = makeFakeDeps();
    const result = applyTemplateNodesCore([{}], deps);
    const n = result.nodes[0] as unknown as { text: string; depth: number; note: string; isCheckbox: boolean };
    expect(n.text).toBe('');
    expect(n.depth).toBe(0);
    expect(n.note).toBe('');
    expect(n.isCheckbox).toBe(false);
  });

  it('passes isCheckbox through as a real boolean, coercing truthy/falsy input', () => {
    const { deps } = makeFakeDeps();
    const result = applyTemplateNodesCore([{ isCheckbox: 1 as unknown as boolean }, { isCheckbox: 0 as unknown as boolean }], deps);
    expect((result.nodes[0] as unknown as { isCheckbox: boolean }).isCheckbox).toBe(true);
    expect((result.nodes[1] as unknown as { isCheckbox: boolean }).isCheckbox).toBe(false);
  });

  it('falls back to the injected emptyStyles() when a raw node has no styles', () => {
    let calls = 0;
    const { deps } = makeFakeDeps();
    const wrapped: TemplatesApplyDeps = {
      ...deps,
      emptyStyles: () => {
        calls++;
        return deps.emptyStyles();
      },
    };
    applyTemplateNodesCore([{ text: 'A' }, { text: 'B', styles: { bold: true } }], wrapped);
    expect(calls).toBe(1);
  });

  it('does not call emptyStyles when a raw node already has styles', () => {
    let calls = 0;
    const { deps } = makeFakeDeps();
    const wrapped: TemplatesApplyDeps = { ...deps, emptyStyles: () => { calls++; return deps.emptyStyles(); } };
    applyTemplateNodesCore([{ text: 'A', styles: { bold: true } }], wrapped);
    expect(calls).toBe(0);
  });

  it('coerces checked to a real boolean', () => {
    const { deps } = makeFakeDeps();
    const result = applyTemplateNodesCore([{ checked: 1 as unknown as boolean }, { checked: undefined }], deps);
    expect((result.nodes[0] as unknown as { checked: boolean }).checked).toBe(true);
    expect((result.nodes[1] as unknown as { checked: boolean }).checked).toBe(false);
  });

  it('normalizes tags to an array, defaulting non-array/missing tags to []', () => {
    const { deps } = makeFakeDeps();
    const result = applyTemplateNodesCore(
      [{ tags: ['a', 'b'] }, { tags: 'not-an-array' as unknown as string[] }, {}],
      deps
    );
    expect(result.nodes[0].tags).toEqual(['a', 'b']);
    expect(result.nodes[1].tags).toEqual([]);
    expect(result.nodes[2].tags).toEqual([]);
  });

  it('computes nextId as max existing id + 1, driven by the ids the injected makeNode actually minted', () => {
    const { deps } = makeFakeDeps(41); // simulates an ambient nextId already at 41
    const result = applyTemplateNodesCore([{ text: 'A' }, { text: 'B' }, { text: 'C' }], deps);
    expect(result.nodes.map((n) => n.id)).toEqual([41, 42, 43]);
    expect(result.nextId).toBe(44);
  });

  it('never mutates any global itself — nextId is purely derived from the returned nodes, not tracked independently', () => {
    const { deps, getNextId } = makeFakeDeps(1);
    const result = applyTemplateNodesCore([{ text: 'A' }, { text: 'B' }], deps);
    // The fake counter (standing in for the real ambient nextId, which only makeNode itself
    // mutates) should be exactly one past the last minted id — proving applyTemplateNodesCore
    // never calls makeNode more or fewer times than there are raw nodes, and never touches
    // any id-tracking state on its own.
    expect(getNextId()).toBe(3);
    expect(result.nextId).toBe(3);
  });
});
