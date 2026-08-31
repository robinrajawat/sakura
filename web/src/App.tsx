import { useState, useEffect, useRef, type ReactNode } from 'react';
import { ClockIcon, SparkleIcon, EditorPreviewToggleIcon, EditorToolbarToggleIcon, EditorPadToggleIcon, EditorZenToggleIcon } from './icons';
import { Button } from './components/ui/Button';
import { AppShell } from './components/AppShell';
import { useSidebarStore } from './store/sidebarStore';
import { usePadVisibilityStore } from './store/padVisibilityStore';
import { SidebarFileExplorer } from './components/SidebarFileExplorer';
import { OutlineTree } from './components/OutlineTree';
import { NotePanel } from './components/NotePanel';
import { useOutlineStore } from './store/outlineStore';
import { DocumentTabs } from './components/DocumentTabs';
import { useDocumentsStore } from './store/documentsStore';
import { PreviewPane } from './components/PreviewPane';
import { PresenterMode } from './components/PresenterMode';
import { ExportButtons } from './components/ExportButtons';
import { PadPanel } from './components/PadPanel';
import { HubDock } from './components/HubDock';
import { useHubDockStore } from './store/hubDockStore';
import { AccountMenu } from './components/AccountMenu';
import { SignInGate } from './components/SignInGate';
import { WelcomeModal } from './components/WelcomeModal';
import { DocumentHeader } from './components/DocumentHeader';
import { DocSyncPanel } from './components/DocSyncPanel';
import { NotificationBell } from './components/NotificationBell';
import { VersionHistoryPanel } from './components/VersionHistoryPanel';
import { MobileHub } from './components/MobileHub';
import { useIsMobileViewport } from './utils/useIsMobileViewport';
import { SettingsPanel, type SettingsCategory } from './components/SettingsPanel';
import { AudienceWindow } from './components/AudienceWindow';
import { isAudienceWindow } from './state/audienceMode';
import { rewriteNode, rewriteNodes } from './state/aiRewrite';
import { useAutoRewriteStore } from './store/autoRewriteStore';
import { generateOutline, restructureText } from './state/aiOutline';
import { expandNode, suggestTags } from './state/aiExpandTags';
import { RestructureTextDialog } from './components/RestructureTextDialog';
import { suggestIconForSelection, suggestIconsForAllDocumentNodes } from './state/aiIcon';
import { useIconPickerStore } from './store/iconPickerStore';
import { IconPickerPopover } from './components/IconPickerPopover';
import { summariseSelectionIntoParent } from './state/aiSummarise';
import { useQuickAssistStore } from './store/quickAssistStore';
import { QuickAssistBar } from './components/QuickAssistBar';
import { useOutlinePrefsStore } from './store/outlinePrefsStore';
import { useNotePanelStore } from './store/notePanelStore';

/**
 * §7.5 slice (docs/phase7-app-shell-and-dashboard-plan.md): a labeled cluster of toolbar
 * buttons, direct visual match of legacy's real `.action-group`/`.ag-buttons`/`.ag-label`
 * structure (legacy/index.html:6357 area) -- a row of buttons with a small caption underneath.
 * Defined at module scope (not nested inside `App()`) so it isn't redefined -- and every button
 * inside it remounted -- on every render.
 *
 * §8.4d retrofit (docs/phase8-design-system-parity-plan.md): now renders through the real
 * `.action-group`/`.ag-buttons`/`.ag-label` classes (index.css) instead of the ad hoc inline
 * `style` objects this component started with -- see index.css's own `.ag-label` comment for why
 * the label stays unconditionally visible here rather than porting legacy's toggle-gated default.
 */
function ToolbarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="action-group">
      <div className="ag-buttons">{children}</div>
      <span className="ag-label">{label}</span>
    </div>
  );
}

/**
 * Phase 6.1, part 2 (docs/phase6-full-parity-plan.md). Now wrapped in AppShell.tsx's real
 * header/sidebar/tab-bar/status-bar chrome instead of Phase 3's plain `<h1>` + vertical panel
 * dump. The panel content itself (Edit/Preview/Present toggle, Pad, Hub sections, Account/Sync)
 * is unchanged in this slice -- only the surrounding chrome is new. Still not full parity: the
 * main content area below is still every panel stacked vertically inside AppShell's content
 * slot, not legacy's real panel-docking/layout system -- that's its own separate 6.1+ follow-up,
 * not this slice's job.
 */
