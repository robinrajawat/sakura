/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

// Interface colours come from the theme (owner, 2026-10-24: "standard, unified and elegant"):
// body.theme-light / body.theme-dark in src/styles/index/base.css define every colour twice, so a
// hard-coded colour looks the same in both themes and ignores the chosen accent. Status colours
// use --danger / --success / --warning. Allowed: white and black (checkmarks, knobs),
// var(--x, #fallback), and places that are always light on purpose (print rules, PDF pages,
// the highlighter palette).
const PAGE = import.meta.glob('../../index.html', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const SHEETS = import.meta.glob(['../../src/styles/index/*.css', '../../src/styles/hub/*.css'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const ALWAYS_LIGHT_FILES = ['pdf-export-overlay.css'];
// The support item's gold is decoration, not a status (pinned by account-menu-layout.spec.ts).
// hub.css: the gold coffee button is decoration; the swipe backgrounds stay saturated in both themes because
// white text sits on them (the dark --success/--danger are too light for it).
const ALLOWED_SELECTOR = /(hl-mark|#pv-open-items|\.thread-chip\.is-yes|\.account-support-icon|#account-coffee-btn|\.swipe-bg-(start|end))/;

function withoutPrintBlocks(css: string): string {
  let out = '';
  let i = 0;
  for (;;) {
    const at = css.indexOf('@media print', i);
    if (at < 0) return out + css.slice(i);
    out += css.slice(i, at);
    let j = css.indexOf('{', at) + 1;
    for (let depth = 1; depth > 0 && j < css.length; j++) depth += css[j] === '{' ? 1 : css[j] === '}' ? -1 : 0;
    i = j;
  }
}

describe('interface colours come from the theme', () => {
  it('no rule hard-codes a colour outside the allowed places', () => {
    expect(Object.keys(SHEETS).length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const [key, text] of Object.entries(SHEETS)) {
      const file = key.split('/').pop() as string;
      if (ALWAYS_LIGHT_FILES.includes(file)) continue;
      const css = withoutPrintBlocks(text.replace(/\/\*[\s\S]*?\*\//g, ''));
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1].trim();
        if (/^body\.theme-(light|dark)$/.test(sel) || ALLOWED_SELECTOR.test(sel)) continue;
        for (const d of m[2].matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) {
          if (d[1].startsWith('--')) continue;
          const value = d[2].replace(/var\(--[\w-]+,\s*#[0-9a-fA-F]{3,8}\)/g, '');
          for (const c of value.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
            if (!/^#(fff|ffffff|000|000000)$/i.test(c)) offenders.push(`${file}: ${sel} → ${c}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Inline style="" in the page's markup can't be seen by the stylesheet check above (the delete-account
  // section kept a hard-coded red there until 2026-10-25). Only the accent swatches (they show their own
  // colour) and the About support button keep fixed colours.
  it('no inline style in the markup hard-codes a colour', () => {
    const html = Object.values(PAGE)[0];
    expect(html.length).toBeGreaterThan(100000);
    const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '');
    const offenders: string[] = [];
    for (const m of markup.matchAll(/<([a-z]+)\b([^>]*?style="([^"]*)"[^>]*)>/g)) {
      if (!/#[0-9a-fA-F]{3,8}\b/.test(m[3])) continue;
      if (/id="about-support-btn"/.test(m[2])) continue;
      offenders.push(`<${m[1]}${m[2].slice(0, 80)}>`);
    }
    expect(offenders).toEqual([]);
  });

  it('the status colours are defined for both themes', () => {
    for (const base of [SHEETS['../../src/styles/index/base.css'], SHEETS['../../src/styles/hub/hub.css']]) for (const theme of ['light', 'dark']) {
      const block = base.match(new RegExp(`body\\.theme-${theme}\\{([^}]*)\\}`))?.[1] || '';
      for (const t of ['danger', 'success', 'warning']) expect(block, `${theme} --${t}`).toMatch(new RegExp(`--${t}:#`));
    }
  });
});
