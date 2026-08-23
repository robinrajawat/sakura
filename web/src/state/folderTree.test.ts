import { describe, expect, it } from 'vitest';
import { flattenFolderTree, type DocFolderLike } from './folderTree';

function folder(id: string, parentId: string | null): DocFolderLike {
  return { id, parentId };
}

describe('flattenFolderTree', () => {
  it('returns an empty list for no folders', () => {
    expect(flattenFolderTree([])).toEqual([]);
  });

  it('a single top-level folder is depth 0', () => {
    const a = folder('a', null);
    expect(flattenFolderTree([a])).toEqual([{ folder: a, depth: 0 }]);
  });

  it('preserves sibling order at the top level (no sort)', () => {
    const c = folder('c', null);
    const a = folder('a', null);
    const b = folder('b', null);
    // Deliberately unsorted input order -- output should match input order, not alphabetical.
    expect(flattenFolderTree([c, a, b]).map((e) => e.folder.id)).toEqual(['c', 'a', 'b']);
  });

  it('nests a child immediately after its parent, one depth deeper', () => {
    const parent = folder('parent', null);
    const child = folder('child', 'parent');
    expect(flattenFolderTree([parent, child])).toEqual([
      { folder: parent, depth: 0 },
      { folder: child, depth: 1 }
    ]);
  });

  it('handles unbounded nesting depth (matches legacy: only template folders are single-level, not document folders)', () => {
    const l1 = folder('l1', null);
    const l2 = folder('l2', 'l1');
    const l3 = folder('l3', 'l2');
    const l4 = folder('l4', 'l3');
    expect(flattenFolderTree([l1, l2, l3, l4]).map((e) => e.depth)).toEqual([0, 1, 2, 3]);
  });

  it('a folder appears fully with all its descendants before moving to the next sibling (depth-first, not breadth-first)', () => {
    const root = folder('root', null);
    const a = folder('a', 'root');
    const aChild = folder('aChild', 'a');
    const b = folder('b', 'root');
    // a is defined before b, so a's subtree (a, aChild) must fully appear before b -- a
    // breadth-first traversal would instead produce [root, a, b, aChild].
    const input = [root, a, aChild, b];
    expect(flattenFolderTree(input).map((e) => e.folder.id)).toEqual(['root', 'a', 'aChild', 'b']);
  });

  it('multiple independent top-level trees are each fully traversed in turn', () => {
    const t1 = folder('t1', null);
    const t1Child = folder('t1Child', 't1');
    const t2 = folder('t2', null);
    expect(flattenFolderTree([t1, t1Child, t2]).map((e) => e.folder.id)).toEqual(['t1', 't1Child', 't2']);
  });

  it('a folder with a dangling parentId (no matching folder id) is silently excluded, not promoted to top-level', () => {
    const orphan = folder('orphan', 'does-not-exist');
    const real = folder('real', null);
    expect(flattenFolderTree([orphan, real]).map((e) => e.folder.id)).toEqual(['real']);
  });

  it('starting from a non-root parentId flattens only that subtree', () => {
    const root = folder('root', null);
    const a = folder('a', 'root');
    const aChild = folder('aChild', 'a');
    const b = folder('b', 'root');
    const flat = flattenFolderTree([root, a, aChild, b], 'a', 0);
    expect(flat.map((e) => ({ id: e.folder.id, depth: e.depth }))).toEqual([{ id: 'aChild', depth: 0 }]);
  });
});
