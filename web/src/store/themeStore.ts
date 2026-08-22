import { create } from 'zustand';

export type Theme = 'light' | 'dark';

export interface ThemeTokens {
  background: string;
  border: string;
  text: string;
  mutedText: string;
  toolbarButtonBg: string;
  selectedBg: string;
  multiSelectedBg: string;
  dropIndicator: string;
  codeBg: string;
}

const LIGHT: ThemeTokens = {
  background: '#ffffff',
  border: '#dddddd',
  text: '#1a1a1a',
  mutedText: '#888888',
  toolbarButtonBg: '#ffffff',
  selectedBg: '#e8f0fe',
  multiSelectedBg: '#eef3fd',
  dropIndicator: '#4285f4',
  codeBg: '#f6f6f6'
};

const DARK: ThemeTokens = {
  background: '#1e1e1e',
  border: '#3a3a3a',
  text: '#e8e8e8',
  mutedText: '#999999',
  toolbarButtonBg: '#2a2a2a',
  selectedBg: '#2d3a52',
  multiSelectedBg: '#28324a',
  dropIndicator: '#6ea3ff',
  codeBg: '#262626'
};

export const THEME_TOKENS: Record<Theme, ThemeTokens> = { light: LIGHT, dark: DARK };

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

/**
 * Phase 3 theming slice (docs/framework-migration-plan.md) -- deliberately scoped down from
 * legacy's fuller theme system: no system-preference auto-detection ('system' mode), no
 * persistence across sessions (savePrefs), no accent-color/chrome-color customization. Just a
 * light/dark toggle over a small color-token map, consumed directly by component inline styles
 * rather than CSS custom properties -- this matches the rest of web/'s current styling approach
 * (plain inline styles, no stylesheet yet) rather than introducing a second styling mechanism
 * for this one feature.
 */
export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' })
}));
