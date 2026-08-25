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

/**
 * Phase 6.1's promised follow-up (this file's own header above): real CSS custom properties on
 * `<body>`, matching legacy's own mechanism (legacy/index.html:355-356's `body.theme-light`/
 * `body.theme-dark` blocks, `--accent` mutated independently via `applyAccentColor()` at
 * legacy/index.html:18809) rather than a plain color-token map every component re-reads via
 * React state on every render.
 *
 * Only fields with a REAL legacy CSS variable get an entry here -- `toolbarButtonBg`,
 * `multiSelectedBg`, `dropIndicator`, and `codeBg` were values invented in the original
 * design-tokens PR (#129) for specific web/-only UI needs with no 1:1 legacy custom property to
 * match, so inventing CSS var names for them here would violate the "match legacy's own
 * mechanism exactly" goal this slice is actually after. Components using those four fields
 * still read them from `THEME_TOKENS[theme]` directly, same as before this slice.
 */
export const CSS_VAR_MAP: Partial<Record<keyof ThemeTokens, string>> = {
  background: '--bg',
  toolbarBackground: '--tb-bg',
  border: '--border',
  text: '--fg',
  nodeText: '--node-fg',
  mutedText: '--muted',
  hintText: '--hint',
  hoverBg: '--hover',
  selectedBg: '--sel',
  selectedFg: '--sel-fg',
  editBg: '--edit-bg',
  canvasBg: '--canvas-bg',
  scrollTrack: '--scroll',
  vertLine: '--vert',
  connLine: '--conn',
  chip: '--chip',
  semSection: '--sem-section',
  semAlert: '--sem-alert',
  semCode: '--sem-code',
  semQuote: '--sem-quote',
  previewHeading1: '--pv-heading',
  previewHeading2: '--pv-heading-2',
  fcRed: '--fc-red',
  fcOrange: '--fc-orange',
  fcGreen: '--fc-green',
  fcBlue: '--fc-blue',
  fcPurple: '--fc-purple',
  fcGray: '--fc-gray'
};

/** Sets every mapped token from `THEME_TOKENS[theme]` as a real CSS custom property on
 * `document.body`, plus `--accent` from the resolved accent color -- one call handles a full
 * theme swap (`setTheme`/`toggleTheme`) and the initial mount (`useThemeStore.getState().init()`
 * below). A no-op outside a browser (SSR/test environments without `document`), same guard
 * style as documentsStore.ts's own `ls()` helper. */
function applyCssVariables(theme: Theme, accent: string): void {
  if (typeof document === 'undefined') return;
  const tokens = THEME_TOKENS[theme];
  for (const [field, varName] of Object.entries(CSS_VAR_MAP) as [keyof ThemeTokens, string][]) {
    document.body.style.setProperty(varName, tokens[field]);
  }
  document.body.style.setProperty('--accent', accent);
}

/** Mutates ONLY `--accent`, leaving every other custom property untouched -- matches legacy's
 * own separation between a full theme swap (`setTheme`, which reapplies everything) and an
 * accent-preset change (`applyAccentColor`, legacy/index.html:18809, which touches `--accent`
 * alone). This is what makes accent-preset switching "live" without a full React re-render of
 * every themed component: a component reading `var(--accent)` in its own inline style updates
 * purely through CSS cascade the instant this runs, with no React state change involved at all. */
function applyAccentCssVariable(accent: string): void {
  if (typeof document === 'undefined') return;
  document.body.style.setProperty('--accent', accent);
}

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

/** Legacy's own real swatch order and labels (legacy/index.html:4696-4702's `data-accent`/
 * `data-tip` attributes, in DOM order) -- terracotta first (it's the default), the rest
 * alphabetical-ish by legacy's own arbitrary but fixed ordering. Consumed by `App.tsx`'s accent
 * picker so the label text lives next to the color data it describes, not duplicated at the
 * call site. */
export const ACCENT_PRESET_ORDER: AccentPreset[] = ['terracotta', 'teal', 'indigo', 'violet', 'plum', 'moss', 'amber'];

