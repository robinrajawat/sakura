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
 */
const _PAD_OPEN_KEY = 'sakura_web_pad_open';

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

interface PadVisibilityState {
  padVisible: boolean;
  setPadVisible: (on: boolean) => void;
  togglePadVisible: () => void;
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
  }
}));