export function App() {
  const [mode, setMode] = useState<'edit' | 'preview' | 'present'>('edit');
  // §8.17 slice (docs/phase8-design-system-parity-plan.md): matches legacy's real transient
  // `zenMode` module variable (legacy/index.html:29751) -- NOT persisted across reloads, unlike
  // `toolbarVisible`/`padVisible`, matching legacy's own real distinction (only the `zenHideX`
  // per-panel settings are ever saved, never `zenMode` itself). Scoped down from legacy's real
  // `setZenMode` (legacy/index.html:31223-31244) to the two auto-hide targets `web/` actually has
  // sensible equivalents for -- sidebar and app-bar (legacy's real defaults, `zenHideSidebar=true`/
  // `zenHideAppbar=true`) -- and skips the configurable per-panel toggle settings (`zenHideToolbar`/
  // `zenHidePad`, both default `false` in legacy anyway) and Quick-Assist-into-statusbar relocation
  // (`web/`'s Quick Assist has only ever had the one app-bar-docked location, §8.15) as real,
  // separately-scoped follow-ups rather than silently-approximated behavior.
  const [zenMode, setZenModeState] = useState(false);
  const zenAutoHidSidebarRef = useRef(false);
  const sidebarOpen = useSidebarStore((s) => s.open);
  const toggleSidebarOpen = useSidebarStore((s) => s.toggleOpen);

  function setZenMode(on: boolean): void {
    setZenModeState(on);
    if (on) {
      zenAutoHidSidebarRef.current = false;
      if (sidebarOpen) {
        toggleSidebarOpen();
        zenAutoHidSidebarRef.current = true;
      }
      // Matches legacy's real `zenUseFullscreen` default (true) -- best-effort: sandboxed iframes
      // and some browsers reject this outright, matching legacy's own `.catch(()=>{})` no-op.
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      if (zenAutoHidSidebarRef.current && !useSidebarStore.getState().open) toggleSidebarOpen();
      zenAutoHidSidebarRef.current = false;
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    }
  }

  // Matches legacy's real `fullscreenchange` listener (legacy/index.html:31248-31249): stays in
  // sync with fullscreen exited some way other than this toggle (Esc, F11, browser chrome).
  useEffect(() => {
    function onFullscreenChange(): void {
      if (!document.fullscreenElement && zenMode) setZenMode(false);
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zenMode]);

  // Matches legacy's real Escape handler's zen-mode clause (legacy/index.html:28043's own
  // `if(zenMode)setZenMode(false)`) -- scoped to just that one clause, not legacy's whole
  // multi-purpose Escape chain (context menu/drag/focus-mode, each already handled by their own
  // component here).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && zenMode) setZenMode(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zenMode]);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory | undefined>(undefined);
  const hubDockActiveTab = useHubDockStore((s) => s.activeTab);
  const hubDockLastTab = useHubDockStore((s) => s.lastTab);
  const toggleHubDockTab = useHubDockStore((s) => s.toggleTab);
  const isMobile = useIsMobileViewport();

  /** §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): a single open-Settings entry
   * point shared by the header's own gear button (always opens on the default category, same as
   * before this slice) and `AccountMenu.tsx`'s "Manage account"/"Settings" dropdown entries
   * (which can request a specific starting category, matching legacy's real
   * `account-manage-btn`/`account-settings-btn` deep-links) -- `SettingsPanel.tsx` only reads its
   * `initialCategory` prop once at mount (`useState(initialCategory ?? 'general')`), which stays
   * correct here since it's only ever mounted fresh (`{settingsOpen && <SettingsPanel .../>}`
   * below unmounts it on every close). */
  function openSettings(category?: SettingsCategory): void {
    setSettingsCategory(category);
    setSettingsOpen(true);
  }
  const registerScrollContainer = useDocumentsStore((s) => s.registerScrollContainer);
  const activeDocId = useDocumentsStore((s) => s.activeDocId);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const undo = useOutlineStore((s) => s.undo);
  const redo = useOutlineStore((s) => s.redo);
  const canUndo = useOutlineStore((s) => s.canUndo());
  const canRedo = useOutlineStore((s) => s.canRedo());
  const duplicateSelected = useOutlineStore((s) => s.duplicateSelected);
  const hasSelection = useOutlineStore((s) => s.selectedId !== null);
  const selectedId = useOutlineStore((s) => s.selectedId);
  const outdentSelected = useOutlineStore((s) => s.outdentSelected);
  const indentSelected = useOutlineStore((s) => s.indentSelected);
  const newSiblingAbove = useOutlineStore((s) => s.newSiblingAbove);
  const newChild = useOutlineStore((s) => s.newChild);
  const deleteSelected = useOutlineStore((s) => s.deleteSelected);
  const toggleNodeStyle = useOutlineStore((s) => s.toggleNodeStyle);
  const applyHeadingOption = useOutlineStore((s) => s.applyHeadingOption);
  const toggleCheckboxType = useOutlineStore((s) => s.toggleCheckboxType);
  const selectedIds = useOutlineStore((s) => s.selectedIds);
  // §7.5 slice (docs/phase7-app-shell-and-dashboard-plan.md): matches legacy's real
  // `toolbarVisible` default (false) -- see outlinePrefsStore.ts's own header for the full story.
  const toolbarVisible = useOutlinePrefsStore((s) => s.toolbarVisible);
  const setToolbarVisible = useOutlinePrefsStore((s) => s.setToolbarVisible);
  const padVisible = usePadVisibilityStore((s) => s.padVisible);
  const togglePadVisible = usePadVisibilityStore((s) => s.togglePadVisible);
  const openNotePanel = useNotePanelStore((s) => s.openPanel);
  const [aiRewriteBusy, setAiRewriteBusy] = useState(false);
  const autoRewriteEnabled = useAutoRewriteStore((s) => s.enabled);
  const setAutoRewriteEnabled = useAutoRewriteStore((s) => s.setEnabled);
  const autoRewriteStatusText = useAutoRewriteStore((s) => s.statusText);
  // Re-render the status chip on every queue/busy/paused change, not just `enabled` -- `statusText`
  // itself is a plain function call (not a selector), so its result needs a live subscription to
  // stay current the same way `keyStatusForProvider`'s callers do elsewhere.
  useAutoRewriteStore((s) => s.queue.size);
  useAutoRewriteStore((s) => s.busy);
  useAutoRewriteStore((s) => s.pausedNoKey);

  // §6.9 slice (docs/phase6-full-parity-plan.md): Rewrite -- the first real AI capability.
  // Matches legacy's real qb-ai-rewrite toolbar button: a single selected node calls
  // rewriteNode, more than one calls the batch rewriteNodes. Sub-text-selection rewrite
  // (rewriting just a highlighted substring within an actively-edited node) is deliberately not
  // built here -- see aiRewrite.ts's own header for why. Errors surface via window.alert,
  // matching this project's established "no generic toast/modal system yet, use a native
  // browser primitive" convention (see e.g. HubLibraryPanel.tsx's own window.confirm usage).
  async function handleAiRewrite(): Promise<void> {
    const ids = selectedIds();
    if (!ids.length) return;
    setAiRewriteBusy(true);
    const result = ids.length === 1 ? await rewriteNode(ids[0]) : await rewriteNodes(ids);
    setAiRewriteBusy(false);
    if (!result.ok) window.alert(result.message);
  }

  // §6.9 slice 5 (docs/phase6-full-parity-plan.md): Generate Outline + Restructure Text. Generate
  // Outline's topic is a short single-line entry -- `window.prompt` is a fine fit here, matching
  // this project's established native-primitive convention (unlike Restructure Text's multi-line
  // paste, which genuinely needs a real textarea -- see `RestructureTextDialog.tsx`'s own header
  // for why `window.prompt` specifically isn't adequate there).
  const [restructureDialogOpen, setRestructureDialogOpen] = useState(false);
  const [aiOutlineBusy, setAiOutlineBusy] = useState(false);

  async function handleGenerateOutline(): Promise<void> {
    const topic = window.prompt('Generate Outline with AI\n\nDescribe what you want an outline for (e.g. "competitor analysis" or "onboarding checklist for a new hire").');
    if (topic === null) return;
    setAiOutlineBusy(true);
    const result = await generateOutline(topic);
    setAiOutlineBusy(false);
    if (!result.ok) window.alert(result.message);
  }

  async function handleRestructureSubmit(text: string): Promise<void> {
    setRestructureDialogOpen(false);
    setAiOutlineBusy(true);
    const result = await restructureText(text);
    setAiOutlineBusy(false);
    if (!result.ok) window.alert(result.message);
  }

  // §6.9 slice 6 (docs/phase6-full-parity-plan.md): Expand node + Suggest tags -- both real
  // legacy toolbar actions requiring exactly one selected node (matching legacy's own real
  // qb-ai-expand/qb-ai-tags; neither is in the right-click context menu at all, toolbar/Quick
  // Assist only -- Quick Assist itself doesn't exist in `web/` yet, §6.10).
  const [aiExpandTagsBusy, setAiExpandTagsBusy] = useState(false);
  // Not read directly below -- `selectedIds()` itself always returns live data regardless of
  // React's render cycle (it's a Zustand action calling `get()` at invocation time), but
  // `singleSelectedId`'s ENABLED/DISABLED rendering needs an actual re-render to reflect a
  // selection change, and neither `hasSelection` (a boolean, unchanged across most re-selections)
  // nor any other hook already subscribed here changes reference on every `clickNode` call.
  // Subscribing to `multiSelectedIds` directly (a fresh array reference on every selection
  // change) closes that gap -- same reasoning as `AiProviderSettings.tsx`'s own vault-state
  // subscription.
  useOutlineStore((s) => s.multiSelectedIds);
  const currentSelectedIds = selectedIds();
  const singleSelectedId = currentSelectedIds.length === 1 ? currentSelectedIds[0] : null;

  async function handleExpandNode(): Promise<void> {
    if (singleSelectedId === null) return;
    setAiExpandTagsBusy(true);
    const result = await expandNode(singleSelectedId);
    setAiExpandTagsBusy(false);
    if (!result.ok) window.alert(result.message);
  }

  async function handleSuggestTags(): Promise<void> {
    if (singleSelectedId === null) return;
    setAiExpandTagsBusy(true);
    const result = await suggestTags(singleSelectedId);
    setAiExpandTagsBusy(false);
    if (!result.ok) window.alert(result.message);
  }

  // §6.9 slice 7 (docs/phase6-full-parity-plan.md): Suggest icon. Matches legacy's real
  // `suggestIconForSelection`/`qb-ai-icon` toolbar button exactly: a deliberate multi-selection
  // (`currentSelectedIds.length > 1`) auto-applies as a batch, a single selection goes through the
  // picker-capable path (auto-applies directly when there's only one real candidate, otherwise
  // opens `IconPickerPopover.tsx` via `iconPickerStore.ts` for the person to choose). "Suggest
  // icons for all nodes" (`ai-icon-all`) is a separate whole-document action, matching legacy's
  // own real placement under the right-click "More" menu -- ported here to the toolbar instead
  // since `OutlineTree.tsx`'s own context menu doesn't have a "More" submenu at all yet (see that
  // component's own context-menu render comment for what's deliberately not built there).
  const [aiIconBusy, setAiIconBusy] = useState(false);
  const openIconPicker = useIconPickerStore((s) => s.open);

  async function handleSuggestIcon(): Promise<void> {
    if (!currentSelectedIds.length) return;
    setAiIconBusy(true);
    const outcome = await suggestIconForSelection(currentSelectedIds);
    setAiIconBusy(false);
    if (outcome.candidates && outcome.nodeId !== undefined) {
      openIconPicker(outcome.nodeId, outcome.candidates);
      return;
    }
    if (!outcome.ok) window.alert(outcome.message);
  }

  async function handleSuggestIconsAll(): Promise<void> {
    setAiIconBusy(true);
    const result = await suggestIconsForAllDocumentNodes();
    setAiIconBusy(false);
    if (!result.ok) window.alert(result.message);
  }

  // §6.9 slice 8 (docs/phase6-full-parity-plan.md): Summarise selection. Matches legacy's real
  // `qb-ai-summarise` toolbar button (`disabled=!multiCount`, index.html:20455) -- enabled only
  // with 2 or more nodes selected, since a new parent above a single node isn't a meaningful
  // "summary." Toolbar-only, same as Expand/Tags: legacy's own real context-menu AI group
  // (`CTX_ACTION_ORDER`) only ever includes Rewrite/Suggest icon, never Expand/Tags/Summarise.
  const [aiSummariseBusy, setAiSummariseBusy] = useState(false);

  async function handleSummariseSelection(): Promise<void> {
    setAiSummariseBusy(true);
    const result = await summariseSelectionIntoParent();
    setAiSummariseBusy(false);
    if (!result.ok) window.alert(result.message);
  }

  // Global keyboard shortcuts -- matches legacy's real Ctrl/Cmd+Shift+O (generateOutline) /
  // Ctrl/Cmd+Shift+R (restructureText) / Ctrl/Cmd+K (toggleQa) exactly (legacy/index.html's own
  // SHORTCUTS map, `mod+k` at legacy/index.html:27603). Unlike OutlineTree.tsx's own undo/redo
  // shortcut (scoped to that component's own onKeyDown, needing the tree container to hold DOM
  // focus), these are real app-wide shortcuts in legacy, so this uses a document-level listener
  // the same way OutlineTree.tsx's own context-menu Escape handling already does, just mounted
  // here since none of these three are tree-specific.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.key === 'o' || e.key === 'O') && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        void handleGenerateOutline();
      } else if ((e.key === 'r' || e.key === 'R') && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setRestructureDialogOpen(true);
      } else if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        // Matches legacy's real toggleQa() guard: no-op while Quick Assist itself is off.
        if (!useOutlinePrefsStore.getState().quickAssistEnabled) return;
        e.preventDefault();
        useQuickAssistStore.getState().toggleBox();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // §6.6 slice (docs/phase6-full-parity-plan.md), Audience View step 2: checked before every
  // other early-return branch, matching legacy's own real boot-time priority (its
  // `sakuraAudience=1` detection runs synchronously before any other markup even paints). See
  // AudienceWindow.tsx's own header for what this branch does and does not do yet.
  if (isAudienceWindow(window.location.search)) return <AudienceWindow />;

  // §6.5 slice (docs/phase6-full-parity-plan.md), Mobile Hub: below the breakpoint, this SPA
  // swaps in the dedicated mobile Hub experience entirely rather than squeezing the desktop
  // layout down -- see MobileHub.tsx's own header for the full reasoning.
  if (isMobile) return <MobileHub />;

  return (
    <>
      {/* §7.1 slice (docs/phase7-app-shell-and-dashboard-plan.md): the full-screen sign-in gate --
          see SignInGate.tsx's own header. Renders as a fixed-position overlay on top of the app
          below (which keeps booting underneath, matching legacy's own real behavior), and renders
          nothing once signed in, dismissed for this tab session, or while auth state is still
          resolving. */}
      <SignInGate />
      {/* §7.2 slice (docs/phase7-app-shell-and-dashboard-plan.md): the first-run onboarding
          modal -- see WelcomeModal.tsx's own header. Mounted alongside SignInGate at a LOWER
          z-index (1200 vs. the gate's 3000) rather than sequenced to open only after the gate is
          dismissed -- matches legacy's own real stacking behavior exactly (both overlays can be
          simultaneously "open" in the DOM; only the higher z-index one is actually visible), so
          no extra "wait for the gate to close" coordination logic is needed here. */}
      <WelcomeModal />
      <AppShell
        title="Sakura"
        zenMode={zenMode}
        floatingEditorChrome={
          /* §8.17 slice (docs/phase8-design-system-parity-plan.md): the editor pane's real
             floating chrome cluster -- reported directly by the user against the real live
             `/web-preview/` editor ("preview, toolbar, maximize editor buttons should be
             floating buttons, check the legacy"). §7.5/§8.6 only ever built one of legacy's real
             four floating buttons (toolbar-reveal, at the wrong offset for a lone button); this
             completes the set with `#editor-preview-toggle`/`#editor-pad-toggle`/
             `#editor-zen-toggle` (legacy/index.html:6566-6577) at their own real offsets
             (`.editor-preview-toggle`/`.editor-toolbar-toggle`/`.editor-pad-toggle`/
             `.editor-zen-toggle`, index.css). Passed as AppShell's own `floatingEditorChrome`
             prop (a sibling of `children` inside `#editor-pane`, not nested inside it) --
             see that prop's own header for the real layout bug this fixes: nested inside the
             outline's own wrapper, these anchored to the outline's intrinsic content height
             instead of `#editor-pane`'s real flex-filled height, landing right after the last
             node row on a short document instead of pinned to the bottom of the editing area.
             The old always-visible plain Edit/Preview/Present text-button row is gone -- legacy
             has no such row at all; Edit⇄Preview is this one toggle button, and Present is
             reached from INSIDE Preview (legacy's real `#preview-present-btn`, a "▶" button in
             Preview's own toolbar, not a top-level floating button) -- see PreviewPane.tsx's own
             header for that port. */
          <>
            <button
              type="button"
              className="editor-preview-toggle"
              onClick={() => setMode(mode === 'preview' ? 'edit' : 'preview')}
              title={mode === 'preview' ? 'Back to editing' : 'Preview (read-only)'}
              aria-label="Preview document"
              aria-pressed={mode === 'preview'}
            >
              <EditorPreviewToggleIcon width={14} height={14} />
            </button>
            <button
              type="button"
              className="editor-toolbar-toggle"
              onClick={() => setToolbarVisible(!toolbarVisible)}
              title={toolbarVisible ? 'Hide toolbar' : 'Show toolbar'}
              aria-label="Toggle toolbar"
              aria-pressed={toolbarVisible}
            >
              <EditorToolbarToggleIcon width={14} height={14} />
            </button>
            <button
              type="button"
              className="editor-pad-toggle"
              onClick={togglePadVisible}
              title="Toggle Pad (Ctrl/Cmd+Shift+P)"
              aria-label="Toggle Pad"
              aria-pressed={padVisible}
            >
              <EditorPadToggleIcon width={14} height={14} />
            </button>
            <button
              type="button"
              className="editor-zen-toggle"
              onClick={() => setZenMode(!zenMode)}
              title={zenMode ? 'Restore (Esc)' : 'Maximize editor (hide file explorer & chrome)'}
              aria-label="Maximize editor"
              aria-pressed={zenMode}
            >
              <EditorZenToggleIcon width={14} height={14} active={zenMode} />
            </button>
          </>
        }
        headerActions={
          <>
            {/* §6.10 slice 3 (docs/phase6-full-parity-plan.md), restructured (docs/phase8-design-
                system-parity-plan.md's 8.4m follow-up): Quick Assist -- first in header-actions,
                matching legacy's own real `#appbar-qa-slot`, the FIRST child of `#header-actions`
                (legacy/index.html:4533-4534). See QuickAssistBar.tsx's own header for what this
                covers and why it moved here from its old spot near the account menu. */}
            <QuickAssistBar openRestructureDialog={() => setRestructureDialogOpen(true)} />
            {/* §8.12 slice (docs/phase8-design-system-parity-plan.md): the theme toggle, System
                auto-theme, accent-color picker, and node-text-color picker all moved OUT of the
                header here -- see SettingsPanel.tsx's own "Theme" section header comment for
                where they live now and why. Legacy's real app-bar (legacy/index.html:4527-4607)
                has NO theme/color controls in it at all; every one of these lives inside
                `#settings-panel`'s own "Appearance" category (legacy/index.html:4674-4715), only
                ever built directly in the header here because this project's Settings panel
                didn't exist yet when §6.7 first wired these up. */}
            {/* §8.15 slice (docs/phase8-design-system-parity-plan.md): the sidebar-toggle button
                that used to live here is gone -- legacy's real toggle is genuinely a two-button
                split (a collapse button inside the sidebar itself, a reopen button in the tab-strip
                row), neither of which is the app-bar -- see SidebarFileExplorer.tsx/DocumentTabs.tsx
                for where the two real halves live now, and index.css's own correction comment on
                the mistaken assumption this single button used to rest on. Version History also
                moved out of here into the toolbar's own "History" group below, next to Undo/Redo --
                see that group for the real reasoning (legacy's own real entry point is the quick-bar's
                "Extras" dropdown, `#more-toggle`/`#more-version-history-btn`, never the app-bar). */}
            {/* §6.8 slice: notifications bell -- see NotificationBell.tsx's own header. */}
            <NotificationBell />
            {/* §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): the Hub launcher --
                direct port of legacy's real `#dock-panel-appbar-toggle`
                (legacy/index.html:4534) -- toggles the docked Hub panel (`HubDock.tsx`, rendered
                below in the main content column) open/closed, reopening whichever tab was open
                last (`hubDockStore.ts`'s own `lastTab`), matching legacy's real
                `toggleDockTab(dockActiveTab||dockLastTab)` exactly. */}
            <button
              type="button"
              onClick={() => toggleHubDockTab(hubDockActiveTab ?? hubDockLastTab)}
              title="Hub — To-Dos, Meetings, Journal, Library & Recap"
              aria-label="Open Hub"
              aria-pressed={hubDockActiveTab !== null}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>
            {/* §7.6 slice: Export/Import/Print, now a real `#appbar-more-toggle`-style menu --
                see ExportButtons.tsx's own header (added this slice) for exactly what moved and
                what stayed a documented simplification. */}
            <ExportButtons />
            {/* §8.15 slice (docs/phase8-design-system-parity-plan.md): the standalone Settings
                gear button that used to live here is gone -- reported directly by the user.
                Settings stays reachable only through AccountMenu.tsx's own "Settings" entry
                (`goToSettings`), which already calls this same `openSettings`/`settingsOpen`
                state. Note this is a deliberate simplification, not a parity port: legacy's real
                app-bar genuinely keeps BOTH a standalone `#settings-toggle` button AND a
                `#account-settings-btn` deep-link inside the account menu (legacy/index.html:
                4590, 4605-4607) -- confirmed no hide-by-default/media-query removes the standalone
                one. Kept as the user's own explicit call rather than reverted back to match legacy
                exactly. `SettingsPanel` now anchors off THIS wrapper (around the account button,
                its only real trigger left) instead of its own now-removed button -- matches
                legacy's own real re-anchoring behavior when Settings is opened from the account
                menu (`anchorMenuToButton(el('settings-panel'), el('account-toggle'))`,
                legacy/index.html:27258), not an invented position. */}
            <div style={{ position: 'relative' }}>
              {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} initialCategory={settingsCategory} />}
              {/* §7.6 slice: the real header account entry point -- see AccountMenu.tsx's own
                  header for what moved here from the old `AuthPanel.tsx` inline block (now
                  retired) and what it deliberately doesn't duplicate (the profile-visibility badge,
                  already real in Settings → Account). */}
              <AccountMenu onOpenSettings={openSettings} />
            </div>
          </>
        }
        tabBar={<DocumentTabs />}
        sidebar={<SidebarFileExplorer />}
        statusLeft={<span>Phase 6.2, in progress</span>}
        statusRight={
          <>
            {/* §6.9 slice 4 (docs/phase6-full-parity-plan.md): the auto-rewrite status chip --
                direct port of legacy's real sb-auto-rewrite-chip, a left-click toggle showing live
                queue/paused/rewriting state. */}
            <button type="button" onClick={() => setAutoRewriteEnabled(!autoRewriteEnabled)} title="Toggle auto-rewrite on commit" aria-pressed={autoRewriteEnabled} style={{ marginRight: 10 }}>
              {autoRewriteStatusText()}
            </button>
            <span>{mode}</span>
          </>
        }
        contentRef={registerScrollContainer}
      >
        {/* §7.5 slice (docs/phase7-app-shell-and-dashboard-plan.md): the real per-node action toolbar (legacy's own `#quick-bar`), hidden by
            default (matches legacy's real `toolbarVisible=false` first-run default -- this whole
            block used to render unconditionally, matching no real legacy default) and, once
            shown, laid out as labeled groups instead of one flat row (History/Structure/Format/
            Insert/AI/Delete -- see ToolbarGroup's own header). Legacy's real Move/Fold/Extras
            groups and Format's highlight/text-color swatches are deliberately NOT ported here:
            each needs a backing action `web/` doesn't have yet (move up/down, collapse-all,
            per-node highlight/color -- all three already named as real, separately-scoped gaps in
            docs/post-cutover-backlog.md), so building their toolbar buttons now would be dead UI,
            not a shortcut. Unlike legacy's own real default (which additionally hides
            Expand/Summarise/Tags/Icon within the AI group behind a Settings toggle `web/` has no
            equivalent of yet), every AI button stays visible here -- hiding already-shipped,
            already-tested capability with no way to reveal it back would be a real regression,
            not a faithful port of a default that itself depends on a toggle this project hasn't
            built. §8.4d retrofit (docs/phase8-design-system-parity-plan.md): the wrapper below is
            now the real `#quick-bar` container (index.css), with a real `.quick-sep` divider
            between each group, matching legacy's own structure exactly. Icon-only buttons (every
            group except AI) now render through `<Button variant="icon" className="quick-btn">`;
            the AI group's buttons deliberately keep their existing default (bordered, auto-width)
            styling instead of `.quick-btn`'s fixed 34x34 square, since -- unlike every other
            quick-bar button here and in legacy itself, which are icon-only -- they carry a real
            word label alongside the icon (an already-documented §7.5 simplification, not
            something this retrofit revisits) that a fixed-width icon square can't hold without
            clipping. */}
        {toolbarVisible && (
          <div id="quick-bar" style={{ marginBottom: 12 }}>
            <ToolbarGroup label="History">
              {/* ↶/↷ -- same icons and tooltip text as legacy's own #undo-btn/#redo-btn
                  (legacy/index.html:6359-6360). Undo/redo is core-outline scoped this slice
                  (outlineStore.ts's own header) -- disabled outside of edit mode, since Preview/
                  Present don't touch outline content at all. */}
              <Button variant="icon" className="quick-btn" onClick={undo} disabled={mode !== 'edit' || !canUndo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
                ↶
              </Button>
              <Button variant="icon" className="quick-btn" onClick={redo} disabled={mode !== 'edit' || !canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
                ↷
              </Button>
              {/* §8.15 slice (docs/phase8-design-system-parity-plan.md): Version History, moved
                  here from the app-bar -- reported directly by the user. Grouped with Undo/Redo
                  since both are "past states of this document" actions; legacy's own real entry
                  point for the currently-open document is actually the quick-bar's "Extras"
                  dropdown (`#more-toggle`/`#more-version-history-btn`, legacy/index.html:6489),
                  alongside Sort-top-level-nodes and Clear-all-nodes -- a real, separately-scoped
                  follow-up if that whole dropdown is ever wanted; this is a direct button in its
                  place rather than inventing the two unbuilt sort/clear actions just to house one
                  real button. Still hidden entirely with no document open, matching legacy's own
                  `if(currentDocId)` guard. */}
              {activeDocId && (
                <Button variant="icon" className="quick-btn" onClick={() => setVersionHistoryOpen(true)} title="Version history" aria-label="Version history">
                  <ClockIcon />
                </Button>
              )}
              {versionHistoryOpen && <VersionHistoryPanel onClose={() => setVersionHistoryOpen(false)} />}
            </ToolbarGroup>
            <span className="quick-sep" />
            <ToolbarGroup label="Structure">
              {/* Outdent/Indent/Insert-above/Add-child -- new in this slice, matching legacy's
                  real #qb-outdent/#qb-indent/#qb-above/#qb-child exactly. Each already had a real
                  outlineStore.ts action with no toolbar button until now (indentSelected/
                  outdentSelected operate on the whole current selection; insert-above/add-child
                  need a single target node, so they're scoped to exactly one selection like
                  legacy's own real cursor-context behavior). */}
              <Button variant="icon" className="quick-btn" onClick={outdentSelected} disabled={mode !== 'edit' || !hasSelection} title="Outdent (Shift+Tab)" aria-label="Outdent">
                ⇤
              </Button>
              <Button variant="icon" className="quick-btn" onClick={indentSelected} disabled={mode !== 'edit' || !hasSelection} title="Indent (Tab)" aria-label="Indent">
                ⇥
              </Button>
              <Button
                variant="icon"
                className="quick-btn"
                onClick={() => selectedId !== null && newSiblingAbove(selectedId)}
                disabled={mode !== 'edit' || selectedId === null}
                title="Insert node above"
                aria-label="Insert above"
              >
                ⤴
              </Button>
              <Button
                variant="icon"
                className="quick-btn"
                onClick={() => selectedId !== null && newChild(selectedId)}
                disabled={mode !== 'edit' || selectedId === null}
                title="Add child (Ctrl/Cmd+Enter)"
                aria-label="Add child"
              >
                ＋
              </Button>
              {/* ⧉ -- same icon and tooltip text as legacy's own #qb-duplicate
                  (legacy/index.html:6371). Duplicates the current selection's root(s); see
                  duplicateRootIndexesCore's own header (outlineStore.ts) for exact behavior,
                  including the deliberately-reproduced legacy quirk that checkbox/code-block/tag
                  state does NOT carry over to the duplicate. */}
              <Button variant="icon" className="quick-btn" onClick={duplicateSelected} disabled={mode !== 'edit' || !hasSelection} title="Duplicate" aria-label="Duplicate">
                ⧉
              </Button>
            </ToolbarGroup>
            <span className="quick-sep" />
            <ToolbarGroup label="Format">
              {/* B/I/U/S -- same visual treatment (<strong>B</strong>, <em>I</em>, <u>U</u>,
                  <s>S</s>) and tooltip text (including the Ctrl/Cmd shortcut hint) as legacy's
                  real `.fmt-btn` quick-bar buttons (legacy/index.html:6386-6389). Applies to
                  every currently-selected node directly (not root-subtree-cascading) via
                  outlineStore.ts's own toggleNodeStyle -- see that action's own header for the
                  exact multi-select semantics. */}
              <Button variant="icon" className="quick-btn" onClick={() => toggleNodeStyle('bold')} disabled={mode !== 'edit' || !hasSelection} title="Bold (Ctrl/Cmd+B)" aria-label="Bold">
                <strong>B</strong>
              </Button>
              <Button variant="icon" className="quick-btn" onClick={() => toggleNodeStyle('italic')} disabled={mode !== 'edit' || !hasSelection} title="Italic (Ctrl/Cmd+I)" aria-label="Italic">
                <em>I</em>
              </Button>
              <Button variant="icon" className="quick-btn" onClick={() => toggleNodeStyle('underline')} disabled={mode !== 'edit' || !hasSelection} title="Underline (Ctrl/Cmd+U)" aria-label="Underline">
                <u>U</u>
              </Button>
              <Button variant="icon" className="quick-btn" onClick={() => toggleNodeStyle('strike')} disabled={mode !== 'edit' || !hasSelection} title="Strike (Ctrl/Cmd+Shift+S)" aria-label="Strike">
                <s>S</s>
              </Button>
              {/* Heading level -- a plain <select> standing in for legacy's own custom popover
                  palette (legacy/index.html:6426-6444's real #heading-toggle-btn/#heading-palette
                  widget) -- same simplification this project uses elsewhere for palette-style
                  pickers (e.g. SidebarFileExplorer.tsx's own "move to folder" select in place of
                  drag-and-drop). Legacy's palette also offers a 7th "Section" option, but that
                  routes to an entirely different existing feature (the [Text] bracket
                  semantic-markup convention NodeText.tsx already renders), not a real numbered
                  heading level -- out of scope here, not silently dropped. */}
              <select
                value=""
                disabled={mode !== 'edit' || !hasSelection}
                onChange={(e) => {
                  const level = Number(e.currentTarget.value);
                  if (!Number.isNaN(level)) applyHeadingOption(level);
                  e.currentTarget.value = '';
                }}
                title="Heading style"
                aria-label="Heading style"
                style={{ fontSize: 12 }}
              >
                <option value="" disabled>
                  Heading…
                </option>
                <option value="0">Body text</option>
                <option value="1">Heading 1</option>
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
                <option value="4">Heading 4</option>
                <option value="5">Heading 5</option>
                <option value="6">Heading 6</option>
              </select>
            </ToolbarGroup>
            <span className="quick-sep" />
            <ToolbarGroup label="Insert">
              {/* Same icon (a checkmark-in-box SVG) and tooltip text as legacy's own real
                  #qb-checkbox toolbar button (legacy/index.html:6462) -- see outlineStore.ts's own
                  toggleCheckboxType header for the exact toggle semantics (any-checkbox-selected
                  removes from all; none-selected adds to all). */}
              <Button variant="icon" className="quick-btn" onClick={toggleCheckboxType} disabled={mode !== 'edit' || !hasSelection} title="Toggle checkbox on selected node" aria-label="Toggle checkbox">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M9 12l2.5 2.5L15 9" />
                </svg>
              </Button>
              {/* Note -- same purpose as legacy's real #qb-note (legacy/index.html:6461): open
                  the floating Note/Code panel for the selected node, always on its Note tab
                  (matching legacy's own "Note / comment on selected node" tooltip, a dedicated
                  entry point distinct from the per-row +note/+code toggles OutlineTree.tsx's own
                  rows already have). */}
              <Button
                variant="icon"
                className="quick-btn"
                onClick={() => selectedId !== null && openNotePanel(selectedId, false, false, 'note')}
                disabled={mode !== 'edit' || selectedId === null}
                title="Note / comment on selected node"
                aria-label="Note"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </Button>
            </ToolbarGroup>
            <span className="quick-sep" />
            <ToolbarGroup label="AI">
              {/* §8.2 correction (docs/phase8-design-system-parity-plan.md): this comment used to
                  claim "✦ -- same glyph legacy's own real qb-ai-rewrite button uses" -- checking
                  the real markup shows that's wrong: `#qb-ai-rewrite` renders a real sparkle
                  `<svg>` (legacy/index.html:6473), never a plain "✦" character; every text-label AI
                  entry point (context menu, command palette) pairs the same real SVG with its own
                  label too, never a bare glyph substitute. `<SparkleIcon />` below is that real
                  icon, ported. Rewrites the current selection (single node or a whole multi-select
                  batch) via aiRewrite.ts. */}
              <button type="button" onClick={handleAiRewrite} disabled={mode !== 'edit' || !hasSelection || aiRewriteBusy} title="AI Rewrite" aria-label="AI Rewrite" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon width={12} height={12} /> {aiRewriteBusy ? 'Rewriting…' : 'Rewrite'}
              </button>
              {/* Generate Outline (Ctrl/Cmd+Shift+O) -- nests the AI-generated outline as
                  children of the current selection, or replaces an empty document. */}
              <button type="button" onClick={() => void handleGenerateOutline()} disabled={mode !== 'edit' || aiOutlineBusy} title="Generate Outline with AI (Ctrl/Cmd+Shift+O)" aria-label="Generate Outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon width={12} height={12} /> {aiOutlineBusy ? 'Working…' : 'Outline'}
              </button>
              {/* Restructure Text (Ctrl/Cmd+Shift+R) -- always lands in a brand-new
                  document. */}
              <button type="button" onClick={() => setRestructureDialogOpen(true)} disabled={mode !== 'edit' || aiOutlineBusy} title="Restructure Text into a Tree (Ctrl/Cmd+Shift+R)" aria-label="Restructure Text" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon width={12} height={12} /> Restructure
              </button>
              {/* Expand node / Suggest tags -- both require exactly one selected node. */}
              <button type="button" onClick={() => void handleExpandNode()} disabled={mode !== 'edit' || singleSelectedId === null || aiExpandTagsBusy} title="Expand node with AI" aria-label="Expand Node" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon width={12} height={12} /> Expand
              </button>
              <button type="button" onClick={() => void handleSuggestTags()} disabled={mode !== 'edit' || singleSelectedId === null || aiExpandTagsBusy} title="Suggest tags with AI" aria-label="Suggest Tags" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon width={12} height={12} /> Tags
              </button>
              {/* Suggest icon -- a multi-selection auto-applies as a batch; a single selection
                  may open IconPickerPopover.tsx if there's more than one real candidate to choose
                  from. */}
              <button type="button" onClick={() => void handleSuggestIcon()} disabled={mode !== 'edit' || !currentSelectedIds.length || aiIconBusy} title="Suggest icon with AI" aria-label="Suggest Icon" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon width={12} height={12} /> Icon
              </button>
              {/* Suggest icons for all nodes -- matches legacy's real ai-icon-all
                  whole-document action, always auto-applying as a batch. */}
              <button type="button" onClick={() => void handleSuggestIconsAll()} disabled={mode !== 'edit' || aiIconBusy} title="Suggest icons for all nodes with AI" aria-label="Suggest Icons for All Nodes" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon width={12} height={12} /> Icons (all)
              </button>
              {/* Summarise selection -- inserts an AI-written parent label above 2+ selected
                  roots, indenting their whole subtrees underneath. */}
              <button type="button" onClick={() => void handleSummariseSelection()} disabled={mode !== 'edit' || currentSelectedIds.length < 2 || aiSummariseBusy} title="Summarise selection into a parent node with AI" aria-label="Summarise Selection" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <SparkleIcon width={12} height={12} /> Summarise
              </button>
            </ToolbarGroup>
            <span className="quick-sep" />
            <ToolbarGroup label="Delete">
              {/* Same icon and tooltip text as legacy's own real #qb-delete
                  (legacy/index.html:6482). `danger-hover` matches legacy's own real class on this
                  same button (legacy/index.html:6482, `.quick-btn.danger-hover:hover`) -- a red
                  hover treatment none of the other quick-bar buttons get. Deletes every
                  currently-selected node's whole subtree -- see outlineStore.ts's own
                  deleteSelected header for exact semantics. */}
              <Button variant="icon" className="quick-btn danger-hover" onClick={deleteSelected} disabled={mode !== 'edit' || !hasSelection} title="Delete (Del)" aria-label="Delete">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </Button>
            </ToolbarGroup>
          </div>
        )}
        <ul style={{ fontSize: '0.9em', color: '#555' }}>
          <li>Click to select, double-click to edit</li>
          <li>
            <kbd>Enter</kbd> — new sibling below; <kbd>Ctrl/Cmd+Enter</kbd> — new child
          </li>
          <li>
            <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> — indent / outdent
          </li>
          <li>
            <kbd>Backspace</kbd> on empty text — delete the node
          </li>
          <li>Click the ▾/▸ arrow to collapse/expand a subtree</li>
          <li>
            Drag a row onto another — top third = above, bottom third = below, middle third =
            nest as child
          </li>
          <li>
            Semantic markup: <code>[Section]</code>, <code>(note)</code>, <code>!alert</code>,{' '}
            <code>`code`</code> — matches legacy's real styling, delimiters hidden
          </li>
        </ul>
        {/* §7.4 slice (docs/phase7-app-shell-and-dashboard-plan.md): the per-document header row
            (title + status/author/link chips) -- see DocumentHeader.tsx's own header. Always
            present above whichever content pane is active, matching legacy's own real DOM order
            (`#editor-title-row` is the first child of `#editor-wrap`, before the node rows). */}
        <DocumentHeader />
        {mode === 'edit' ? <OutlineTree /> : mode === 'preview' ? <PreviewPane onEnterPresenter={() => setMode('present')} /> : <PresenterMode />}
        <NotePanel />
        {/* §8.17 slice: gated on `padVisible` now, matching legacy's real `padOpen`-gated
            `#pad-panel` (legacy/index.html:40295-40301's own `updatePadVisibility`) -- the Sync
            section below is NOT part of that gate: it's a `web/`-only affordance for the
            not-yet-built cloud-sync feature with no real legacy element to match (confirmed no
            `#pad-panel`-nested or `padOpen`-gated "Sync" heading exists anywhere in legacy),
            so it keeps its prior always-visible behavior rather than an invented coupling. */}
        {padVisible && (
          <div style={{ marginTop: 16 }}>
            <PadPanel />
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: 16 }}>Sync</h2>
          <DocSyncPanel />
        </div>
        {restructureDialogOpen && <RestructureTextDialog onSubmit={(text) => void handleRestructureSubmit(text)} onCancel={() => setRestructureDialogOpen(false)} />}
        <IconPickerPopover />
      </AppShell>
      {/* §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): the docked Hub -- see
          HubDock.tsx's own header. Renders nothing (`null`) while closed, same convention every
          other conditionally-rendered overlay in this file already uses. Mounted as a sibling of
          AppShell, not inside it, since it's a fixed-position overlay rather than part of
          AppShell's own content flow (see HubDock.tsx's own header for why). */}
      <HubDock />
    </>
  );
}
