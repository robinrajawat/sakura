import { describe, expect, it } from 'vitest';
import { groupIntoSlides } from './PresenterMode';
import type { OutlineNode } from '../store/outlineStore';

function n(id: number, depth: number): OutlineNode {
  return { id, depth, text: 't' + id, parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] };
}

describe('groupIntoSlides', () => {
  it('groups nodes into one slide per top-level (depth 0) node, carrying its descendants along', () => {
    const nodes = [n(1, 0), n(2, 1), n(3, 2), n(4, 0), n(5, 0), n(6, 1)];
    const slides = groupIntoSlides(nodes);
    expect(slides.map((s) => s.map((x) => x.id))).toEqual([[1, 2, 3], [4], [5, 6]]);
  });

  it('an empty tree produces zero slides', () => {
    expect(groupIntoSlides([])).toEqual([]);
  });

  it('a tree with no depth-0 node at all still becomes a single leading slide', () => {
    // Malformed input in practice (every real tree starts at depth 0), but the grouping
    // function shouldn't drop nodes silently if it ever happens.
    const nodes = [n(1, 1), n(2, 2)];
    const slides = groupIntoSlides(nodes);
    expect(slides.map((s) => s.map((x) => x.id))).toEqual([[1, 2]]);
  });
});
