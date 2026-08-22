import { create } from 'zustand';

export type Theme = 'light' | 'dark';

/**
 * Phase 6.1 (docs/phase6-full-parity-plan.md, "Design tokens & app shell"). Every value below
 * is extracted directly from legacy/index.html's real `body.theme-light`/`body.theme-dark` CSS
 * custom-property blocks (search that file for `--bg:`/`--fg:` etc.) — not approximated or
 * invented. Previously this file held placeholder Google-blue-ish values (#4285f4 drop
 * indicator, generic #e8f0fe selection) that never matched legacy's real warm terracotta/olive
 * palette at all; this is the first step toward the "pixel-close, not just same spirit" visual
 * parity bar set for Phase 6.
 *
 * Field names are deliberately NOT a 1:1 rename of legacy's CSS variable names (`--bg` stays
 * `background` here, etc.) to avoid a breaking rename of every existing call site in this same
 * PR — this slice is about getting the *values* right first. A follow-up slice in this same
 * phase introduces real CSS custom properties on `<body>` (matching legacy's own mechanism
 * exactly, including runtime `--accent` mutation for live accent-color swapping without a full
 * React re-render) once the app shell itself exists for those properties to actually theme.
 */
export interface ThemeTokens {
  background: string;
  toolbarBackground: string;
  border: string;
  text: string;
  nodeText: string;
  mutedText: string;
  hintText: string;
  toolbarButtonBg: string;
  hoverBg: string;
  selectedBg: string;
  selectedFg: string;
  multiSelectedBg: string;
  editBg: string;
  canvasBg: string;
  scrollTrack: string;
  vertLine: string;
  connLine: string;
  chip: string;
  dropIndicator: string;
  codeBg: string;
  /** Semantic markup colors -- `[Section]`, `!alert`, `` `code` ``, `(quote)` per-node styling. */
  semSection: string;
  semAlert: string;
  semCode: string;
  semQuote: string;
  /** Preview heading gradient endpoints (H1..H6 interpolate between these two). */
  previewHeading1: string;
  previewHeading2: string;
  /** The six fixed-color options in legacy's per-node text-color toolbar control. */
  fcRed: string;
  fcOrange: string;
  fcGreen: string;
  fcBlue: string;
  fcPurple: string;
  fcGray: string;
}

const LIGHT: ThemeTokens = {
  background: '#f8f8f6',
  toolbarBackground: '#f8f8f6',
  border: '#e3e0d8',
  text: '#3d3929',
  nodeText: '#3d3929',
  mutedText: '#73716b',
  hintText: '#71716b',
  toolbarButtonBg: '#f8f8f6',
  hoverBg: '#f1f0ec',
  selectedBg: '#eae8e2',
  selectedFg: '#2b2a25',
  multiSelectedBg: '#f1f0ec',
  editBg: '#ffffff',
  canvasBg: '#ffffff',
  scrollTrack: '#ccc9bf',
  vertLine: '#999999',
  connLine: '#999999',
  chip: '#eceae4',
  dropIndicator: '#c2553d',
  codeBg: '#ffffff',
  semSection: '#3a52a8',
  semAlert: '#b02020',
  semCode: '#4a3a8a',
  semQuote: '#6b6240',
  previewHeading1: '#2c4a6e',
  previewHeading2: '#4a6f9e',
  fcRed: '#c0392b',
  fcOrange: '#c2701d',
  fcGreen: '#27824f',
  fcBlue: '#2766c2',
  fcPurple: '#7d3fb5',
  fcGray: '#6f6b63'
};

const DARK: ThemeTokens = {
  background: '#121212',
  toolbarBackground: '#181816',
  border: '#2a2a27',
  text: '#eae9e4',
  nodeText: '#eae9e4',
  mutedText: '#9d9a93',
  hintText: '#7d7b75',
  toolbarButtonBg: '#181816',
  hoverBg: '#1d1d1a',
  selectedBg: '#26241f',
  selectedFg: '#f2f0e8',
  multiSelectedBg: '#1d1d1a',
  editBg: '#161614',
  canvasBg: '#161614',
  scrollTrack: '#34322e',
  vertLine: '#57544f',
  connLine: '#57544f',
  chip: '#1d1d1a',
  dropIndicator: '#d97757',
  codeBg: '#161614',
  semSection: '#7b9ef0',
  semAlert: '#d78a80',
  semCode: '#a89bce',
  semQuote: '#b5a87a',
  previewHeading1: '#8fb3d9',
  previewHeading2: '#aac4e0',
  fcRed: '#e08585',
  fcOrange: '#e0a868',
  fcGreen: '#7fd9a6',
  fcBlue: '#82b4f0',
  fcPurple: '#c39bea',
  fcGray: '#a8a59d'
};

export const THEME_TOKENS: Record<Theme, ThemeTokens> = { light: LIGHT, dark: DARK };

/** Legacy's real 7 accent presets (ACCENT_PRESETS in legacy/index.html), each with a distinct
 * light-mode and dark-mode hex so the accent stays legible against either background. */
export type AccentPreset = 'terracotta' | 'teal' | 'indigo' | 'violet' | 'plum' | 'moss' | 'amber';

export const ACCENT_PRESETS: Record<AccentPreset, { light: string; dark: string }> = {
  terracotta: { light: '#c2553d', dark: '#d97757' },
  teal: { light: '#2e8479', dark: '#3caa9b' },
  indigo: { light: '#5173c2', dark: '#8199d3' },
  violet: { light: '#8c4ec2', dark: '#a774d4' },
  plum: { light: '#c04c86', dark: '#d381aa' },
  moss: { light: '#4b842e', dark: '#61ac3c' },
  amber: { light: '#917233', dark: '#bd9442' }
};

/** legacy's real default: `body.theme-light`'s `--accent:#c2553d` is exactly the terracotta
 * preset's light value -- terracotta is the actual fresh-install default, not an arbitrary pick. */
export const DEFAULT_ACCENT: AccentPreset = 'terracotta';

interface ThemeState {
  theme: Theme;
  accentPreset: AccentPreset;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setAccentPreset: (preset: AccentPreset) => void;
  /** The resolved accent hex for the current theme + preset combination -- what a component
   * should actually render, e.g. a selection highlight or an active toolbar button. */
  accentColor: () => string;
}

/**
 * Phase 3's original theming slice, extended in Phase 6.1 with real extracted color values and
 * accent-preset selection. Still deliberately scoped down from legacy's fuller system: no
 * system-preference auto-detection ('system' mode), no persistence across sessions (savePrefs),
 * no Chrome background presets, no node-text-color presets, no accent intensity slider, no CSS
 * custom properties yet (still a plain color-token map consumed via component inline styles,
 * matching the rest of web/'s current styling approach) -- each a real, separately-scoped
 * follow-up within Phase 6.1/6.7, not silently dropped.
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',
  accentPreset: DEFAULT_ACCENT,
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
  setAccentPreset: (preset) => set({ accentPreset: preset }),
  accentColor: () => {
    const { theme, accentPreset } = get();
    return ACCENT_PRESETS[accentPreset][theme];
  }
}));