export const ACCENT_PRESET_LABELS: Record<AccentPreset, string> = {
  terracotta: 'Terracotta (default)',
  teal: 'Teal',
  indigo: 'Indigo',
  violet: 'Violet',
  plum: 'Plum',
  moss: 'Moss',
  amber: 'Amber'
};

/** legacy's real default: `body.theme-light`'s `--accent:#c2553d` is exactly the terracotta
 * preset's light value -- terracotta is the actual fresh-install default, not an arbitrary pick. */
export const DEFAULT_ACCENT: AccentPreset = 'terracotta';

// §6.7 slice (docs/phase6-full-parity-plan.md): theme/accent-preset persistence across sessions,
// direct port of legacy's real `savePrefs`/`loadPrefs` persistence of these same two fields
// (legacy's own theme/accentPreset live in its single big prefs blob; this store gets its own
// small key instead, matching documentsStore.ts's own "one key per concern, not one giant blob"
// convention -- see that file's own `ls()`/`readJson`/`writeJson` helpers, replicated here rather
// than shared, since neither store imports from the other).
const _THEME_PREFS_KEY = 'sakura_web_theme_prefs_v1';

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    ls()?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full/unavailable -- same "best effort, don't throw" convention as
    // documentsStore.ts's own writeJson.
  }
}

/** Legacy's real two theme modes (`setThemeMode`'s own whitelist, legacy/index.html:18962-18969)
 * -- 'manual' (Light/Dark switch only) or 'system' (follow `prefers-color-scheme`). Legacy has a
 * leftover comment mentioning a third 'schedule' mode (legacy/index.html:18818, :27032) but its
 * OWN `setThemeMode` whitelist (`['manual','system'].includes(mode)`) proves that mode doesn't
 * actually exist in the real, current code -- a genuine stale-comment/dead-feature mismatch, not
 * a real gap this port needs to fill (same "trust the real code over stale text" call this
 * project has made before, e.g. the branding-default slice). */
export type ThemeMode = 'manual' | 'system';

/** Real `matchMedia` query for the OS/browser dark-mode preference -- module-level singleton (one
 * real `MediaQueryList`, matching legacy's own `_themeMediaQuery`) rather than re-querying on
 * every read. `null` outside a browser (SSR/test environments without `window.matchMedia`). */
const _themeMediaQuery: MediaQueryList | null = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

function naturalSystemTheme(): Theme {
  return _themeMediaQuery?.matches ? 'dark' : 'light';
}

/** Legacy's real `_themeOverrideActive` (legacy/index.html:18816-18822's own comment explains the
 * full mechanic): a plain module-scope flag, not store state, and deliberately never persisted --
 * "a session-only override reset on every fresh load" is the documented, intentional behavior
 * (legacy's own comment: persisting it previously caused system sync to silently stay stuck on a
 * stale theme after every reload). Distinguishes a manual `setTheme` click from a call
 * `applyAutoTheme` itself makes, while `themeMode` is `'system'`: a manual click still applies
 * immediately (nothing blocks it) but starts a *temporary* override that the next natural
 * `prefers-color-scheme` change quietly supersedes -- see `applyAutoTheme` below for the other
 * half. */
let _themeOverrideActive = false;

interface ThemePrefs {
  theme?: unknown;
  accentPreset?: unknown;
  themeMode?: unknown;
}

/** Reads persisted prefs, defensively validating each field against the real set of valid
 * values rather than trusting stored JSON blindly (same "safe to store, safe to render"
 * contract every other imported/persisted shape in this project already gets, e.g.
 * `normalizeDecisionLogCore`) -- a corrupted or hand-edited localStorage value falls back to the
 * real default for that field instead of poisoning the store with a bogus theme/accent/mode. When
 * the persisted mode is `'system'`, the persisted `theme` value itself is ignored in favor of the
 * REAL current system preference -- matching legacy's own real startup restoration call, which
 * is an `isAuto=true` `setTheme` call, not a blind replay of whatever theme was last saved. */
