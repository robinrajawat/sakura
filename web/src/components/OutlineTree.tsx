import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import { useOutlineStore, type NodeStyles, type OutlineNode } from '../store/outlineStore';
import type { DropMode } from '../core/nodeMutations';
import { countDescendants, getCheckboxChildStats } from '../core/nodeQueries';
import { formatNow } from '../utils/formatNow';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useNotePanelStore } from '../store/notePanelStore';
import { stripHtmlToText } from '../utils/stripHtmlToText';
import { findNodeByText } from '../core/backlinks';
import { NodeText } from './NodeText';

function sortButtonStyle(t: (typeof THEME_TOKENS)['light']): CSSProperties {
  return {
    fontFamily: 'inherit',
    fontSize: 12,
    padding: '2px 8px',
    border: `1px solid ${t.border}`,
    borderRadius: 4,
    background: t.toolbarButtonBg,
    color: t.text,
    cursor: 'pointer'
  };
}

// Approximate size scale for heading levels 1 (largest) through 6 (smallest) -- a reasonable,
// honest approximation, not a pixel-exact match of legacy's own `.style-heading-N` CSS rules
// (which this project hasn't extracted/ported); getting the FUNCTIONAL behavior right (toggle,
// persistence, undo, auto-convert, multi-select semantics) matters more for this slice than
// exact sizing, same "honest first pass" scoping this project uses elsewhere.
const HEADING_FONT_SIZES: Record<number, string> = { 1: '1.5em', 2: '1.35em', 3: '1.2em', 4: '1.1em', 5: '1.05em', 6: '1em' };

/** Composes a node's label style from its `styles` object plus the pre-existing checkbox-done
 * strikethrough -- matches legacy's own real composition (legacy/index.html:20294's own
 * `stCls`/heading-class list applied to the whole `.node-label`, not per text-segment), just as
 * inline CSSProperties instead of class names since this component already styles everything
 * that way. Underline and strike are independent and can combine (`text-decoration` accepts
 * multiple space-separated values) -- a checkbox-done strike and an explicit `styles.strike`
 * both resolve to the same single `line-through` value, not doubled. */
function composeNodeLabelStyle(node: Pick<OutlineNode, 'styles' | 'isCheckbox' | 'checked'>): CSSProperties {
  const s: NodeStyles = node.styles;
  const decorations = [s.underline ? 'underline' : '', s.strike || (node.isCheckbox && node.checked) ? 'line-through' : '']
    .filter(Boolean)
    .join(' ');
  return {
    fontWeight: s.bold || s.heading > 0 ? 700 : 400,
    fontStyle: s.italic ? 'italic' : 'normal',
    textDecoration: decorations || 'none',
    fontSize: s.heading > 0 ? HEADING_FONT_SIZES[s.heading] : undefined
  };
}

/**
 * Phase 2 complete (docs/framework-migration-plan.md); Phase 3: Note, Code block, PWA install,
 * and theming. Reads color tokens from themeStore.ts, applied via plain inline styles, matching
 * the rest of this component's existing styling approach rather than introducing CSS custom
 * properties for just this one feature (that comes in a later Phase 6.1 slice, once the app
 * shell exists for real CSS custom properties to actually theme). Phase 6.1 (docs/phase6-full-
 * parity-plan.md, "Design tokens & app shell") replaced themeStore.ts's placeholder color
 * values with real ones extracted from legacy/index.html's own CSS -- the drag/drop-indicator
 * blue below now reads `t.dropIndicator` (the real accent color) instead of a hardcoded
 * '#4285f4' that never matched legacy's actual palette. Not every color in this file is
 * tokenized yet (e.g. error/warning colors from semantic markup) -- those read fine on both
 * themes for now and are a real, separately-scoped follow-up if that stops being true.
 */
