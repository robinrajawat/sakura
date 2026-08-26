import { create } from 'zustand';

/**
 * §6.7/§6.10 slice (docs/phase6-full-parity-plan.md): the first real content behind a new
 * Settings panel (`SettingsPanel.tsx`). Originally closed three export-formatting gaps
 * (`treeIndentWidth`/`hideTreeLines`/`outlineNumbering`) that `ExportButtons.tsx` had
 * hardcoded around; a later §6.7 slice added the real "Layout" section from legacy's own
 * Settings panel (legacy/index.html:5693-5698's own summary line, verified against the real
 * code): `compactRows`, `editorScale` ("Text size"), `editorReadingWidthEnabled`/
 * `editorReadingWidth` ("Limit reading width"), and `rowHighlightStyle` ("Row style") --
 * `depthGuideLines` (the fifth Layout item) lives here too but is wired into `OutlineTree.tsx`'s
 * live rendering in a separate slice, alongside `hideTreeLines` gaining that same live-rendering
 * consumer (both fields already existed here for export only).
 *
 * Matches legacy's own real top-level defaults exactly (legacy/index.html:8276-8277's own
 * top-level `let` declarations): `treeIndentWidth=3`, `hideTreeLines=true`,
 * `depthGuideLines=true`, `compactRows=true`, `editorScale=1`,
 * `editorReadingWidthEnabled=false`, `editorReadingWidth=900`, `rowHighlightStyle='original'`.
 *
 * Two corrections to this store's own prior scope-down note, found by actually reading legacy's
 * code rather than trusting the plan doc's original "layout controls" list: "row style" IS a
 * real legacy feature (`rowHighlightStyle`, legacy/index.html:13543 -- just named differently
 * than assumed, controls how the selected row is visually indicated: background fill / a small
 * dot / an inset left bar / a full outline), while "collapse depth" is NOT a real legacy feature
 * under any name (confirmed by grep across the whole file) -- same "trust the real code" pattern
 * as the Chrome-preset and 'schedule'-theme-mode corrections elsewhere in this project. A real
 * legacy Layout setting neither this store nor the plan doc had listed at all,
 * "Limit reading width" (`editorReadingWidthEnabled`/`editorReadingWidth`), is added here too.
 * "Editor's Choice"/"Documentation Mode" presets are NOT part of this slice -- investigated
 * (`applyEditorsChoicePreset`, legacy/index.html:41054+) and found to be a ~40-setting personal
 * snapshot spanning toolbar-group visibility, hover-toolbar, context-menu customization,
 * presenter auto-behaviors, AI thresholds, and more -- most of which `web/` has no settings for
 * at all yet. Marked N/A in the plan doc rather than attempted here, same category of call as
 * the Chrome-preset N/A.
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

export type RowHighlightStyle = 'original' | 'dot' | 'bar' | 'outline';
const ROW_HIGHLIGHT_STYLES: RowHighlightStyle[] = ['original', 'dot', 'bar', 'outline'];

/** Matches legacy's real `NODE_QA_ACTION_ORDER` (legacy/index.html:19377) exactly — both the
 * fixed display order and the full set of valid ids. */
export type QuickInsertActionId = 'emdash' | 'endash' | 'arrow' | 'checkmark' | 'crossmark' | 'middot' | 'date-time';
export const QUICK_INSERT_ACTION_ORDER: QuickInsertActionId[] = ['emdash', 'endash', 'arrow', 'checkmark', 'crossmark', 'middot', 'date-time'];

interface OutlinePrefs {
  treeIndentWidth?: unknown;
  hideTreeLines?: unknown;
  outlineNumbering?: unknown;
  depthGuideLines?: unknown;
  compactRows?: unknown;
  editorScale?: unknown;
  editorReadingWidthEnabled?: unknown;
  editorReadingWidth?: unknown;
  rowHighlightStyle?: unknown;
  alwaysExpandInlineEnabled?: unknown;
  quickInsertEnabled?: unknown;
  quickInsertIconOnly?: unknown;
  quickInsertActions?: unknown;
  quickAssistEnabled?: unknown;
  quickAssistSearchEnabled?: unknown;
  toolbarVisible?: unknown;
  hoverToolbarEnabled?: unknown;
}