function loadThemePrefs(): { theme: Theme; accentPreset: AccentPreset; themeMode: ThemeMode } {
  const raw = readJson<ThemePrefs>(_THEME_PREFS_KEY, {});
  const themeMode: ThemeMode = raw.themeMode === 'system' ? 'system' : 'manual';
  const accentPreset: AccentPreset =
    typeof raw.accentPreset === 'string' && raw.accentPreset in ACCENT_PRESETS ? (raw.accentPreset as AccentPreset) : DEFAULT_ACCENT;
  const theme: Theme = themeMode === 'system' ? naturalSystemTheme() : raw.theme === 'dark' ? 'dark' : 'light';
  return { theme, accentPreset, themeMode };
}

function saveThemePrefs(theme: Theme, accentPreset: AccentPreset, themeMode: ThemeMode): void {
  writeJson(_THEME_PREFS_KEY, { theme, accentPreset, themeMode });
}

interface ThemeState {
  theme: Theme;
  accentPreset: AccentPreset;
  themeMode: ThemeMode;
  /** Applies the CURRENT theme/accent as real CSS custom properties on `<body>` -- call once on
   * mount (AppShell.tsx's own init effect) so the properties exist before any explicit
   * `setTheme`/`setAccentPreset` call ever happens. Idempotent to call more than once (it just
   * reapplies the same values), unlike documentsStore.ts's `init`, which guards against
   * re-running with a `loaded` flag -- there's no persisted-state restore here to protect
   * against re-running, just a plain reapplication. */
  init: () => void;
  /** `isAuto` distinguishes a manual call (default, e.g. a direct click or `toggleTheme`) from a
   * call `applyAutoTheme` itself makes -- matches legacy's own real `setTheme(theme,isAuto)`
   * exactly (legacy/index.html:18822). A manual call while `themeMode!=='manual'` starts a
   * temporary override (see `_themeOverrideActive`'s own comment above); an auto call never
   * does. Almost every caller should omit `isAuto` -- only `applyAutoTheme` itself passes `true`. */
  setTheme: (theme: Theme, isAuto?: boolean) => void;
  toggleTheme: () => void;
  setAccentPreset: (preset: AccentPreset) => void;
  /** Direct port of legacy's real `setThemeMode` (legacy/index.html:18962-18969): switches
   * between 'manual' and 'system', clearing any active temporary override on a real mode change,
   * then immediately reconciles the theme against the new mode via `applyAutoTheme` (a no-op if
   * the new mode is 'manual'). */
  setThemeMode: (mode: ThemeMode) => void;
  /** Direct port of legacy's real `applyAutoTheme` (legacy/index.html:18954-18959): while
   * `themeMode==='system'`, applies the real current `prefers-color-scheme` value UNLESS a
   * temporary manual override is still active and hasn't yet been caught up to by the natural
   * value. Called from `setThemeMode`, the real `matchMedia` change listener, and a
   * `visibilitychange` listener (below) covering the case where the OS theme changed while this
   * tab was backgrounded or the machine was asleep. A safe no-op in 'manual' mode or outside a
   * browser (no real `MediaQueryList` to read). */
  applyAutoTheme: () => void;
  /** The resolved accent hex for the current theme + preset combination -- what a component
   * should actually render, e.g. a selection highlight or an active toolbar button. */
  accentColor: () => string;
}

