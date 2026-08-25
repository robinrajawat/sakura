import { create } from 'zustand';

/**
 * §6.7/§6.10 slice (docs/phase6-full-parity-plan.md): the first real content behind a new
 * Settings panel (`SettingsPanel.tsx`). Closes three gaps `ExportButtons.tsx` already
 * documented and hardcoded around: `TREE_INDENT_WIDTH`/`HIDE_TREE_LINES`/`OUTLINE_NUMBERING`
 * were fixed constants there specifically because "web/ has no settings panel for either yet"
 * (that file's own header comment) -- this store is that settings panel's first real backing
 * state, and `ExportButtons.tsx` is updated in the same slice to read from it instead of the
 * hardcoded values.
 *
 * Matches legacy's own real top-level defaults exactly: `treeIndentWidth=3`,
 * `hideTreeLines=true`, `outlineNumbering=false` (legacy/index.html's own top-level `let`
 * declarations). `treeIndentWidth`'s real valid range (legacy's own `setTreeIndentWidth`,
 * legacy/index.html:18991) is a clamped integer 2-6 -- not a raw pixel value, and not
 * `web/`'s own live-editor row indent (`OutlineTree.tsx`'s hardcoded `depth * 24`px, a
 * completely different, CSS-based rendering approach with no ASCII-connector concept at all --
 * porting THAT to be configurable is a separate, unrelated follow-up, not attempted here).
 * This `treeIndentWidth` only feeds the ASCII-tree-connector math already parameterized on it
 * (`core/nodeQueries.ts`'s `buildPrefix`/`buildVertFlags`, used by the plain-text/clipboard/rich
 * export serializers) -- exactly the same axis legacy's own `treeIndentWidth` controls.
 *
 * Deliberately scoped down from legacy's fuller "Appearance"/"Presets & modes" settings
 * categories (row style, compact rows, text size, collapse depth, Editor's Choice/Documentation
 * Mode presets, inline note/remark/Q&A previews): those each need real new rendering
 * infrastructure in `OutlineTree.tsx` that doesn't exist yet (confirmed by grep -- no tree-line/
 * depth-guide/row-density/text-size mechanism anywhere in that file currently), not just a
 * preference toggle for an existing behavior. This slice only wires up the three prefs that
 * already have a real, existing consumer.
 */
const _OUTLINE_PREFS_KEY = 'sakura_web_outline_prefs_v1';

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

interface OutlinePrefs {
  treeIndentWidth?: unknown;
  hideTreeLines?: unknown;
  outlineNumbering?: unknown;
}

interface ResolvedOutlinePrefs {
  treeIndentWidth: number;
  hideTreeLines: boolean;
  outlineNumbering: boolean;
}

/** Matches legacy's own real `setTreeIndentWidth` clamp (legacy/index.html:18991) exactly:
 * `Math.min(6,Math.max(2,Math.round(...)))`, falling back to the real default (3) for anything
 * that doesn't parse to a finite number. */
function clampTreeIndentWidth(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(6, Math.max(2, n)) : 3;
}

function loadOutlinePrefs(): ResolvedOutlinePrefs {
  const raw = readJson<OutlinePrefs>(_OUTLINE_PREFS_KEY, {});
  return {
    treeIndentWidth: raw.treeIndentWidth === undefined ? 3 : clampTreeIndentWidth(raw.treeIndentWidth),
    hideTreeLines: raw.hideTreeLines === undefined ? true : !!raw.hideTreeLines,
    outlineNumbering: !!raw.outlineNumbering
  };
}

function saveOutlinePrefs(prefs: ResolvedOutlinePrefs): void {
  writeJson(_OUTLINE_PREFS_KEY, prefs);
}

interface OutlinePrefsState extends ResolvedOutlinePrefs {
  setTreeIndentWidth: (width: number) => void;
  setHideTreeLines: (on: boolean) => void;
  setOutlineNumbering: (on: boolean) => void;
}

export const useOutlinePrefsStore = create<OutlinePrefsState>((set, get) => ({
  ...loadOutlinePrefs(),
  setTreeIndentWidth: (width) => {
    const treeIndentWidth = clampTreeIndentWidth(width);
    set({ treeIndentWidth });
    saveOutlinePrefs({ treeIndentWidth, hideTreeLines: get().hideTreeLines, outlineNumbering: get().outlineNumbering });
  },
  setHideTreeLines: (on) => {
    const hideTreeLines = !!on;
    set({ hideTreeLines });
    saveOutlinePrefs({ treeIndentWidth: get().treeIndentWidth, hideTreeLines, outlineNumbering: get().outlineNumbering });
  },
  setOutlineNumbering: (on) => {
    const outlineNumbering = !!on;
    set({ outlineNumbering });
    saveOutlinePrefs({ treeIndentWidth: get().treeIndentWidth, hideTreeLines: get().hideTreeLines, outlineNumbering });
  }
}));
