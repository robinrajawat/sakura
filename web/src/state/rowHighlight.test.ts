import { describe, expect, it } from 'vitest';
import { resolveRowHighlightStyle } from './rowHighlight';

const ACCENT = '#c2553d';
const SELECTED_BG = '#fce8e3';
const MULTI_BG = '#fdf1ee';

describe('resolveRowHighlightStyle', () => {
  it('returns nothing for a row that is neither primary nor a multi-select member', () => {
    expect(resolveRowHighlightStyle('original', false, false, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({});
    expect(resolveRowHighlightStyle('bar', false, false, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({});
  });

  it('original: passes through the theme\'s own already-tinted background, stronger for primary', () => {
    expect(resolveRowHighlightStyle('original', true, false, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({ backgroundColor: SELECTED_BG });
    expect(resolveRowHighlightStyle('original', false, true, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({ backgroundColor: MULTI_BG });
  });

  it('dot: contributes no background/boxShadow of its own (the dot is rendered separately)', () => {
    expect(resolveRowHighlightStyle('dot', true, false, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({});
    expect(resolveRowHighlightStyle('dot', false, true, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({});
  });

  it('bar: an inset left border, thicker/more opaque for primary than for a member', () => {
    expect(resolveRowHighlightStyle('bar', true, false, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({
      boxShadow: `inset 3px 0 0 color-mix(in srgb, ${ACCENT} 60%, transparent)`
    });
    expect(resolveRowHighlightStyle('bar', false, true, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({
      boxShadow: `inset 2px 0 0 color-mix(in srgb, ${ACCENT} 32%, transparent)`
    });
  });

  it('outline: a full inset border for both, plus a faint fill only for primary', () => {
    expect(resolveRowHighlightStyle('outline', true, false, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 55%, transparent)`,
      backgroundColor: `color-mix(in srgb, ${ACCENT} 12%, transparent)`
    });
    expect(resolveRowHighlightStyle('outline', false, true, ACCENT, SELECTED_BG, MULTI_BG)).toEqual({
      boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 40%, transparent)`,
      backgroundColor: undefined
    });
  });
});