interface ResolvedOutlinePrefs {
  treeIndentWidth: number;
  hideTreeLines: boolean;
  outlineNumbering: boolean;
  depthGuideLines: boolean;
  compactRows: boolean;
  editorScale: number;
  editorReadingWidthEnabled: boolean;
  editorReadingWidth: number;
  rowHighlightStyle: RowHighlightStyle;
  /** Document-wide default for whether every node's note/remark/Q&A inline preview shows
   * automatically -- matches legacy's own real `alwaysExpandInlineEnabled` (legacy/index.html:
   * 8277) exactly, including the default (`false`). The per-node `inlineExpandStore.ts` Sets
   * track DEVIATION from this default, not "is expanded" directly -- see that store's own header
   * for why, and `state/inlineExpand.ts`'s `isInlineExpanded` for the XOR that resolves them. */
  alwaysExpandInlineEnabled: boolean;
  /** §6.10 slice (docs/phase6-full-parity-plan.md): matches legacy's real `nodeQuickAssistEnabled`
   * (the master on/off for Quick Insert, legacy/index.html:8277) — default `true`. */
  quickInsertEnabled: boolean;
  /** Matches legacy's real `nqaIconOnly` (index.html:8277) — default `true`, a compact icon row
   * rather than the full label list. `OutlineTree.tsx`'s own pre-existing Quick Insert popup
   * (Phase 6.2) hardcoded the opposite (always full labels, never icon-only) before this slice. */
  quickInsertIconOnly: boolean;
  /** Matches legacy's real `nodeQuickAssistActions` (index.html:8277) — which of
   * `QUICK_INSERT_ACTION_ORDER`'s 7 actions are enabled, and in what order they render (a
   * subsequence of `QUICK_INSERT_ACTION_ORDER`, not an independently-orderable list — matches
   * legacy's own real `NODE_QA_ACTION_ORDER.filter(a=>savedSet.has(a))` reconciliation exactly).
   * Default: all 7. */
  quickInsertActions: QuickInsertActionId[];
  /** §6.10 slice 3 (docs/phase6-full-parity-plan.md): matches legacy's real
   * `featureQuickAssistEnabled` (the master on/off for Quick Assist, legacy/index.html:8277) —
   * default `true`. Same field family as `quickInsertEnabled` above (Quick Insert's own master
   * toggle); kept here rather than a new store since both are outline-editing preferences with
   * the same persistence shape. */
  quickAssistEnabled: boolean;
  /** §6.10 slice 4: matches legacy's real `qaSearchResultsEnabled` (legacy/index.html:8277's
   * `nodes`/`qaItems` block) -- separate from `quickAssistEnabled` above: this only controls
   * whether content-search hits are folded in below command/action matches, not Quick Assist's
   * own on/off. Default `true`, matching legacy's own real default. */
  quickAssistSearchEnabled: boolean;
  /** §7.5 slice (docs/phase7-app-shell-and-dashboard-plan.md): matches legacy's real
   * `toolbarVisible` (legacy/index.html:8276) exactly — default `false`. Legacy's real editor
   * toolbar (`#quick-bar`) renders nothing at all on a first-run profile; a floating reveal
   * button (`#editor-toolbar-toggle`) turns it on. `web/`'s own toolbar was always-on before this
   * slice, matching no real legacy default. */
  toolbarVisible: boolean;
  /** §7.5 slice: matches legacy's real `hoverToolbarEnabled` (legacy/index.html:8276) exactly —
   * default `false`. §6.2's own node-hover-toolbar slice ported the right ACTION set
   * (`hoverToolbarActions`) but never gated whether the rail renders at all, so it rendered
   * unconditionally before this slice -- a real, corrected default, not a feature removal (no
   * Settings toggle exists yet to turn it back on, matching this plan's own explicit call: "this
   * slice should default the rail off in code even without a UI toggle to flip it back on"). */
  hoverToolbarEnabled: boolean;
}

/** Matches legacy's own real `setTreeIndentWidth` clamp (legacy/index.html:18991) exactly:
 * `Math.min(6,Math.max(2,Math.round(...)))`, falling back to the real default (3) for anything
 * that doesn't parse to a finite number. */
function clampTreeIndentWidth(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(6, Math.max(2, n)) : 3;
}

/** Matches legacy's own real `setEditorScale` clamp (legacy/index.html:18971) exactly:
 * `Math.min(1.4,Math.max(0.85,...))`, falling back to the real default (1) for anything that
 * doesn't parse to a finite number. */
