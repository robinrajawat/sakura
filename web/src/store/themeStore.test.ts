import { describe, expect, it, beforeEach } from 'vitest';
import { useThemeStore, ACCENT_PRESETS, DEFAULT_ACCENT, THEME_TOKENS } from './themeStore';

describe('themeStore', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'light', accentPreset: DEFAULT_ACCENT });
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
});
