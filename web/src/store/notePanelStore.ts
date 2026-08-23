import { create } from 'zustand';

export type NotePanelMode = 'note' | 'code';

/**
 * Phase 6.3 slice (docs/phase6-full-parity-plan.md's "Panels: Note, Code" section), part 1:
 * the shared floating panel's own UI chrome -- open/close, active tab, drag position, maximize
 * -- split out from `outlineStore.ts`'s existing `note`/`codeBlock` fields (added in Phase 3),
 * which stay the actual per-node content and are untouched here. Matches legacy's real
 * single-panel-with-two-tabs shape (`#note-panel`, legacy/index.html:7241) rather than two
 * separate panels: one floating window that switches between a Note body and a Code body via
 * tabs (`#npanel-tab-note`/`#npanel-tab-code`), not legacy's earlier two-window design.
 *
 * Deliberately smaller than legacy's own panel for this first slice: no rich-text editor (note
 * content stays the plain-textarea field `setNote` already writes to -- rich text/images/tables
 * is its own later slice), no backlinks section, no created/modified timestamp badge, no
 * AI rewrite, no resize handle (legacy/index.html:2053's `#code-resize-handle` is real handle-
 * drag height resizing for the code body specifically -- not attempted here). What IS real:
 * open/close, Note<->Code tab switching with legacy's own same-heuristic default tab, drag-to-
 * reposition via the header (legacy/index.html's `setupNotePanelDrag`), and maximize-to-fullscreen
 * (legacy's `.maximized{position:fixed;inset:0}` rule, legacy/index.html:2227).
 */

const PANEL_WIDTH = 420;
const MARGIN = 12;

interface Position {
  left: number;
  top: number;
}

interface NotePanelState {
  open: boolean;
  nodeId: number | null;
  mode: NotePanelMode;
  maximized: boolean;
  /** null until the panel has been opened or dragged at least once -- render falls back to a
   * viewport-centered position (legacy's own "no anchor found" centered state) until then. */
  position: Position | null;

  /** Opens the panel for a given node. If `forcedMode` is omitted, picks Note if the node has
   * note text, else Code if it has code, else Note -- same default-tab heuristic as legacy's
   * own `openNodePanel` (legacy/index.html:33222-33224). Switching to a different node while
   * already open just retargets nodeId -- maximize state carries across, matching legacy. */
  openPanel: (
    nodeId: number,
    hasNoteText: boolean,
    hasCode: boolean,
    forcedMode?: NotePanelMode
  ) => void;
  closePanel: () => void;
  setMode: (mode: NotePanelMode) => void;
  toggleMaximize: () => void;
  /** Live position update during a drag -- clamped so at least a sliver of the header stays
   * on-screen, matching legacy's own drag clamp (legacy/index.html:33429-33430). */
  setPosition: (left: number, top: number) => void;
}

export const useNotePanelStore = create<NotePanelState>((set, get) => ({
  open: false,
  nodeId: null,
  mode: 'note',
  maximized: false,
  position: null,

  openPanel: (nodeId, hasNoteText, hasCode, forcedMode) => {
    const mode = forcedMode ?? (hasNoteText ? 'note' : hasCode ? 'code' : 'note');
    set({ open: true, nodeId, mode });
  },

  closePanel: () => set({ open: false, nodeId: null }),

  setMode: (mode) => set({ mode }),

  toggleMaximize: () => set({ maximized: !get().maximized }),

  setPosition: (left, top) => {
    const width = PANEL_WIDTH;
    const clampedLeft = Math.min(Math.max(left, MARGIN - width + 60), window.innerWidth - MARGIN);
    const clampedTop = Math.min(Math.max(top, 0), window.innerHeight - 24);
    set({ position: { left: clampedLeft, top: clampedTop } });
  }
}));

export const NOTE_PANEL_WIDTH = PANEL_WIDTH;