/**
 * Phase 3's original theming slice, extended in Phase 6.1 with real extracted color values,
 * accent-preset selection, and real CSS custom properties on `<body>` (see `CSS_VAR_MAP`/
 * `applyCssVariables` above), and in §6.7 with theme/accent-preset persistence across sessions
 * (`loadThemePrefs`/`saveThemePrefs` above), a real accent-swatch picker UI (`App.tsx`'s header
 * actions -- the store's own `setAccentPreset` action existed since Phase 6.1 but had no UI ever
 * calling it until that slice), and now real System auto-theme (`setThemeMode`/`applyAutoTheme`
 * above, a direct port of legacy's own real two-mode `'manual'`/`'system'` system -- legacy has a
 * leftover comment mentioning a third 'schedule' mode that its own `setThemeMode` whitelist
 * proves doesn't actually exist in the real code, so this port doesn't build one either; see
 * `ThemeMode`'s own comment). Still deliberately scoped down from legacy's fuller
 * system: no Chrome background presets, no
 * node-text-color presets, no accent intensity slider, no custom-color picker (`web/`'s own
 * `AccentPreset` type has no `'custom'` variant at all, matching this scope-down) -- each a real,
 * separately-scoped follow-up within §6.7, not silently dropped. The CSS custom
 * properties mechanism itself is only consumed by AppShell.tsx/DocumentTabs.tsx so far (the
 * components built in this same phase) -- every other existing component (OutlineTree.tsx, the
 * Hub panels, etc.) still reads `THEME_TOKENS[theme]` via plain React state, same as before this
 * slice; migrating those is its own separate, much larger follow-up, not attempted here.
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  ...loadThemePrefs(),
  init: () => {
    const { theme, accentColor } = get();
    applyCssVariables(theme, accentColor());
  },
  setTheme: (theme, isAuto = false) => {
    if (!isAuto && get().themeMode !== 'manual') _themeOverrideActive = true;
    set({ theme });
    applyCssVariables(theme, get().accentColor());
    saveThemePrefs(theme, get().accentPreset, get().themeMode);
  },
  toggleTheme: () => {
    const theme = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(theme);
  },
  setAccentPreset: (preset) => {
    set({ accentPreset: preset });
    applyAccentCssVariable(get().accentColor());
    saveThemePrefs(get().theme, preset, get().themeMode);
  },
  setThemeMode: (mode) => {
    const normalized: ThemeMode = mode === 'system' ? 'system' : 'manual';
    if (normalized !== get().themeMode) _themeOverrideActive = false;
    set({ themeMode: normalized });
    saveThemePrefs(get().theme, get().accentPreset, normalized);
    if (normalized !== 'manual') get().applyAutoTheme();
  },
  applyAutoTheme: () => {
    if (get().themeMode !== 'system' || !_themeMediaQuery) return;
    const natural = naturalSystemTheme();
    if (!_themeOverrideActive || natural === get().theme) {
      _themeOverrideActive = false;
      get().setTheme(natural, true);
    }
  },
  accentColor: () => {
    const { theme, accentPreset } = get();
    return ACCENT_PRESETS[accentPreset][theme];
  }
}));

// Applied immediately at module load, not only from AppShell.tsx's own mount effect --
// `useEffect` only runs AFTER React's first commit/paint, which would leave `document.body`
// with no CSS custom properties set (and every `var(--bg)`/`var(--fg)`/etc reference in
// AppShell.tsx/DocumentTabs.tsx falling back to nothing, per the CSS spec for an invalid custom
// property reference) for however long the very first render takes -- a real flash-of-
// unstyled-content risk, not just a cosmetic nicety. Calling `init()` here, synchronously as
// this module is imported, closes that gap before React ever renders anything. AppShell.tsx's
// own effect call is harmless and kept regardless (idempotent -- reapplying the same values).
useThemeStore.getState().init();

// Real `matchMedia` change listener -- fires the instant the OS/browser dark-mode setting
// changes, no polling needed, matching legacy's own real `_onSystemThemeChange` wiring
// (legacy/index.html:27028-27031). Legacy also has an `addListener` fallback for pre-2020
// Safari's older `MediaQueryList` API; skipped here as genuinely dead weight for a modern
// Vite/React SPA target, not a fidelity gap -- no browser capable of running this build lacks
// the standard `addEventListener` form.
_themeMediaQuery?.addEventListener('change', () => useThemeStore.getState().applyAutoTheme());

// A bare change-event listener misses the case where the OS theme flipped WHILE this tab was
// backgrounded or the machine was asleep (no event fires retroactively) -- direct port of
// legacy's own real `visibilitychange` listener covering exactly that gap
// (legacy/index.html:27032-27035).
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) useThemeStore.getState().applyAutoTheme();
  });
}
