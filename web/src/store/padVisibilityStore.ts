import { create } from 'zustand';

/**
 * §8.17 (docs/phase8-design-system-parity-plan.md): matches legacy's real `padOpen`
 * (legacy/index.html:8276) exactly -- default `false` (legacy's own static markup even ships
 * `#pad-panel` with a `pad-hidden` class already on it, legacy/index.html:6598), persisted
 * separately from the rest of the editor prefs blob under its own real key
 * (`PAD_OPEN_KEY='sakura_pad_open'`, legacy/index.html:40283-40284) -- kept as its own tiny store
 * here rather than folded into `outlinePrefsStore.ts` for the same reason legacy keeps it a
 * separate `localStorage` entry: it's transient UI chrome, not a document-editing preference.
 * `App.tsx`'s own `<PadPanel />` used to render unconditionally, matching no real legacy default
 * -- a floating `#editor-pad-toggle`-equivalent button now gates it, same convention
 * `toolbarVisible`/`#editor-toolbar-toggle` already established.
 *
 * §8.19 slice: `padWidth`/`setPadWidth`/`commitPadWidth`, matching legacy's real docked-panel
 * resize mechanics -- `padWidth` itself (legacy/index.html:8276, default 440), its own real
 * clamp range (`Math.max(220,Math.min(640,...))`, legacy/index.html:40285/41599), and its own
 * separate persistence key (`PAD_WIDTH_KEY='sakura_pad_width_v1'`, legacy/index.html:40283).
 * Mirrors sidebarStore.ts's own `setWidth`/`commitWidth` split exactly: `setWidth` is the live,
 * unpersisted update called on every drag-move frame (matching legacy's own `applyPadWidth`,
 * called from `mousemove`); `commitWidth` persists the current value once, on drag-end (matching
 * legacy's own `savePadWidth`, called only from `mouseup`).
 */
const _PAD_OPEN_KEY = 'sakura_web_pad_open';
const _PAD_WIDTH_KEY = 'sakura_web_pad_width_v1';

export const PAD_MIN_WIDTH = 220;
export const PAD_MAX_WIDTH = 640;
const DEFAULT_PAD_WIDTH = 440;

function clampPadWidth(w: number): number {
  return Math.max(PAD_MIN_WIDTH, Math.min(PAD_MAX_WIDTH, w));
}

function readPadOpen(): boolean {
  try {
    return localStorage.getItem(_PAD_OPEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function writePadOpen(value: boolean): void {
  try {
    localStorage.setItem(_PAD_OPEN_KEY, String(value));
  } catch {
    // Storage full/unavailable -- best effort, same convention as outlinePrefsStore.ts.
  }
}

function readPadWidth(): number {
  try {
    const raw = localStorage.getItem(_PAD_WIDTH_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return clampPadWidth(n);
    }
  } catch {
    // Storage unavailable -- keep the default, same "best effort" convention as above.
  }
  return DEFAULT_PAD_WIDTH;
}

function writePadWidth(value: number): void {
  try {
    localStorage.setItem(_PAD_WIDTH_KEY, String(value));
  } catch {
    // Best effort, same convention as writePadOpen.
  }
}

interface PadVisibilityState {
  padVisible: boolean;
  setPadVisible: (on: boolean) => void;
  togglePadVisible: () => void;
  padWidth: number;
  /** Live width update during a drag -- no persistence, matching legacy's own `applyPadWidth`
   * (called on every mousemove frame; persisting there would hammer localStorage dozens of
   * times per drag for no benefit). */
  setPadWidth: (w: number) => void;
  /** Persists the CURRENT width -- call once, on drag-end, matching legacy's own
   * `savePadWidth` (called only from the `mouseup` handler). */
  commitPadWidth: () => void;
}

export const usePadVisibilityStore = create<PadVisibilityState>((set, get) => ({
  padVisible: readPadOpen(),
  setPadVisible: (on) => {
    writePadOpen(on);
    set({ padVisible: on });
  },
  togglePadVisible: () => {
    const next = !get().padVisible;
    writePadOpen(next);
    set({ padVisible: next });
  },
  padWidth: readPadWidth(),
  setPadWidth: (w) => {
    set({ padWidth: clampPadWidth(w) });
  },
  commitPadWidth: () => {
    writePadWidth(get().padWidth);
  }
}));