export function OutlineTree() {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const t = THEME_TOKENS[theme];
  const nodes = useOutlineStore((s) => s.nodes);
  const selectedId = useOutlineStore((s) => s.selectedId);
  const editingId = useOutlineStore((s) => s.editingId);
  const collapsedIds = useOutlineStore((s) => s.collapsedIds);
  const multiSelectedIds = useOutlineStore((s) => s.multiSelectedIds);
  const clickNode = useOutlineStore((s) => s.clickNode);
  const selectionRootIndexes = useOutlineStore((s) => s.selectionRootIndexes);
  const indentSelected = useOutlineStore((s) => s.indentSelected);
  const outdentSelected = useOutlineStore((s) => s.outdentSelected);
  const moveNode = useOutlineStore((s) => s.moveNode);
  const visibleIndexes = useOutlineStore((s) => s.visibleIndexes);
  const nodeHasChildrenFn = useOutlineStore((s) => s.nodeHasChildren);
  const startEditing = useOutlineStore((s) => s.startEditing);
  const commitEdit = useOutlineStore((s) => s.commitEdit);
  const cancelEdit = useOutlineStore((s) => s.cancelEdit);
  const newSiblingBelow = useOutlineStore((s) => s.newSiblingBelow);
  const newSiblingAbove = useOutlineStore((s) => s.newSiblingAbove);
  const newChild = useOutlineStore((s) => s.newChild);
  const splitAtCursor = useOutlineStore((s) => s.splitAtCursor);
  const deleteNode = useOutlineStore((s) => s.deleteNode);
  const selectNode = useOutlineStore((s) => s.selectNode);
  const duplicateSelected = useOutlineStore((s) => s.duplicateSelected);
  const moveSelected = useOutlineStore((s) => s.moveSelected);
  const deleteSelected = useOutlineStore((s) => s.deleteSelected);
  const toggleCollapse = useOutlineStore((s) => s.toggleCollapse);
  const sortChildren = useOutlineStore((s) => s.sortChildren);
  const toggleCheckbox = useOutlineStore((s) => s.toggleCheckbox);
  const toggleTag = useOutlineStore((s) => s.toggleTag);
  const activeTagFilter = useOutlineStore((s) => s.activeTagFilter);
  const setTagFilter = useOutlineStore((s) => s.setTagFilter);
  const focusedId = useOutlineStore((s) => s.focusedId);
  const zoomIntoNode = useOutlineStore((s) => s.zoomIntoNode);
  const exitFocus = useOutlineStore((s) => s.exitFocus);
  const focusPath = useOutlineStore((s) => s.focusPath);
  const undo = useOutlineStore((s) => s.undo);
  const redo = useOutlineStore((s) => s.redo);
  const toggleNodeStyle = useOutlineStore((s) => s.toggleNodeStyle);
  const openNotePanel = useNotePanelStore((s) => s.openPanel);
  const [editingTagsId, setEditingTagsId] = useState<number | null>(null);
  // Phase 6.2 node hover toolbar. Tracks only the CURRENTLY-hovered row's id, matching legacy's
  // own default hoverToolbarActions=['child','above','below'] -- the fuller, user-configurable
  // action set (duplicate/focus/up/down/fold/tags/delete/etc, legacy's own CTX_ACTION_ORDER) is
  // shared with the right-click context menu and out of scope for this specific slice; see this
  // component's own header for the fuller list of what's deferred and why.
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  // Phase 6.2 Quick Insert (Ctrl/Cmd+Space while editing a node's text) -- the last remaining
  // 6.2 item. Non-null while the menu is open, holding which node's <input> it's targeting
  // (always the currently-editing one, since Quick Insert only opens mid-edit) so a click on a
  // menu item knows where to insert without needing editingId to still be readable by then.
  const [quickInsertNodeId, setQuickInsertNodeId] = useState<number | null>(null);
  const quickInsertRef = useRef<HTMLDivElement>(null);
  // Phase 6.4 `@`-mention autocomplete (docs/phase6-full-parity-plan.md -- the wikilink
  // rendering/click-navigate half of this phase landed in #160; this is the "insert a reference
  // while editing" half legacy calls _atState/openAtSuggest/renderAtSuggest/commitAtSuggest,
  // legacy/index.html:20185-20289/26956-26959). `atPos` is the index of the triggering `@` in
  // the input's own value; `query` is everything typed between `@` and the cursor since, kept in
  // sync on every keystroke via handleAtInput below (mirrors legacy's own handleAtInput). Unlike
  // legacy's contentEditable-div caret-rect positioning (getCaretClientRectGeneric), this popup
  // anchors below the whole <input> rather than tracking the live caret pixel position -- the
  // same honest simplification Quick Insert's own popup already makes for this same uncontrolled
  // <input>, not a gap specific to this slice.
  const [atSuggest, setAtSuggest] = useState<{ nodeId: number; atPos: number; query: string; activeIdx: number } | null>(
    null
  );
  const atSuggestRef = useRef<HTMLDivElement>(null);
  // Phase 6.2 right-click context menu. Matches legacy's own real showContextMenu/
  // hideContextMenu (legacy/index.html:19495-19502) in spirit -- a menu anchored near the
  // click point, one node selected at a time -- but as a single flat action list rather than
  // legacy's own top-row-plus-collapsible-"More"-panel split (a space-saving refinement for a
  // ~20-action registry legacy's own CTX_ACTION_ORDER has; this component's action list is
  // deliberately much shorter, see the menu's own render comment below for exactly what's
  // included and what's deferred).
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [draggedIds, setDraggedIds] = useState<number[] | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: number; mode: DropMode } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus();
  }, [editingId]);

  // Closes any open @-mention popup the moment editing ends (commit, cancel, or a click that
  // blurs the input) so it can't linger into the next edit session on a different node -- same
  // reasoning as the `editingId` guard already used elsewhere in this file (e.g. handleTreeKeyDown
  // above). Deliberately not tied to a document-level click-outside listener the way the context
  // menu and Quick Insert popups are: this popup already closes itself on every keystroke that
  // moves the cursor away from the `@…` span (see handleAtInput below), and a genuine outside
  // click blurs the <input> first, which lands here via editingId going null.
  useEffect(() => {
    if (editingId === null) setAtSuggest(null);
  }, [editingId]);

  useEffect(() => {
    if (!contextMenu) return;
    function onClickOutside(e: MouseEvent): void {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    function onEscape(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') setContextMenu(null);
    }
    // Same pattern as DocumentTabs.tsx's own tab-switcher dropdown click-outside handling --
    // a document-level listener only while the menu is actually open, torn down on close.
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (quickInsertNodeId === null) return;
    function onClickOutside(e: MouseEvent): void {
      if (quickInsertRef.current && !quickInsertRef.current.contains(e.target as Node)) {
        setQuickInsertNodeId(null);
      }
    }
    // Escape is handled inside the menu's own onKeyDown (it needs to stay focus-trapped within
    // the menu's search-free item list, unlike the context menu's document-level Escape, since
    // this menu can be reopened by the SAME keystroke combo, Ctrl/Cmd+Space, that the input's
    // own onKeyDown also watches for -- keeping Escape local to the menu avoids fighting over
    // which handler owns focus).
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [quickInsertNodeId]);

  /** Inserts `text` at the current cursor position in the node's own <input>, matching legacy's
   * own real insert-at-cursor behavior (legacy/index.html:26711's own
   * `value.slice(0,start)+piece+value.slice(end)` for the editing-node case) -- direct DOM
   * manipulation rather than going through outlineStore.ts, since this component's inline-edit
   * <input> is deliberately uncontrolled (see splitAtCursor's own header comment) and only
   * commits to the store on blur/Enter/Escape, not per keystroke. Restores focus and places the
   * cursor immediately after the inserted text, matching legacy's own `setInputCaret` call. */
  function insertAtCursor(text: string): void {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const newPos = start + text.length;
    el.focus();
    el.setSelectionRange(newPos, newPos);
  }

  /** Nodes eligible to be `@`-mentioned for the currently-open popup's query -- direct port of
   * legacy's own `getAtCandidates` (legacy/index.html:20201-20208): case-insensitive substring
   * match against node text, excludes the node currently being edited (mentioning yourself makes
   * no sense), skips blank-text nodes (nothing meaningful to link to), capped at 12 like legacy. */
  function getAtCandidates(query: string): OutlineNode[] {
    if (!atSuggest) return [];
    const q = query.toLowerCase();
    return nodes.filter((n) => !!n.text?.trim() && n.id !== atSuggest.nodeId && (!q || n.text!.toLowerCase().includes(q))).slice(0, 12);
  }

  /** Runs on every keystroke in the editing `<input>` (wired via onChange below) -- direct port
   * of legacy's own `handleAtInput` (legacy/index.html:20268-20289). Walks backward from the
   * cursor for the nearest `@`; if found, and that `@` isn't already inside an existing
   * `[[...]]` reference (the `openBracket > closeBracket` check, unchanged from legacy), opens/
   * updates the popup with everything typed since as the live query. Legacy's guard against a
   * runaway match (`query.includes(' ') && query.length > 30`) is preserved as-is -- a mention
   * query longer than that with a space in it almost certainly isn't one anymore. No newline
   * check here (legacy's `if (val[i]==='\n') break`, since its contentEditable div can hold one)
   * -- this project's inline-edit `<input>` is single-line by construction, so that branch would
   * never fire. */
  function handleAtInput(e: { currentTarget: HTMLInputElement }, nodeId: number): void {
    setQuickInsertNodeId(null);
    const val = e.currentTarget.value;
    const pos = e.currentTarget.selectionStart ?? val.length;
    let atPos = -1;
    for (let i = pos - 1; i >= 0; i--) {
      if (val[i] === '@') {
        atPos = i;
        break;
      }
    }
    if (atPos < 0) {
      setAtSuggest(null);
      return;
    }
    const before = val.slice(0, atPos);
    if (before.lastIndexOf('[[') > before.lastIndexOf(']]')) {
      setAtSuggest(null);
      return;
    }
    const query = val.slice(atPos + 1, pos);
    if (query.includes(' ') && query.length > 30) {
      setAtSuggest(null);
      return;
    }
    setAtSuggest({ nodeId, atPos, query, activeIdx: 0 });
  }

  /** Replaces the `@query` span with `[[Target Node Text]]` and lands the cursor right after it
   * -- direct port of legacy's own `commitAtSuggest` (legacy/index.html:20242-20266), adapted for
   * a plain uncontrolled `<input>` in place of legacy's contentEditable div (slice via
   * `atPos`/`query.length` instead of `textContent` splicing, `setSelectionRange` instead of a
   * caret-restore helper). Same direct DOM write as `insertAtCursor` above, for the same reason:
   * this input only commits to the store on blur/Enter/Escape, not per keystroke. */
  function commitAtMention(target: OutlineNode): void {
    if (!atSuggest) return;
    const el = inputRef.current;
    if (!el) {
      setAtSuggest(null);
      return;
    }
    const { atPos, query } = atSuggest;
    const before = el.value.slice(0, atPos);
    const after = el.value.slice(atPos + 1 + query.length);
    const inserted = `[[${target.text}]]`;
    el.value = before + inserted + after;
    const newPos = before.length + inserted.length;
    setAtSuggest(null);
    el.focus();
    el.setSelectionRange(newPos, newPos);
  }

  function handleTreeKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (editingId !== null) return;
    // Checked before the `selectedId === null` guard below -- undo/redo doesn't need a
    // selection to make sense (e.g. right after deleting the very last node, selectedId is
    // null, but undoing that delete should still work). Deliberately NOT wired into
    // handleInputKeyDown below (undo while actively typing inline text) -- inside a real
    // <input>, Ctrl+Z triggers the browser's own native text-field undo first, and overriding
    // that correctly needs its own explicit handling there, not just this handler; a real,
    // separately-scoped follow-up, not silently dropped.
    if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && e.shiftKey) || ((e.key === 'y' || e.key === 'Y') && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      redo();
      return;
    }
    // Ctrl/Cmd+B/I/U (Cmd+Shift+S for strike, avoiding the browser's own Ctrl/Cmd+S save
    // binding) -- matches legacy's own real shortcuts (legacy/index.html:6386-6389's own
    // tooltip text) and, same as undo/redo above, deliberately NOT wired into
    // handleInputKeyDown below (formatting while actively typing inline text). Legacy's own
    // version also reopens inline-edit mode immediately after applying
    // (`toggleNodeStyle('bold'); beginEdit(id,true)`) when triggered from within an active
    // edit session -- that reentry behavior isn't replicated here since this binding only ever
    // fires outside of editing in the first place (the `editingId !== null` guard above already
    // returns before reaching this point), a smaller, honest scope than legacy's real one.
    if ((e.key === 'b' || e.key === 'B') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      toggleNodeStyle('bold');
      return;
    }
    if ((e.key === 'i' || e.key === 'I') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      toggleNodeStyle('italic');
      return;
    }
    if ((e.key === 'u' || e.key === 'U') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
      e.preventDefault();
      toggleNodeStyle('underline');
      return;
    }
    if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey) && e.shiftKey) {
      e.preventDefault();
      toggleNodeStyle('strike');
      return;
    }
    if (selectedId === null) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        outdentSelected();
      } else {
        indentSelected();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        newChild(selectedId);
      } else {
        newSiblingBelow(selectedId);
      }
    } else if (e.key === 'Backspace') {
      const node = nodes.find((n) => n.id === selectedId);
      if (node && !node.text) {
        e.preventDefault();
        deleteNode(selectedId);
      }
    } else if (e.key === 'Delete') {
      // The multi-select counterpart to Backspace-on-empty-text above: Delete removes every
      // root of the current selection (single or multi) regardless of its text content,
      // matching legacy's own Delete-key binding for deleteSelected().
      e.preventDefault();
      deleteSelected();
    }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>, id: number) {
    // @-mention popup navigation -- checked first, before every other binding below, since an
    // open popup owns Enter/Escape/arrow keys while it's up (matching legacy's own ordering,
    // legacy/index.html:26956-26959, where these checks precede the plain-Enter/Escape handling
    // in the same function). Backspace is deliberately NOT intercepted here: legacy doesn't
    // either, so backspacing through a query character falls through to the normal <input>
    // behavior and the next onChange's handleAtInput naturally recomputes (or closes) the popup.
    if (atSuggest && atSuggest.nodeId === id) {
      const candidates = getAtCandidates(atSuggest.query);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAtSuggest((s) => (s ? { ...s, activeIdx: Math.min(s.activeIdx + 1, Math.max(candidates.length - 1, 0)) } : s));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAtSuggest((s) => (s ? { ...s, activeIdx: Math.max(s.activeIdx - 1, 0) } : s));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (candidates.length && candidates[atSuggest.activeIdx]) {
          e.preventDefault();
          commitAtMention(candidates[atSuggest.activeIdx]);
          return;
        }
        setAtSuggest(null);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setAtSuggest(null);
        return;
      }
    }
    if (e.key === ' ' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setAtSuggest(null);
      setQuickInsertNodeId(id);
      return;
    }
    if (e.key === 'Enter' && e.shiftKey && !e.metaKey && !e.ctrlKey) {
      // Shift+Enter splits at the cursor -- checked before the plain-Enter branch below, since
      // Shift+Enter would otherwise fall into the "commit then create a sibling" path with the
      // caret position discarded. Ctrl/Cmd+Shift+Enter isn't a real gesture legacy binds either
      // (ctrl/meta+Enter alone means newChild), so it's excluded here rather than guessing at
      // an unbound combination's intent.
      e.preventDefault();
      splitAtCursor(id, e.currentTarget.value, e.currentTarget.selectionStart ?? e.currentTarget.value.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commitEdit(id, e.currentTarget.value);
      if (e.metaKey || e.ctrlKey) {
        newChild(id);
      } else {
        newSiblingBelow(id);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === 'Backspace' && e.currentTarget.value === '') {
      e.preventDefault();
      deleteNode(id);
    }
  }

  function handleDragStart(id: number) {
    setDraggedId(id);
    // If the dragged row is part of a live multi-selection, drag the whole selection as one
    // combined block — same isMultiDrag check as legacy's own row dragstart handler. Root
    // indexes only (not every descendant id), matching moveMultipleNodeBlocksCore's own
    // expectation that draggedIds identifies whole subtrees to move together.
    if (multiSelectedIds.length > 1 && multiSelectedIds.includes(id)) {
      const roots = selectionRootIndexes().map((idx) => nodes[idx].id);
      setDraggedIds(roots);
    } else {
      setDraggedIds(null);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, id: number) {
    e.preventDefault();
    if (draggedId === null || draggedId === id) {
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientY - rect.top) / rect.height;
    // Top third = above, middle third = nest as child, bottom third = below — matches the
    // ported moveNodeBlockCore's own 'above'/'child'/'below' modes exactly (see that
    // function's own header: 'child' inserts right after the target as its first child,
    // depth+1). No separate UI affordance needed beyond a wider middle drop zone.
    const mode: DropMode = fraction < 0.33 ? 'above' : fraction > 0.67 ? 'below' : 'child';
    setDropTarget({ id, mode });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, targetId: number) {
    e.preventDefault();
    if (draggedId !== null && dropTarget && dropTarget.id === targetId) {
      moveNode(draggedId, targetId, dropTarget.mode, draggedIds ?? undefined);
    }
    setDraggedId(null);
    setDraggedIds(null);
    setDropTarget(null);
  }

  function handleTagInputKeyDown(e: KeyboardEvent<HTMLInputElement>, id: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = e.currentTarget.value;
      if (value.trim()) toggleTag(id, value);
      e.currentTarget.value = '';
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditingTagsId(null);
    }
  }

  const visible = visibleIndexes();
  const focusedNode = focusedId !== null ? nodes.find((n) => n.id === focusedId) : undefined;

  return (
    <div>
      {/* Focus (zoom-in) breadcrumb + active tag-filter indicator -- Tags & Focus mode slice
          (docs/phase5-parity-checklist.md). Only rendered when relevant, matching the rest of
          this file's "no chrome for inactive state" convention (e.g. note/code preview rows). */}
      {(focusedNode || activeTagFilter !== null) && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, fontFamily: 'sans-serif', fontSize: 12, flexWrap: 'wrap' }}>
          {focusedNode && (
            <span style={{ color: t.mutedText }}>
              🔍 {focusPath().map((n) => (n.text || '(empty)') + ' › ').join('')}
              <strong style={{ color: t.text }}>{focusedNode.text || '(empty)'}</strong>{' '}
              <button type="button" onClick={exitFocus} style={sortButtonStyle(t)}>
                Exit focus
              </button>
            </span>
          )}
          {activeTagFilter !== null && (
            <span style={{ color: t.mutedText }}>
              Filtering: <strong style={{ color: t.text }}>#{activeTagFilter}</strong>{' '}
              <button type="button" onClick={() => setTagFilter(null)} style={sortButtonStyle(t)}>
                Clear filter
              </button>
            </span>
          )}
        </div>
      )}
      {/* Sort top-level nodes — the toolbar-level entry point legacy exposes via its "Extras"
          menu (sort-root-az-btn/sort-root-za-btn/sort-root-depth-btn), always operating on
          root blocks (parentId null). The per-node "sort this node's children" context-menu
          entry point is deferred until web/ has a context menu at all. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, fontFamily: 'sans-serif', fontSize: 12 }}>
        <span style={{ color: t.mutedText, alignSelf: 'center' }}>Sort top-level:</span>
        <button type="button" onClick={() => sortChildren(null, 'az')} style={sortButtonStyle(t)}>
          A → Z
        </button>
        <button type="button" onClick={() => sortChildren(null, 'za')} style={sortButtonStyle(t)}>
          Z → A
        </button>
        <button type="button" onClick={() => sortChildren(null, 'depth')} style={sortButtonStyle(t)}>
          By depth
        </button>
        <button type="button" onClick={toggleTheme} style={{ ...sortButtonStyle(t), marginLeft: 'auto' }}>
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </div>
      <div
        role="tree"
        tabIndex={0}
        onKeyDown={handleTreeKeyDown}
        style={{
          fontFamily: 'sans-serif',
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '0.5rem',
          outline: 'none',
          background: t.background,
          color: t.text
        }}
      >
      {visible.map((idx) => {
        const node = nodes[idx];
        const isSelected = node.id === selectedId;
        const isMultiSelected = multiSelectedIds.length > 1 && multiSelectedIds.includes(node.id);
        const isEditing = node.id === editingId;
        const isDragging = node.id === draggedId || (draggedIds !== null && draggedIds.includes(node.id));
        const showDropAbove = dropTarget?.id === node.id && dropTarget.mode === 'above';
        const showDropBelow = dropTarget?.id === node.id && dropTarget.mode === 'below';
        const showDropChild = dropTarget?.id === node.id && dropTarget.mode === 'child';
        const hasChildren = nodeHasChildrenFn(node.id);
        const isCollapsed = collapsedIds.has(node.id);

        return (
          <div key={node.id}>
          <div
            draggable={!isEditing}
            onDragStart={() => handleDragStart(node.id)}
            onDragOver={(e) => handleDragOver(e, node.id)}
            onDrop={(e) => handleDrop(e, node.id)}
            onDragEnd={() => {
              setDraggedId(null);
              setDraggedIds(null);
              setDropTarget(null);
            }}
            onMouseEnter={() => setHoveredNodeId(node.id)}
            onMouseLeave={() => setHoveredNodeId((current) => (current === node.id ? null : current))}
            onContextMenu={(e) => {
              if (isEditing) return;
              e.preventDefault();
              selectNode(node.id);
              setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              paddingLeft: `${node.depth * 24 + 8}px`,
              paddingTop: 4,
              paddingBottom: 4,
              cursor: isEditing ? 'text' : 'grab',
              opacity: isDragging ? 0.4 : 1,
              backgroundColor: showDropChild
                ? `${t.dropIndicator}1f`
                : isSelected
                  ? t.selectedBg
                  : isMultiSelected
                    ? t.multiSelectedBg
                    : 'transparent',
              boxShadow: showDropChild ? `inset 0 0 0 1.5px ${t.dropIndicator}` : 'none',
              borderTop: showDropAbove ? `2px solid ${t.dropIndicator}` : '2px solid transparent',
              borderBottom: showDropBelow ? `2px solid ${t.dropIndicator}` : '2px solid transparent',
              borderRadius: 4
            }}
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (hasChildren) toggleCollapse(node.id);
              }}
              style={{
                width: 16,
                display: 'inline-block',
                textAlign: 'center',
                cursor: hasChildren ? 'pointer' : 'default',
                color: t.mutedText,
                userSelect: 'none'
              }}
            >
              {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
            </span>
            {node.isCheckbox && (
              <input
                type="checkbox"
                checked={node.checked}
                onChange={() => toggleCheckbox(node.id)}
                onClick={(e) => e.stopPropagation()}
                style={{ marginRight: 6, cursor: 'pointer' }}
              />
            )}
            {isEditing ? (
              <span style={{ position: 'relative', flex: 1 }}>
                <input
                  ref={inputRef}
                  defaultValue={node.text ?? ''}
                  onKeyDown={(e) => handleInputKeyDown(e, node.id)}
                  onChange={(e) => handleAtInput(e, node.id)}
                  onBlur={(e) => commitEdit(node.id, e.currentTarget.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    font: 'inherit',
                    border: 'none',
                    outline: `1px solid ${t.dropIndicator}`,
                    borderRadius: 3,
                    padding: '0 4px'
                  }}
                />
                {/* Quick Insert (Phase 6.2) -- Ctrl/Cmd+Space while editing opens this small
                    character-insert menu, matching legacy's own real menu exactly: same 7
                    actions in the same order (NODE_QA_ACTION_ORDER), same glyphs
                    (NODE_QA_ACTION_META). Node-specific actions from legacy's own version
                    (note/tags/etc) are deliberately excluded -- legacy's own help text says
                    exactly why: "For actions on a specific node... use the right-click menu
                    instead" (this project's context menu, #147). Arrow-key navigation +
                    Enter/click to select, Escape/click-outside to close -- same interaction
                    pattern as DocumentTabs.tsx's own tab-switcher dropdown. */}
                {quickInsertNodeId === node.id && (
                  <div
                    ref={quickInsertRef}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        setQuickInsertNodeId(null);
                        inputRef.current?.focus();
                      }
                    }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 2,
                      minWidth: 170,
                      background: t.background,
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      boxShadow: '0 14px 28px rgba(0,0,0,.16)',
                      zIndex: 90,
                      padding: 4,
                      font: "400 13px 'Inter', sans-serif"
                    }}
                  >
                    {(
                      [
                        { label: 'Insert em dash', glyph: '—', text: '—' },
                        { label: 'Insert en dash', glyph: '–', text: '–' },
                        { label: 'Insert arrow', glyph: '➜', text: '➜' },
                        { label: 'Insert check mark', glyph: '✓', text: '✓' },
                        { label: 'Insert cross mark', glyph: '✗', text: '✗' },
                        { label: 'Insert middle dot', glyph: '·', text: '·' },
                        { label: 'Insert date/time', glyph: '📅', text: formatNow() }
                      ] as { label: string; glyph: string; text: string }[]
                    ).map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onMouseDown={(e) => {
                          // mousedown (not click) so this fires BEFORE the input's own onBlur
                          // -- committing the edit is not what should happen when picking a
                          // Quick Insert item; the item should land in the still-open input.
                          e.preventDefault();
                          insertAtCursor(item.text);
                          setQuickInsertNodeId(null);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          textAlign: 'left',
                          padding: '6px 8px',
                          border: 'none',
                          background: 'transparent',
                          borderRadius: 5,
                          cursor: 'pointer',
                          color: t.text,
                          font: "400 13px 'Inter', sans-serif"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span style={{ width: 18, textAlign: 'center', color: t.mutedText }}>{item.glyph}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
                {/* @-mention autocomplete (Phase 6.4) -- opens as soon as handleAtInput detects a
                    live `@query` span in this node's own input; ArrowUp/Down/Enter/Tab/Escape are
                    intercepted in handleInputKeyDown above while this is open (see that
                    function's own comment for why it's checked first). Matched substring
                    highlighted the same way legacy's own `<mark>` does (legacy/index.html:20223-
                    20227), just via a plain text split since this project renders React nodes
                    rather than innerHTML. Mousedown (not click), same reasoning as Quick Insert's
                    own items just above: must fire before the input's onBlur commits the edit. */}
                {atSuggest && atSuggest.nodeId === node.id && (
                  <div
                    ref={atSuggestRef}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 2,
                      minWidth: 220,
                      maxWidth: 320,
                      maxHeight: 220,
                      overflowY: 'auto',
                      background: t.background,
                      border: `1px solid ${t.border}`,
                      borderRadius: 8,
                      boxShadow: '0 14px 28px rgba(0,0,0,.16)',
                      zIndex: 91,
                      padding: 4,
                      font: "400 12px 'Inter', sans-serif"
                    }}
                  >
                    {(() => {
                      const candidates = getAtCandidates(atSuggest.query);
                      if (!candidates.length) {
                        return <div style={{ padding: '8px 9px', color: t.hintText }}>No matching nodes</div>;
                      }
                      const q = atSuggest.query.toLowerCase();
                      return candidates.map((n, i) => {
                        const text = n.text ?? '';
                        const lo = q ? text.toLowerCase().indexOf(q) : -1;
                        return (
                          <div
                            key={n.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              commitAtMention(n);
                            }}
                            onMouseEnter={() => setAtSuggest((s) => (s ? { ...s, activeIdx: i } : s))}
                            style={{
                              padding: '6px 9px',
                              borderRadius: 5,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              color: t.text,
                              background: i === atSuggest.activeIdx ? t.hoverBg : 'transparent'
                            }}
                          >
                            {lo >= 0 ? (
                              <>
                                {text.slice(0, lo)}
                                <mark style={{ background: 'none', color: t.dropIndicator, fontWeight: 600 }}>
                                  {text.slice(lo, lo + q.length)}
                                </mark>
                                {text.slice(lo + q.length)}
                              </>
                            ) : (
                              text
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </span>
            ) : (
              <span
                onClick={(e) => clickNode(node.id, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey || e.metaKey })}
                onDoubleClick={() => startEditing(node.id)}
                style={{ flex: 1, ...composeNodeLabelStyle(node) }}
              >
                {node.text ? (
                  <NodeText
                    text={node.text}
                    onLinkClick={(target) => {
                      const found = findNodeByText(nodes, target);
                      if (found) selectNode(found.id);
                    }}
                  />
                ) : (
                  <span style={{ color: '#bbb' }}>(empty)</span>
                )}
              </span>
            )}
            {/* Fold badge -- "+N hidden" for a collapsed node with children, matching legacy's
                own real fold-badge exactly (legacy/index.html's own `folded&&hasChildren` block:
                countDescendants for the count, click to expand). Uses the already-ported, already-
                tested countDescendants (nodeQueries.ts) -- no new pure logic needed for this
                slice, purely wiring an existing function into the UI. mousedown (not click, and
                stopPropagation+preventDefault) matches legacy's own binding exactly -- expanding
                on mousedown avoids the row's own click handler treating this as a row click. */}
            {collapsedIds.has(node.id) && hasChildren && (
              <span
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  toggleCollapse(node.id);
                }}
                title={`Click to expand · ${countDescendants(nodes, idx)} hidden node${countDescendants(nodes, idx) === 1 ? '' : 's'}`}
                style={{
                  display: 'inline-block',
                  marginLeft: 10,
                  padding: '0 6px',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
                  color: 'var(--accent)',
                  font: "500 10px 'Inter', sans-serif",
                  letterSpacing: '.02em',
                  verticalAlign: 'middle',
                  cursor: 'pointer'
                }}
              >
                +{countDescendants(nodes, idx)}
              </span>
            )}
            {node.tags.map((tag) => (
              <span
                key={tag}
                onClick={(e) => {
                  e.stopPropagation();
                  setTagFilter(tag);
                }}
                title={`Filter by #${tag} (click chip to filter, click × to remove)`}
                style={{
                  fontSize: 11,
                  color: t.mutedText,
                  border: `1px solid ${t.border}`,
                  borderRadius: 10,
                  padding: '0 6px',
                  marginRight: 4,
                  cursor: 'pointer',
                  userSelect: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                #{tag}{' '}
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTag(node.id, tag);
                  }}
                  title="Remove tag"
                  style={{ marginLeft: 2 }}
                >
                  ×
                </span>
              </span>
            ))}
            {editingTagsId === node.id ? (
              <input
                autoFocus
                placeholder="tag + Enter"
                onKeyDown={(e) => handleTagInputKeyDown(e, node.id)}
                onBlur={() => setEditingTagsId(null)}
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 11, width: 80, marginRight: 4 }}
              />
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTagsId(node.id);
                }}
                title="Add tag"
                style={{ fontSize: 11, color: t.mutedText, cursor: 'pointer', padding: '0 6px', userSelect: 'none' }}
              >
                +tag
              </span>
            )}
            {/* Checkbox progress badge -- "X/Y done" for a checkbox node with checkbox
                children, matching legacy's own real cb-progress badge exactly
                (isCheckboxNode(node)&&hasChildren, getCheckboxChildStats for the counts). Also
                already-ported, already-tested (nodeQueries.ts's getCheckboxChildStats) -- purely
                wiring, no new logic. Passive/informational, not clickable -- matches legacy's
                own real badge (no click handler on `.cb-progress` anywhere in its source). */}
            {node.isCheckbox &&
              hasChildren &&
              (() => {
                const { total, checked } = getCheckboxChildStats(nodes, idx);
                if (total === 0) return null;
                return (
                  <span
                    title={`${checked} of ${total} done`}
                    style={{
                      fontSize: 11,
                      color: t.mutedText,
                      marginLeft: 6,
                      padding: '0 6px',
                      border: `1px solid ${t.border}`,
                      borderRadius: 10,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {checked}/{total}
                  </span>
                );
              })()}
            <span
              onClick={(e) => {
                e.stopPropagation();
                zoomIntoNode(node.id);
              }}
              title="Zoom into this node (Focus mode)"
              style={{ fontSize: 11, color: t.mutedText, cursor: 'pointer', padding: '0 6px', userSelect: 'none' }}
            >
              🔍
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                openNotePanel(node.id, !!node.note?.trim(), !!node.codeBlock?.code?.trim(), 'note');
              }}
              title={node.note ? 'Edit note' : 'Add note'}
              style={{ fontSize: 11, color: t.mutedText, cursor: 'pointer', padding: '0 6px', userSelect: 'none' }}
            >
              {node.note ? '📝' : '+note'}
            </span>
            <span
              onClick={(e) => {
                e.stopPropagation();
                openNotePanel(node.id, !!node.note?.trim(), !!node.codeBlock?.code?.trim(), 'code');
              }}
              title={node.codeBlock ? 'Edit code block' : 'Add code block'}
              style={{ fontSize: 11, color: t.mutedText, cursor: 'pointer', padding: '0 6px', userSelect: 'none' }}
            >
              {node.codeBlock ? '💻' : '+code'}
            </span>
            {/* Node hover toolbar (Phase 6.2) -- ⤴ insert above / ＋ add child / ⤵ insert below,
                matching legacy's own default hoverToolbarActions exactly. Only rendered while
                hovering this specific row and not mid-edit (matching legacy's own real hover-rail
                visibility rule) -- appearing/disappearing on hover, not a fixed-width reserved
                slot, so it doesn't shift adjacent content when absent. */}
            {hoveredNodeId === node.id && !isEditing && (
              <span style={{ display: 'inline-flex', marginLeft: 4 }}>
                <span
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    newSiblingAbove(node.id);
                  }}
                  title="Insert above"
                  style={{ fontSize: 11, color: t.mutedText, cursor: 'pointer', padding: '0 4px', userSelect: 'none' }}
                >
                  ⤴
                </span>
                <span
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    newChild(node.id);
                  }}
                  title="Add child"
                  style={{ fontSize: 11, color: t.mutedText, cursor: 'pointer', padding: '0 4px', userSelect: 'none' }}
                >
                  ＋
                </span>
                <span
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    newSiblingBelow(node.id);
                  }}
                  title="Insert below"
                  style={{ fontSize: 11, color: t.mutedText, cursor: 'pointer', padding: '0 4px', userSelect: 'none' }}
                >
                  ⤵
                </span>
              </span>
            )}
          </div>
          {node.note && (
            <div
              onClick={() => openNotePanel(node.id, !!node.note?.trim(), !!node.codeBlock?.code?.trim(), 'note')}
              style={{
                paddingLeft: `${node.depth * 24 + 32}px`,
                paddingBottom: 4,
                fontSize: 13,
                color: t.mutedText,
                cursor: 'text',
                whiteSpace: 'pre-wrap'
              }}
            >
              {stripHtmlToText(node.note)}
            </div>
          )}
          {node.codeBlock && (
            <pre
              onClick={() => openNotePanel(node.id, !!node.note?.trim(), !!node.codeBlock?.code?.trim(), 'code')}
              style={{
                marginLeft: `${node.depth * 24 + 32}px`,
                marginTop: 0,
                marginBottom: 4,
                padding: 6,
                background: t.codeBg,
                borderRadius: 4,
                fontSize: 13,
                cursor: 'text',
                maxWidth: '85%',
                overflowX: 'auto'
              }}
            >
              {node.codeBlock.code}
            </pre>
          )}
          </div>
        );
      })}
      </div>
      {/* Right-click context menu (Phase 6.2). A single flat action list rather than legacy's
          own top-row-plus-collapsible-"More"-panel split (legacy/index.html's own
          CTX_ACTION_ORDER has ~20 entries across insert/structure/ai/notes/delete groups,
          justifying that space-saving refinement; this list is deliberately much shorter).
          Included: the same 3 hover-toolbar actions (above/child/below) plus duplicate, focus,
          up/down, fold, tags, delete -- every action this project has a real, working store
          action for today. Deliberately NOT included, not silently dropped: AI rewrite/icon
          suggestions (ai-rewrite, ai-rewrite-all, ai-icon, ai-icon-all -- web/ has no AI
          integration at all), slide-divider (a Presenter-mode-specific field web/'s
          PresenterMode.tsx doesn't use), note/qa/remark/where-used/version-history (each needs
          its own real subsystem -- a rich note editor, per-node Q&A linking, a remarks system,
          backlinks, or version snapshots -- none of which exist in web/ yet), date-time (a
          simple text-insert, genuinely small, but there's no natural place to insert it without
          an active edit-cursor position, which this menu doesn't track). */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            // Simple viewport clamp (a page-edge margin, not legacy's own pixel-exact
            // _clampContextMenuPosition) -- keeps the menu from rendering off-screen without
            // replicating that function's exact math.
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 320),
            minWidth: 180,
            background: t.background,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            boxShadow: '0 14px 28px rgba(0,0,0,.16)',
            zIndex: 80,
            padding: 4,
            font: "400 13px 'Inter', sans-serif"
          }}
        >
          {(
            [
              { label: 'Insert above', action: () => newSiblingAbove(contextMenu.nodeId) },
              { label: 'Add child', action: () => newChild(contextMenu.nodeId) },
              { label: 'Insert below', action: () => newSiblingBelow(contextMenu.nodeId) },
              { label: 'Duplicate', action: () => duplicateSelected() },
              { label: 'Zoom in on branch', action: () => zoomIntoNode(contextMenu.nodeId) },
              { label: 'Move up', action: () => moveSelected(-1) },
              { label: 'Move down', action: () => moveSelected(1) },
              {
                label: collapsedIds.has(contextMenu.nodeId) ? 'Expand branch' : 'Collapse branch',
                action: () => toggleCollapse(contextMenu.nodeId)
              },
              { label: 'Tags…', action: () => setEditingTagsId(contextMenu.nodeId) },
              {
                label: 'Delete',
                danger: true,
                action: () => {
                  if (window.confirm('Delete this node and its subtree?')) deleteNode(contextMenu.nodeId);
                }
              }
            ] as { label: string; action: () => void; danger?: boolean }[]
          ).map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.action();
                setContextMenu(null);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 10px',
                border: 'none',
                background: 'transparent',
                borderRadius: 5,
                cursor: 'pointer',
                color: item.danger ? '#b3261e' : t.text,
                font: "400 13px 'Inter', sans-serif"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
