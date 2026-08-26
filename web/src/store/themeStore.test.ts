import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { useThemeStore, ACCENT_PRESETS, DEFAULT_ACCENT, THEME_TOKENS, CSS_VAR_MAP, NODE_FONT_COLOR_PRESETS, DEFAULT_NODE_FONT_COLOR } from './themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'light', accentPreset: DEFAULT_ACCENT, themeMode: 'manual', nodeFontColorPreset: DEFAULT_NODE_FONT_COLOR });
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

  describe('title-bar theme-color meta sync (§6.11)', () => {
    let meta: HTMLMetaElement;

    beforeEach(() => {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      meta.setAttribute('content', '#000000');
      document.head.appendChild(meta);
    });

    afterEach(() => {
      meta.remove();
    });

    it('init() syncs <meta name="theme-color"> to the current theme\'s real toolbar background', () => {
      useThemeStore.getState().init();
      expect(meta.getAttribute('content')).toBe(THEME_TOKENS.light.toolbarBackground);
    });

    it('setTheme re-syncs the meta tag to the new theme\'s toolbar background', () => {
      useThemeStore.getState().setTheme('dark');
      expect(meta.getAttribute('content')).toBe(THEME_TOKENS.dark.toolbarBackground);
      useThemeStore.getState().setTheme('light');
      expect(meta.getAttribute('content')).toBe(THEME_TOKENS.light.toolbarBackground);
    });

    it('does nothing (no throw) when the meta tag is missing from the document', () => {
      meta.remove();
      expect(() => useThemeStore.getState().setTheme('dark')).not.toThrow();
    });
  });

  describe('persistence across sessions (§6.7)', () => {
    it('setTheme persists the new theme (and the current accent/mode/node-font-color) to localStorage', () => {
      useThemeStore.getState().setAccentPreset('moss');
      useThemeStore.getState().setTheme('dark');
      const persisted = JSON.parse(localStorage.getItem('sakura_web_theme_prefs_v1')!);
      expect(persisted).toEqual({ theme: 'dark', accentPreset: 'moss', themeMode: 'manual', nodeFontColorPreset: 'default' });
    });

    it('toggleTheme persists too', () => {
      useThemeStore.getState().toggleTheme();
      const persisted = JSON.parse(localStorage.getItem('sakura_web_theme_prefs_v1')!);
      expect(persisted.theme).toBe('dark');
    });

    it('setAccentPreset persists the new preset (and the current theme/mode/node-font-color) to localStorage', () => {
      useThemeStore.getState().setTheme('dark');
      useThemeStore.getState().setAccentPreset('indigo');
      const persisted = JSON.parse(localStorage.getItem('sakura_web_theme_prefs_v1')!);
      expect(persisted).toEqual({ theme: 'dark', accentPreset: 'indigo', themeMode: 'manual', nodeFontColorPreset: 'default' });
    });

    it('setNodeFontColorPreset persists the new preset (and the current theme/mode/accent) to localStorage', () => {
      useThemeStore.getState().setTheme('dark');
      useThemeStore.getState().setNodeFontColorPreset('slate');
      const persisted = JSON.parse(localStorage.getItem('sakura_web_theme_prefs_v1')!);
      expect(persisted).toEqual({ theme: 'dark', accentPreset: DEFAULT_ACCENT, themeMode: 'manual', nodeFontColorPreset: 'slate' });
    });

    it('a fresh store load reads back a previously persisted theme/accent/node-font-color', async () => {
      localStorage.setItem('sakura_web_theme_prefs_v1', JSON.stringify({ theme: 'dark', accentPreset: 'plum', nodeFontColorPreset: 'charcoal' }));
      // `vi.resetModules()` + a fresh dynamic import forces the module to re-execute from
      // scratch (including its `create<ThemeState>((set, get) => ({ ...loadThemePrefs(), ... }))`
      // initializer), the same way a real page reload would -- a plain `setState` reset wouldn't
      // exercise `loadThemePrefs()` at all, since that only ever runs once, at module load.
      vi.resetModules();
      const fresh = await import('./themeStore');
      expect(fresh.useThemeStore.getState().theme).toBe('dark');
      expect(fresh.useThemeStore.getState().accentPreset).toBe('plum');
      expect(fresh.useThemeStore.getState().nodeFontColorPreset).toBe('charcoal');
    });

    it('falls back to real defaults for a corrupted persisted value rather than trusting it blindly', async () => {
      localStorage.setItem(
        'sakura_web_theme_prefs_v1',
        JSON.stringify({ theme: 'not-a-real-theme', accentPreset: 'not-a-real-preset', nodeFontColorPreset: 'not-a-real-node-color' })
      );
      vi.resetModules();
      const fresh = await import('./themeStore');
      expect(fresh.useThemeStore.getState().theme).toBe('light');
      expect(fresh.useThemeStore.getState().accentPreset).toBe(DEFAULT_ACCENT);
      expect(fresh.useThemeStore.getState().nodeFontColorPreset).toBe(DEFAULT_NODE_FONT_COLOR);
    });

    it('falls back to real defaults when nothing is persisted at all', async () => {
      vi.resetModules();
      const fresh = await import('./themeStore');
      expect(fresh.useThemeStore.getState().theme).toBe('light');
      expect(fresh.useThemeStore.getState().accentPreset).toBe(DEFAULT_ACCENT);
      expect(fresh.useThemeStore.getState().themeMode).toBe('manual');
      expect(fresh.useThemeStore.getState().nodeFontColorPreset).toBe(DEFAULT_NODE_FONT_COLOR);
    });
  });

  describe('node-text-color presets (§6.7)', () => {
    it('defaults to the "default" node-font-color preset', () => {
      expect(useThemeStore.getState().nodeFontColorPreset).toBe(DEFAULT_NODE_FONT_COLOR);
    });

    it('setNodeFontColorPreset sets an explicit preset', () => {
      useThemeStore.getState().setNodeFontColorPreset('slate');
      expect(useThemeStore.getState().nodeFontColorPreset).toBe('slate');
    });

    it('nodeFontColor resolves the preset against the current theme', () => {
      useThemeStore.getState().setNodeFontColorPreset('black');
      expect(useThemeStore.getState().nodeFontColor()).toBe(NODE_FONT_COLOR_PRESETS.black.light);
      useThemeStore.getState().setTheme('dark');
      expect(useThemeStore.getState().nodeFontColor()).toBe(NODE_FONT_COLOR_PRESETS.black.dark);
    });

    it('every node-font-color preset has a distinct light and dark value', () => {
      for (const preset of Object.values(NODE_FONT_COLOR_PRESETS)) {
        expect(preset.light).not.toBe(preset.dark);
        expect(preset.light).toMatch(/^#[0-9a-f]{6}$/i);
        expect(preset.dark).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('setNodeFontColorPreset mutates ONLY --node-fg, leaving other custom properties untouched', () => {
      useThemeStore.getState().init();
      const bgBefore = document.body.style.getPropertyValue('--bg');
      const accentBefore = document.body.style.getPropertyValue('--accent');

      useThemeStore.getState().setNodeFontColorPreset('charcoal');

      expect(document.body.style.getPropertyValue('--node-fg')).toBe(NODE_FONT_COLOR_PRESETS.charcoal.light);
      expect(document.body.style.getPropertyValue('--bg')).toBe(bgBefore);
      expect(document.body.style.getPropertyValue('--accent')).toBe(accentBefore);
    });

    it('a non-default node-font-color preset survives a theme swap instead of being reset to that theme\'s own default', () => {
      useThemeStore.getState().setNodeFontColorPreset('slate');
      useThemeStore.getState().setTheme('dark');
      expect(document.body.style.getPropertyValue('--node-fg')).toBe(NODE_FONT_COLOR_PRESETS.slate.dark);
    });
  });

  describe('System auto-theme (§6.7)', () => {
    /** A controllable fake `MediaQueryList` for `(prefers-color-scheme: dark)` -- jsdom (this
     * project's test environment) has no real `matchMedia` at all (`typeof matchMedia` is
     * `undefined` here), so every one of these tests mocks it, then does a `vi.resetModules()` +
     * fresh dynamic import of `themeStore.ts` so the module's own `_themeMediaQuery` constant
     * (captured once, at module load) picks up the mock -- same "force a real re-execution"
     * pattern the persistence tests above already use, for the same reason (module-load-time
     * state can't be exercised by a plain `setState` reset). `setMatches` both updates `.matches`
     * AND fires every registered 'change' listener, simulating a real OS-level preference flip. */
    function mockMatchMedia(initialMatches: boolean) {
      let matches = initialMatches;
      const listeners: (() => void)[] = [];
      const mql = {
        get matches() {
          return matches;
        },
        addEventListener: (_type: string, cb: () => void) => {
          listeners.push(cb);
        },
        removeEventListener: () => {}
      };
      vi.stubGlobal('matchMedia', () => mql);
      return {
        setMatches: (next: boolean) => {
          matches = next;
          listeners.forEach((cb) => cb());
        },
        /** Changes the underlying value WITHOUT firing any 'change' listener -- simulates an OS
         * preference flip that happened while this tab was backgrounded/asleep, which a real
         * `matchMedia` change event would never have delivered retroactively. Used by the
         * `visibilitychange` test below to prove THAT listener (not the 'change' one) is what
         * catches this case up. */
        setMatchesSilently: (next: boolean) => {
          matches = next;
        }
      };
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('setThemeMode("system") immediately applies the real current system preference', async () => {
      mockMatchMedia(true); // OS is in dark mode
      vi.resetModules();
      const fresh = await import('./themeStore');
      fresh.useThemeStore.getState().setThemeMode('system');
      expect(fresh.useThemeStore.getState().theme).toBe('dark');
    });

    it('a real matchMedia "change" event live-updates the theme while in system mode', async () => {
      const mm = mockMatchMedia(false); // OS starts in light mode
      vi.resetModules();
      const fresh = await import('./themeStore');
      fresh.useThemeStore.getState().setThemeMode('system');
      expect(fresh.useThemeStore.getState().theme).toBe('light');

      mm.setMatches(true); // OS flips to dark
      expect(fresh.useThemeStore.getState().theme).toBe('dark');
    });

    it('a manual theme click while in system mode starts a temporary override the next matching change event does not disturb', async () => {
      const mm = mockMatchMedia(true); // OS is dark
      vi.resetModules();
      const fresh = await import('./themeStore');
      fresh.useThemeStore.getState().setThemeMode('system');
      expect(fresh.useThemeStore.getState().theme).toBe('dark');

      fresh.useThemeStore.getState().setTheme('light'); // manual override, still system mode
      expect(fresh.useThemeStore.getState().theme).toBe('light');

      // A redundant change event where the natural value hasn't actually changed (still dark,
      // disagreeing with the override) must NOT clobber the manual choice.
      mm.setMatches(true);
      expect(fresh.useThemeStore.getState().theme).toBe('light');
    });

    it('the override clears once the natural value catches up to agree with it, resuming normal auto governance', async () => {
      const mm = mockMatchMedia(true); // OS is dark
      vi.resetModules();
      const fresh = await import('./themeStore');
      fresh.useThemeStore.getState().setThemeMode('system');
      fresh.useThemeStore.getState().setTheme('light'); // override: light, while natural is dark

      mm.setMatches(false); // OS catches up to light -- agrees with the override, clearing it
      expect(fresh.useThemeStore.getState().theme).toBe('light');

      // Now that the override is cleared, a further real change should resume auto-following.
      mm.setMatches(true);
      expect(fresh.useThemeStore.getState().theme).toBe('dark');
    });

    it('setThemeMode("manual") stops auto-following further changes', async () => {
      const mm = mockMatchMedia(true); // OS is dark
      vi.resetModules();
      const fresh = await import('./themeStore');
      fresh.useThemeStore.getState().setThemeMode('system');
      fresh.useThemeStore.getState().setThemeMode('manual');

      mm.setMatches(false); // OS flips to light -- should be ignored entirely in manual mode
      expect(fresh.useThemeStore.getState().theme).toBe('dark');
    });

    it('a visibilitychange event (tab foregrounded) re-syncs to a system preference change the "change" event alone missed', async () => {
      const mm = mockMatchMedia(true); // OS starts dark
      vi.resetModules();
      const fresh = await import('./themeStore');
      fresh.useThemeStore.getState().setThemeMode('system');
      expect(fresh.useThemeStore.getState().theme).toBe('dark');

      // Flip the OS preference WITHOUT firing the mocked 'change' listener, then foreground the
      // tab -- only the visibilitychange listener should catch this up.
      mm.setMatchesSilently(false);
      expect(fresh.useThemeStore.getState().theme).toBe('dark'); // unchanged so far -- proves the flip alone did nothing
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(fresh.useThemeStore.getState().theme).toBe('light');
    });
  });
});
