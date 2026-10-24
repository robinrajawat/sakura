/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

// Interface text uses six sizes (owner, 2026-10-24: "standard, unified and elegant"):
// --fs-2xs 10 · --fs-xs 11 · --fs-sm 12 · --fs-md 13 · --fs-lg 14 · --fs-xl 16, in base.css.
// A fixed px font-size is allowed only where it is not interface text: glyphs and icons sized
// to their box, the heading menu's level previews, and the preview's document typography.
// Text that scales with the user's text size (calc(… * var(--editor-scale))) and em sizes are
// not px and so not checked.
const SHEETS = import.meta.glob('../../src/styles/index/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const NOT_UI_TEXT = /(icon|dot\b|-dot|petal|blossom|avatar|badge|caret-btn|\.app-modal-close-btn|dismiss|heading-option|\.pv-(heading|text|bullet|toc|cap-head-dot)|#app-icon|stamp)/i;

describe('interface text sizes come from the --fs-* scale', () => {
  it('no interface rule sets its own px font-size', () => {
    expect(Object.keys(SHEETS).length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const [key, text] of Object.entries(SHEETS)) {
      const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1].trim();
        if (/font-size\s*:\s*[0-9.]+px/.test(m[2]) && !NOT_UI_TEXT.test(sel)) offenders.push(`${key.split('/').pop()}: ${sel}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the scale is defined in base.css', () => {
    const base = SHEETS['../../src/styles/index/base.css'];
    for (const [t, px] of [['2xs', 10], ['xs', 11], ['sm', 12], ['md', 13], ['lg', 14], ['xl', 16]] as const) {
      expect(base).toContain(`--fs-${t}:${px}px`);
    }
  });
});