function clampEditorScale(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1.4, Math.max(0.85, n)) : 1;
}

/** Matches legacy's own real `setEditorReadingWidth` clamp (legacy/index.html:18984) exactly:
 * `Math.max(600,Math.min(1400,Math.round(...)))`, falling back to the real default (900) for
 * anything that doesn't parse to a finite number. */
function clampEditorReadingWidth(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.max(600, Math.min(1400, n)) : 900;
}

function clampRowHighlightStyle(value: unknown): RowHighlightStyle {
  return ROW_HIGHLIGHT_STYLES.includes(value as RowHighlightStyle) ? (value as RowHighlightStyle) : 'original';
}

/** Matches legacy's real `nodeQuickAssistActions` reconciliation (index.html:13300's own
 * `NODE_QA_ACTION_ORDER.filter(a=>savedSet.has(a))`) — an invalid/unknown saved id is silently
 * dropped rather than erroring, and the real fixed display order always wins over whatever order
 * a corrupt/hand-edited storage blob might hold. */
function clampQuickInsertActions(value: unknown): QuickInsertActionId[] {
  if (!Array.isArray(value)) return [...QUICK_INSERT_ACTION_ORDER];
  const saved = new Set(value);
  return QUICK_INSERT_ACTION_ORDER.filter((a) => saved.has(a));
}

function loadOutlinePrefs(): ResolvedOutlinePrefs {
  const raw = readJson<OutlinePrefs>(_OUTLINE_PREFS_KEY, {});
  return {
    treeIndentWidth: raw.treeIndentWidth === undefined ? 3 : clampTreeIndentWidth(raw.treeIndentWidth),
    hideTreeLines: raw.hideTreeLines === undefined ? true : !!raw.hideTreeLines,
    outlineNumbering: !!raw.outlineNumbering,
    depthGuideLines: raw.depthGuideLines === undefined ? true : !!raw.depthGuideLines,
    compactRows: raw.compactRows === undefined ? true : !!raw.compactRows,
    editorScale: raw.editorScale === undefined ? 1 : clampEditorScale(raw.editorScale),
    editorReadingWidthEnabled: !!raw.editorReadingWidthEnabled,
    editorReadingWidth: raw.editorReadingWidth === undefined ? 900 : clampEditorReadingWidth(raw.editorReadingWidth),
    rowHighlightStyle: clampRowHighlightStyle(raw.rowHighlightStyle),
    alwaysExpandInlineEnabled: !!raw.alwaysExpandInlineEnabled,
    quickInsertEnabled: raw.quickInsertEnabled === undefined ? true : !!raw.quickInsertEnabled,
    quickInsertIconOnly: raw.quickInsertIconOnly === undefined ? true : !!raw.quickInsertIconOnly,
    quickInsertActions: clampQuickInsertActions(raw.quickInsertActions),
    quickAssistEnabled: raw.quickAssistEnabled === undefined ? true : !!raw.quickAssistEnabled,
    quickAssistSearchEnabled: raw.quickAssistSearchEnabled === undefined ? true : !!raw.quickAssistSearchEnabled,
    toolbarVisible: !!raw.toolbarVisible,
    hoverToolbarEnabled: !!raw.hoverToolbarEnabled
  };
}

function saveOutlinePrefs(prefs: ResolvedOutlinePrefs): void {
  writeJson(_OUTLINE_PREFS_KEY, prefs);
}

interface OutlinePrefsState extends ResolvedOutlinePrefs {
  setTreeIndentWidth: (width: number) => void;
  setHideTreeLines: (on: boolean) => void;
  setOutlineNumbering: (on: boolean) => void;
  setDepthGuideLines: (on: boolean) => void;
  setCompactRows: (on: boolean) => void;
  setEditorScale: (scale: number) => void;
  setEditorReadingWidthEnabled: (on: boolean) => void;
  setEditorReadingWidth: (width: number) => void;
  setRowHighlightStyle: (style: RowHighlightStyle) => void;
  setAlwaysExpandInlineEnabled: (on: boolean) => void;
  setQuickInsertEnabled: (on: boolean) => void;
  setQuickInsertIconOnly: (on: boolean) => void;
  /** Flips a single action's membership in `quickInsertActions`, preserving
   * `QUICK_INSERT_ACTION_ORDER`'s fixed order (not insertion order) — matches legacy's real
   * per-checkbox toggle handler exactly (index.html:27555-27560's own `NODE_QA_ACTION_ORDER
   * .filter(x=>set.has(x))` after adding/deleting from a `Set`). */
  setQuickInsertActionEnabled: (id: QuickInsertActionId, enabled: boolean) => void;
  setQuickAssistEnabled: (on: boolean) => void;
  setQuickAssistSearchEnabled: (on: boolean) => void;
  setToolbarVisible: (on: boolean) => void;
  setHoverToolbarEnabled: (on: boolean) => void;
}

