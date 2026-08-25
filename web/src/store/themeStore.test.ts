import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useThemeStore, ACCENT_PRESETS, DEFAULT_ACCENT, THEME_TOKENS, CSS_VAR_MAP } from './themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'light', accentPreset: DEFAULT_ACCENT });
    document.body.removeAttribute('style');
    localStorage.clear();
  });

  it('defaults to light', () => {
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('setTheme sets an explicit theme', () => {
    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().theme).toBe('dark');
  });

  it('toggleTheme flips light <-> dark', () => {
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('dark');
    useThemeStore.getState().toggleTheme();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('defaults to the terracotta accent preset', () => {
    expect(useThemeStore.getState().accentPreset).toBe('terracotta');
  });

  it('setAccentPreset sets an explicit preset', () => {
    useThemeStore.getState().setAccentPreset('teal');
    expect(useThemeStore.getState().accentPreset).toBe('teal');
  });

  it('accentColor resolves the preset against the current theme', () => {
    useThemeStore.getState().setAccentPreset('violet');
    expect(useThemeStore.getState().accentColor()).toBe(ACCENT_PRESETS.violet.light);
    useThemeStore.getState().setTheme('dark');
    expect(useThemeStore.getState().accentColor()).toBe(ACCENT_PRESETS.violet.dark);
  });

  it('every accent preset has a distinct light and dark value', () => {
    for (const preset of Object.values(ACCENT_PRESETS)) {
      expect(preset.light).not.toBe(preset.dark);
      expect(preset.light).toMatch(/^#[0-9a-f]{6}$/i);
      expect(preset.dark).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('light and dark token sets have every field populated with a real hex value', () => {
    for (const tokens of [THEME_TOKENS.light, THEME_TOKENS.dark]) {
      for (const [key, value] of Object.entries(tokens)) {
        expect(value, `${key} should be a hex color`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  describe('CSS custom properties on <body> (Phase 6.1)', () => {
    it('init() applies the current theme + accent as real CSS custom properties', () => {
      useThemeStore.getState().init();
      expect(document.body.style.getPropertyValue('--bg')).toBe(THEME_TOKENS.light.background);
      expect(document.body.style.getPropertyValue('--fg')).toBe(THEME_TOKENS.light.text);
      expect(document.body.style.getPropertyValue('--border')).toBe(THEME_TOKENS.light.border);
      expect(document.body.style.getPropertyValue('--accent')).toBe(ACCENT_PRESETS.terracotta.light);
    });

    it('setTheme reapplies every mapped custom property for the new theme', () => {
      useThemeStore.getState().setTheme('dark');
      expect(document.body.style.getPropertyValue('--bg')).toBe(THEME_TOKENS.dark.background);
      expect(document.body.style.getPropertyValue('--fg')).toBe(THEME_TOKENS.dark.text);
      expect(document.body.style.getPropertyValue('--hover')).toBe(THEME_TOKENS.dark.hoverBg);
    });

    it('toggleTheme reapplies every mapped custom property too', () => {
      useThemeStore.getState().toggleTheme();
      expect(document.body.style.getPropertyValue('--bg')).toBe(THEME_TOKENS.dark.background);
      useThemeStore.getState().toggleTheme();
      expect(document.body.style.getPropertyValue('--bg')).toBe(THEME_TOKENS.light.background);
    });

    it('setAccentPreset mutates ONLY --accent, leaving other custom properties untouched', () => {
      useThemeStore.getState().init();
      const bgBefore = document.body.style.getPropertyValue('--bg');
      const borderBefore = document.body.style.getPropertyValue('--border');

      useThemeStore.getState().setAccentPreset('violet');

      expect(document.body.style.getPropertyValue('--accent')).toBe(ACCENT_PRESETS.violet.light);
      // Nothing else moved.
      expect(document.body.style.getPropertyValue('--bg')).toBe(bgBefore);
      expect(document.body.style.getPropertyValue('--border')).toBe(borderBefore);
    });

    it('every real-legacy-equivalent field in CSS_VAR_MAP resolves to a genuine custom property after init()', () => {
      useThemeStore.getState().init();
      for (const [field, varName] of Object.entries(CSS_VAR_MAP) as [keyof typeof THEME_TOKENS.light, string][]) {
        expect(document.body.style.getPropertyValue(varName), `${varName} (from ${field})`).toBe(THEME_TOKENS.light[field]);
      }
    });
  });

  describe('persistence across sessions (§6.7)', () => {
    it('setTheme persists the new theme (and the current accent) to localStorage', () => {
      useThemeStore.getState().setAccentPreset('moss');
      useThemeStore.getState().setTheme('dark');
      const persisted = JSON.parse(localStorage.getItem('sakura_web_theme_prefs_v1')!);
      expect(persisted).toEqual({ theme: 'dark', accentPreset: 'moss' });
    });

    it('toggleTheme persists too', () => {
      useThemeStore.getState().toggleTheme();
      const persisted = JSON.parse(localStorage.getItem('sakura_web_theme_prefs_v1')!);
      expect(persisted.theme).toBe('dark');
    });

    it('setAccentPreset persists the new preset (and the current theme) to localStorage', () => {
      useThemeStore.getState().setTheme('dark');
      useThemeStore.getState().setAccentPreset('indigo');
      const persisted = JSON.parse(localStorage.getItem('sakura_web_theme_prefs_v1')!);
      expect(persisted).toEqual({ theme: 'dark', accentPreset: 'indigo' });
    });

    it('a fresh store load reads back a previously persisted theme/accent', async () => {
      localStorage.setItem('sakura_web_theme_prefs_v1', JSON.stringify({ theme: 'dark', accentPreset: 'plum' }));
      // `vi.resetModules()` + a fresh dynamic import forces the module to re-execute from
      // scratch (including its `create<ThemeState>((set, get) => ({ ...loadThemePrefs(), ... }))`
      // initializer), the same way a real page reload would -- a plain `setState` reset wouldn't
      // exercise `loadThemePrefs()` at all, since that only ever runs once, at module load.
      vi.resetModules();
      const fresh = await import('./themeStore');
      expect(fresh.useThemeStore.getState().theme).toBe('dark');
      expect(fresh.useThemeStore.getState().accentPreset).toBe('plum');
    });

    it('falls back to real defaults for a corrupted persisted value rather than trusting it blindly', async () => {
      localStorage.setItem('sakura_web_theme_prefs_v1', JSON.stringify({ theme: 'not-a-real-theme', accentPreset: 'not-a-real-preset' }));
      vi.resetModules();
      const fresh = await import('./themeStore');
      expect(fresh.useThemeStore.getState().theme).toBe('light');
      expect(fresh.useThemeStore.getState().accentPreset).toBe(DEFAULT_ACCENT);
    });

    it('falls back to real defaults when nothing is persisted at all', async () => {
      vi.resetModules();
      const fresh = await import('./themeStore');
      expect(fresh.useThemeStore.getState().theme).toBe('light');
      expect(fresh.useThemeStore.getState().accentPreset).toBe(DEFAULT_ACCENT);
    });
  });
});
