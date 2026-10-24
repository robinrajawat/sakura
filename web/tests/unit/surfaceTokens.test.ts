/// <reference types="vite/client" />
import { describe, it, expect } from 'vitest';

// Floating surfaces share three tiers (owner, 2026-10-24: "standard, unified and elegant"):
// menus/popovers, panels and dialogs each take their corners and shadow from the
// --radius-*/--shadow-* tokens in src/styles/index/base.css. A new menu, popover, panel or
// dialog with its own box-shadow fails here; pick a tier, or add it to ALLOWED with a reason.
const SHEETS = import.meta.glob('../../src/styles/index/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const sheet = (name: string) => SHEETS[`../../src/styles/index/${name}`];

const SURFACE = /(menu|popover|dialog|modal|panel|picker|dropdown|#link-card)/i;
const ALLOWED: Record<string, string> = {
  '.pv-popover': 'preview popover has its own layered look',
  '#tour-tooltip': 'tour coach mark is meant to stand out',
  '#todos-panel': 'docked To-Dos panel casts a side shadow (hub-dock.css)',
  '#dock-panel-appbar-toggle .todo-overdue-badge': 'badge, not a surface',
  '#sakura-modal-input,#sakura-modal-input2': 'input, not a surface',
  '#tag-popover-input': 'input, not a surface',
  '.panel-search-wrap input': 'input, not a surface'
};

function rules(): { file: string; sel: string; body: string }[] {
  const out: { file: string; sel: string; body: string }[] = [];
  for (const [key, text] of Object.entries(SHEETS)) {
    const file = key.split('/').pop() as string;
    const css = text.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push({ file, sel: m[1].trim(), body: m[2] });
  }
  return out;
}

describe('floating surfaces use the shared tier tokens', () => {
  it('every menu, popover, panel and dialog shadow is a --shadow-* token', () => {
    const offenders = rules()
      .filter((r) => /box-shadow/.test(r.body) && SURFACE.test(r.sel))
      .filter((r) => !/:hover|:focus|\.is-invalid|cal-day/.test(r.sel))
      .filter((r) => !(r.sel in ALLOWED && (r.sel !== '#todos-panel' || r.file === 'hub-dock.css')))
      .filter((r) => !/box-shadow\s*:\s*var\(--shadow-(menu|panel|dialog)\)/.test(r.body))
      .map((r) => `${r.file}: ${r.sel}`);
    expect(offenders).toEqual([]);
  });

  it('a surface on a shadow token takes the same tier corners', () => {
    const mismatched = rules()
      .map((r) => ({ ...r, tier: r.body.match(/box-shadow\s*:\s*var\(--shadow-(menu|panel|dialog)\)/)?.[1] }))
      .filter((r) => r.tier && !new RegExp(`border-radius\\s*:\\s*var\\(--radius-${r.tier}\\)`).test(r.body))
      .map((r) => `${r.file}: ${r.sel}`);
    expect(mismatched).toEqual([]);
  });

  it('the tokens are defined in base.css', () => {
    expect(Object.keys(SHEETS).length).toBeGreaterThan(10);
    const base = sheet('base.css');
    for (const t of ['menu', 'panel', 'dialog']) {
      expect(base).toMatch(new RegExp(`--radius-${t}:`));
      expect(base).toMatch(new RegExp(`--shadow-${t}:`));
    }
  });
});