export const useOutlinePrefsStore = create<OutlinePrefsState>((set, get) => {
  /** Re-derives the persisted shape from current state and writes it -- every setter below
   * calls this after its own `set()`, so `localStorage` always reflects every field, not just
   * the one that just changed. */
  function persist(): void {
    const s = get();
    saveOutlinePrefs({
      treeIndentWidth: s.treeIndentWidth,
      hideTreeLines: s.hideTreeLines,
      outlineNumbering: s.outlineNumbering,
      depthGuideLines: s.depthGuideLines,
      compactRows: s.compactRows,
      editorScale: s.editorScale,
      editorReadingWidthEnabled: s.editorReadingWidthEnabled,
      editorReadingWidth: s.editorReadingWidth,
      rowHighlightStyle: s.rowHighlightStyle,
      alwaysExpandInlineEnabled: s.alwaysExpandInlineEnabled,
      quickInsertEnabled: s.quickInsertEnabled,
      quickInsertIconOnly: s.quickInsertIconOnly,
      quickInsertActions: s.quickInsertActions,
      quickAssistEnabled: s.quickAssistEnabled,
      quickAssistSearchEnabled: s.quickAssistSearchEnabled,
      toolbarVisible: s.toolbarVisible,
      hoverToolbarEnabled: s.hoverToolbarEnabled
    });
  }

  return {
    ...loadOutlinePrefs(),
    setTreeIndentWidth: (width) => {
      set({ treeIndentWidth: clampTreeIndentWidth(width) });
      persist();
    },
    setHideTreeLines: (on) => {
      set({ hideTreeLines: !!on });
      persist();
    },
    setOutlineNumbering: (on) => {
      set({ outlineNumbering: !!on });
      persist();
    },
    setDepthGuideLines: (on) => {
      set({ depthGuideLines: !!on });
      persist();
    },
    setCompactRows: (on) => {
      set({ compactRows: !!on });
      persist();
    },
    setEditorScale: (scale) => {
      set({ editorScale: clampEditorScale(scale) });
      persist();
    },
    setEditorReadingWidthEnabled: (on) => {
      set({ editorReadingWidthEnabled: !!on });
      persist();
    },
    setEditorReadingWidth: (width) => {
      set({ editorReadingWidth: clampEditorReadingWidth(width) });
      persist();
    },
    setRowHighlightStyle: (style) => {
      set({ rowHighlightStyle: clampRowHighlightStyle(style) });
      persist();
    },
    setAlwaysExpandInlineEnabled: (on) => {
      set({ alwaysExpandInlineEnabled: !!on });
      persist();
    },
    setQuickInsertEnabled: (on) => {
      set({ quickInsertEnabled: !!on });
      persist();
    },
    setQuickInsertIconOnly: (on) => {
      set({ quickInsertIconOnly: !!on });
      persist();
    },
    setQuickInsertActionEnabled: (id, enabled) => {
      const current = new Set(get().quickInsertActions);
      if (enabled) current.add(id);
      else current.delete(id);
      set({ quickInsertActions: QUICK_INSERT_ACTION_ORDER.filter((a) => current.has(a)) });
      persist();
    },
    setQuickAssistEnabled: (on) => {
      set({ quickAssistEnabled: !!on });
      persist();
    },
    setQuickAssistSearchEnabled: (on) => {
      set({ quickAssistSearchEnabled: !!on });
      persist();
    },
    setToolbarVisible: (on) => {
      set({ toolbarVisible: !!on });
      persist();
    },
    setHoverToolbarEnabled: (on) => {
      set({ hoverToolbarEnabled: !!on });
      persist();
    }
  };
});
