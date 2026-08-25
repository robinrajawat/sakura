import { describe, expect, it } from 'vitest';
import { groupIntoSlides, slideLabel, formatElapsed } from './presenterSlides';
import type { OutlineNode } from '../store/outlineStore';
import { defaultNodeStyles } from '../store/outlineStore';

function n(id: number, depth: number): OutlineNode {
  return { id, depth, text: 't' + id, parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() };
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

describe('slideLabel', () => {
  it('strips semantic markers and brackets from a section node', () => {
    const node = { ...n(1, 0), text: '[Getting Started]' };
    expect(slideLabel(node)).toBe('Getting Started');
  });

  it('returns plain text unchanged when there is nothing to strip', () => {
    const node = { ...n(1, 0), text: 'Overview' };
    expect(slideLabel(node)).toBe('Overview');
  });

  it('falls back to "Untitled" for empty text', () => {
    const node = { ...n(1, 0), text: '' };
    expect(slideLabel(node)).toBe('Untitled');
  });

  it('falls back to "Untitled" when text is only whitespace/brackets', () => {
    const node = { ...n(1, 0), text: '[]' };
    expect(slideLabel(node)).toBe('Untitled');
  });
});

describe('formatElapsed', () => {
  it('formats under a minute as m:ss', () => {
    expect(formatElapsed(5)).toBe('0:05');
  });

  it('formats minutes and seconds as m:ss', () => {
    expect(formatElapsed(125)).toBe('2:05');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatElapsed(3725)).toBe('1:02:05');
  });

  it('formats exactly zero as 0:00', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });
});
