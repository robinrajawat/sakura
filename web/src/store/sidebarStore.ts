import { create } from 'zustand';

/**
 * Phase 6.1 slice (docs/phase6-full-parity-plan.md's 6.1 section): sidebar resize/collapse, one
 * of the named remaining gaps. Matches legacy's own real numbers, not approximated:
 * default/min/max width (234/180/480, legacy/index.html:29828-29830's `SB_WIDTH_KEY` init and
 * the `Math.max(180,Math.min(480,...))` clamp used both on load and on every resize-drag frame)
 * and the default-open state (legacy/index.html:29831's `let sidebarOpen = true`).
 *
 * Deliberately smaller than legacy's own sidebar-visibility system: no zen-mode auto-hide (`web/`
 * has no zen mode), no separate floating "reopen" button (legacy needs one because its own
 * toggle button lives near/inside the sidebar itself, which is unreachable once collapsed to
 * width 0 -- `web/`'s toggle lives in AppShell's header bar instead, via `headerActions` in
 * App.tsx, which never collapses, so one button suffices for both directions).
 */
const _WIDTH_KEY = 'sakura_web_sidebar_width_v1';
const _OPEN_KEY = 'sakura_web_sidebar_open_v1';

export const SIDEBAR_MIN_WIDTH = 180;
export const SIDEBAR_MAX_WIDTH = 480;
const DEFAULT_WIDTH = 234;

function clampWidth(w: number): number {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, w));
}

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

interface SidebarState {
  width: number;
  open: boolean;
  loaded: boolean;
  init: () => void;
  /** Live width update during a drag -- no persistence, matching legacy's own
   * `applySidebarWidth` (called on every mousemove frame; persisting there would hammer
   * localStorage dozens of times per drag for no benefit). */
  setWidth: (w: number) => void;
  /** Persists the CURRENT width -- call once, on drag-end, matching legacy's own
   * `saveSidebarWidth` (called only from the `mouseup` handler). */
  commitWidth: () => void;
  toggleOpen: () => void;
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  width: DEFAULT_WIDTH,
  open: true,
  loaded: false,

  init: () => {
    if (get().loaded) return;
    let width = DEFAULT_WIDTH;
    try {
      const raw = ls()?.getItem(_WIDTH_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) width = clampWidth(n);
      }
    } catch {
      // Storage unavailable -- keep the default, same "best effort" convention as
      // documentsStore.ts's own readJson.
    }
    let open = true;
    try {
      const raw = ls()?.getItem(_OPEN_KEY);
      if (raw !== null && raw !== undefined) open = raw !== 'false';
    } catch {
      // Same best-effort fallback as above.
    }
    set({ width, open, loaded: true });
  },

  setWidth: (w) => {
    set({ width: clampWidth(w) });
  },

  commitWidth: () => {
    try {
      ls()?.setItem(_WIDTH_KEY, String(get().width));
    } catch {
      // Best effort, same convention as documentsStore.ts's writeJson.
    }
  },

  toggleOpen: () => {
    const open = !get().open;
    set({ open });
    try {
      ls()?.setItem(_OPEN_KEY, String(open));
    } catch {
      // Best effort, same convention as documentsStore.ts's writeJson.
    }
  }
}));
