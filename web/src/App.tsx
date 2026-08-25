import { useState, useEffect } from 'react';
import { AppShell } from './components/AppShell';
import { SidebarFileExplorer } from './components/SidebarFileExplorer';
import { OutlineTree } from './components/OutlineTree';
import { NotePanel } from './components/NotePanel';
import { useOutlineStore } from './store/outlineStore';
import { DocumentTabs } from './components/DocumentTabs';
import { useDocumentsStore } from './store/documentsStore';
import { useSidebarStore } from './store/sidebarStore';
import { PreviewPane } from './components/PreviewPane';
import { PresenterMode } from './components/PresenterMode';
import { ExportButtons } from './components/ExportButtons';
import { PadPanel } from './components/PadPanel';
import { HubTodosPanel } from './components/HubTodosPanel';
import { HubJournalPanel } from './components/HubJournalPanel';
import { HubMeetingsPanel } from './components/HubMeetingsPanel';
import { HubLibraryPanel } from './components/HubLibraryPanel';
import { HubRecapPanel } from './components/HubRecapPanel';
import { AuthPanel } from './components/AuthPanel';
import { DocSyncPanel } from './components/DocSyncPanel';
import {
  useThemeStore,
  ACCENT_PRESETS,
  ACCENT_PRESET_ORDER,
  ACCENT_PRESET_LABELS,
  NODE_FONT_COLOR_PRESETS,
  NODE_FONT_COLOR_PRESET_ORDER,
  NODE_FONT_COLOR_PRESET_LABELS
} from './store/themeStore';
import { MobileHub } from './components/MobileHub';
import { useIsMobileViewport } from './utils/useIsMobileViewport';
import { SettingsPanel } from './components/SettingsPanel';
import { AudienceWindow } from './components/AudienceWindow';
import { isAudienceWindow } from './state/audienceMode';
import { rewriteNode, rewriteNodes } from './state/aiRewrite';
import { useAutoRewriteStore } from './store/autoRewriteStore';
import { generateOutline, restructureText } from './state/aiOutline';
import { expandNode, suggestTags } from './state/aiExpandTags';
import { RestructureTextDialog } from './components/RestructureTextDialog';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useIsMobileViewport();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const accentPreset = useThemeStore((s) => s.accentPreset);
  const setAccentPreset = useThemeStore((s) => s.setAccentPreset);
  const themeMode = useThemeStore((s) => s.themeMode);
  const setThemeMode = useThemeStore((s) => s.setThemeMode);
  const nodeFontColorPreset = useThemeStore((s) => s.nodeFontColorPreset);
  const setNodeFontColorPreset = useThemeStore((s) => s.setNodeFontColorPreset);
  const registerScrollContainer = useDocumentsStore((s) => s.registerScrollContainer);
  const sidebarOpen = useSidebarStore((s) => s.open);
  const toggleSidebarOpen = useSidebarStore((s) => s.toggleOpen);
  const undo = useOutlineStore((s) => s.undo);
  const redo = useOutlineStore((s) => s.redo);
  const canUndo = useOutlineStore((s) => s.canUndo());
  const canRedo = useOutlineStore((s) => s.canRedo());
  const duplicateSelected = useOutlineStore((s) => s.duplicateSelected);
  const hasSelection = useOutlineStore((s) => s.selectedId !== null);
  const toggleNodeStyle = useOutlineStore((s) => s.toggleNodeStyle);
  const applyHeadingOption = useOutlineStore((s) => s.applyHeadingOption);
  const toggleCheckboxType = useOutlineStore((s) => s.toggleCheckboxType);
  const selectedIds = useOutlineStore((s) => s.selectedIds);
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

  // Global keyboard shortcuts -- matches legacy's real Ctrl/Cmd+Shift+O (generateOutline) /
  // Ctrl/Cmd+Shift+R (restructureText) exactly (legacy/index.html's own SHORTCUTS map). Unlike
  // OutlineTree.tsx's own undo/redo shortcut (scoped to that component's own onKeyDown, needing
  // the tree container to hold DOM focus), these are real app-wide shortcuts in legacy, so this
  // uses a document-level listener the same way OutlineTree.tsx's own context-menu Escape
  // handling already does, just mounted here since neither AI action is tree-specific.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if ((e.key === 'o' || e.key === 'O') && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        void handleGenerateOutline();
      } else if ((e.key === 'r' || e.key === 'R') && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setRestructureDialogOpen(true);
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
    <AppShell
      title="Sakura"
      headerActions={
        <>
          <button
            type="button"
            onClick={toggleSidebarOpen}
            title="Toggle file explorer"
            aria-pressed={sidebarOpen}
          >
            ▤
          </button>
          <button type="button" onClick={toggleTheme} title="Toggle theme">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          {/* §6.7 slice (docs/phase6-full-parity-plan.md): System auto-theme. Direct port of
              legacy's real two-mode `setThemeMode`/`applyAutoTheme` (`themeStore.ts`'s own
              header comment has the full story, including why there's no third "Schedule" mode
              despite a leftover legacy comment mentioning one -- it doesn't actually exist in
              legacy's real code either). Clicking the theme button above still works while this
              is on -- it starts a temporary override, matching legacy's real UX, until the OS
              preference naturally catches up and agrees with it again. */}
          <button
            type="button"
            onClick={() => setThemeMode(themeMode === 'system' ? 'manual' : 'system')}
            title="Follow system theme"
            aria-pressed={themeMode === 'system'}
          >
            🖥️
          </button>
          {/* §6.7 slice (docs/phase6-full-parity-plan.md): accent-color picker. Direct port of
              legacy's real `#accent-swatch-row` (legacy/index.html:4695-4703) -- same 7 presets,
              same order, same radiogroup semantics -- as a small round-button row next to the
              theme toggle rather than inside a dedicated Settings panel, since `web/` has no
              Settings surface at all yet (a real, separately-scoped follow-up covering every
              other toggle this phase and later ones reference, not just this one). The
              `setAccentPreset` action itself has existed since Phase 6.1; this is the first UI
              that actually calls it. */}
          <div role="radiogroup" aria-label="Accent color" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {ACCENT_PRESET_ORDER.map((preset) => (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={accentPreset === preset}
                aria-label={ACCENT_PRESET_LABELS[preset]}
                title={ACCENT_PRESET_LABELS[preset]}
                onClick={() => setAccentPreset(preset)}
                style={{
                  width: 16,
                  height: 16,
                  padding: 0,
                  borderRadius: '50%',
                  border: accentPreset === preset ? '2px solid currentColor' : '1px solid transparent',
                  background: ACCENT_PRESETS[preset][theme],
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
          {/* §6.7 slice (docs/phase6-full-parity-plan.md): node-text-color picker. Direct port of
              legacy's real `#node-font-swatch-row` (legacy/index.html:4707-4711) -- a separate
              color axis from accent above (this one recolors node text itself, `--node-fg`, not
              the accent highlight), same 4 presets/order/radiogroup semantics. Unlike the accent
              picker, `setNodeFontColorPreset` itself is new in this slice, not just its UI --
              `web/` had no node-text-color axis at all before this. */}
          <div role="radiogroup" aria-label="Node text color" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {NODE_FONT_COLOR_PRESET_ORDER.map((preset) => (
              <button
                key={preset}
                type="button"
                role="radio"
                aria-checked={nodeFontColorPreset === preset}
                aria-label={NODE_FONT_COLOR_PRESET_LABELS[preset]}
                title={NODE_FONT_COLOR_PRESET_LABELS[preset]}
                onClick={() => setNodeFontColorPreset(preset)}
                style={{
                  width: 16,
                  height: 16,
                  padding: 0,
                  borderRadius: '50%',
                  border: nodeFontColorPreset === preset ? '2px solid currentColor' : '1px solid transparent',
                  background: NODE_FONT_COLOR_PRESETS[preset][theme],
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
          {/* §6.7/§6.10 slice (docs/phase6-full-parity-plan.md): `web/`'s first real Settings
              surface. Direct port of legacy's real `.settings-wrap{position:relative}` +
              button-anchored dropdown UX (legacy/index.html:392-394, 4606-4607) -- see
              SettingsPanel.tsx's own header for exactly what it holds and why it's deliberately
              minimal (a single flat section, not legacy's own multi-category rail). */}
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setSettingsOpen((open) => !open)} title="Settings" aria-pressed={settingsOpen}>
              ⚙
            </button>
            {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
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
      <div style={{ marginBottom: 12 }}>
        {/* ↶/↷ -- same icons and tooltip text as legacy's own #undo-btn/#redo-btn
            (legacy/index.html:6359-6360). Undo/redo is core-outline scoped this slice
            (outlineStore.ts's own header) -- disabled outside of edit mode, since Preview/
            Present don't touch outline content at all. */}
        <button
          type="button"
          onClick={undo}
          disabled={mode !== 'edit' || !canUndo}
          title="Undo (Ctrl/Cmd+Z)"
          aria-label="Undo"
          style={{ marginRight: 4 }}
        >
          ↶
        </button>
        <button
          type="button"
          onClick={redo}
          disabled={mode !== 'edit' || !canRedo}
          title="Redo (Ctrl/Cmd+Shift+Z)"
          aria-label="Redo"
          style={{ marginRight: 12 }}
        >
          ↷
        </button>
        {/* ⧉ -- same icon and tooltip text as legacy's own #qb-duplicate
            (legacy/index.html:6371). Duplicates the current selection's root(s); see
            duplicateRootIndexesCore's own header (outlineStore.ts) for exact behavior,
            including the deliberately-reproduced legacy quirk that checkbox/code-block/tag
            state does NOT carry over to the duplicate. */}
        <button
          type="button"
          onClick={duplicateSelected}
          disabled={mode !== 'edit' || !hasSelection}
          title="Duplicate"
          aria-label="Duplicate"
          style={{ marginRight: 12 }}
        >
          ⧉
        </button>
        {/* B/I/U/S -- same visual treatment (<strong>B</strong>, <em>I</em>, <u>U</u>, <s>S</s>)
            and tooltip text (including the Ctrl/Cmd shortcut hint) as legacy's own real
            `.fmt-btn` quick-bar buttons (legacy/index.html:6386-6389). Applies to every
            currently-selected node directly (not root-subtree-cascading) via
            outlineStore.ts's own toggleNodeStyle -- see that action's own header for the exact
            multi-select semantics. */}
        <button
          type="button"
          onClick={() => toggleNodeStyle('bold')}
          disabled={mode !== 'edit' || !hasSelection}
          title="Bold (Ctrl/Cmd+B)"
          aria-label="Bold"
          style={{ marginRight: 2 }}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => toggleNodeStyle('italic')}
          disabled={mode !== 'edit' || !hasSelection}
          title="Italic (Ctrl/Cmd+I)"
          aria-label="Italic"
          style={{ marginRight: 2 }}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => toggleNodeStyle('underline')}
          disabled={mode !== 'edit' || !hasSelection}
          title="Underline (Ctrl/Cmd+U)"
          aria-label="Underline"
          style={{ marginRight: 2 }}
        >
          <u>U</u>
        </button>
        <button
          type="button"
          onClick={() => toggleNodeStyle('strike')}
          disabled={mode !== 'edit' || !hasSelection}
          title="Strike (Ctrl/Cmd+Shift+S)"
          aria-label="Strike"
          style={{ marginRight: 6 }}
        >
          <s>S</s>
        </button>
        {/* Heading level -- a plain <select> standing in for legacy's own custom popover palette
            (legacy/index.html:6426-6444's real #heading-toggle-btn/#heading-palette widget) --
            same simplification this project uses elsewhere for palette-style pickers (e.g.
            SidebarFileExplorer.tsx's own "move to folder" select in place of drag-and-drop).
            Legacy's palette also offers a 7th "Section" option, but that routes to an entirely
            different existing feature (the [Text] bracket semantic-markup convention
            NodeText.tsx already renders), not a real numbered heading level -- out of scope
            here, not silently dropped. */}
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
          style={{ marginRight: 12, fontSize: 12 }}
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
        {/* Same icon (a checkmark-in-box SVG) and tooltip text as legacy's own real
            #qb-checkbox toolbar button (legacy/index.html:6462) -- see
            outlineStore.ts's own toggleCheckboxType header for the exact toggle semantics
            (any-checkbox-selected removes from all; none-selected adds to all). */}
        <button
          type="button"
          onClick={toggleCheckboxType}
          disabled={mode !== 'edit' || !hasSelection}
          title="Toggle checkbox on selected node"
          aria-label="Toggle checkbox"
          style={{ marginRight: 12 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M9 12l2.5 2.5L15 9" />
          </svg>
        </button>
        {/* ✦ -- same glyph legacy's own real qb-ai-rewrite button uses. Rewrites the current
            selection (single node or a whole multi-select batch) via aiRewrite.ts. */}
        <button type="button" onClick={handleAiRewrite} disabled={mode !== 'edit' || !hasSelection || aiRewriteBusy} title="AI Rewrite" aria-label="AI Rewrite" style={{ marginRight: 4 }}>
          {aiRewriteBusy ? '✦ Rewriting…' : '✦ Rewrite'}
        </button>
        {/* ✦ Generate Outline (Ctrl/Cmd+Shift+O) -- nests the AI-generated outline as children of
            the current selection, or replaces an empty document. */}
        <button type="button" onClick={() => void handleGenerateOutline()} disabled={mode !== 'edit' || aiOutlineBusy} title="Generate Outline with AI (Ctrl/Cmd+Shift+O)" aria-label="Generate Outline" style={{ marginRight: 4 }}>
          {aiOutlineBusy ? '✦ Working…' : '✦ Outline'}
        </button>
        {/* ✦ Restructure Text (Ctrl/Cmd+Shift+R) -- always lands in a brand-new document. */}
        <button type="button" onClick={() => setRestructureDialogOpen(true)} disabled={mode !== 'edit' || aiOutlineBusy} title="Restructure Text into a Tree (Ctrl/Cmd+Shift+R)" aria-label="Restructure Text" style={{ marginRight: 4 }}>
          ✦ Restructure
        </button>
        {/* ✦ Expand node / ✦ Suggest tags -- both require exactly one selected node. */}
        <button type="button" onClick={() => void handleExpandNode()} disabled={mode !== 'edit' || singleSelectedId === null || aiExpandTagsBusy} title="Expand node with AI" aria-label="Expand Node" style={{ marginRight: 4 }}>
          ✦ Expand
        </button>
        <button type="button" onClick={() => void handleSuggestTags()} disabled={mode !== 'edit' || singleSelectedId === null || aiExpandTagsBusy} title="Suggest tags with AI" aria-label="Suggest Tags" style={{ marginRight: 12 }}>
          ✦ Tags
        </button>
        <button type="button" onClick={() => setMode('edit')} disabled={mode === 'edit'} style={{ marginRight: 6 }}>
          Edit
        </button>
        <button type="button" onClick={() => setMode('preview')} disabled={mode === 'preview'} style={{ marginRight: 6 }}>
          Preview
        </button>
        <button type="button" onClick={() => setMode('present')} disabled={mode === 'present'}>
          Present
        </button>
      </div>
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
      {mode === 'edit' ? <OutlineTree /> : mode === 'preview' ? <PreviewPane /> : <PresenterMode />}
      <NotePanel />
      <div style={{ marginTop: 16 }}>
        <ExportButtons />
      </div>
      <div style={{ marginTop: 16 }}>
        <PadPanel />
      </div>
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Hub — To-Dos</h2>
        <HubTodosPanel />
      </div>
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Hub — Journal</h2>
        <HubJournalPanel />
      </div>
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Hub — Meeting Notes</h2>
        <HubMeetingsPanel />
      </div>
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Hub — Library</h2>
        <HubLibraryPanel />
      </div>
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Hub — Recap</h2>
        <HubRecapPanel />
      </div>
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Account</h2>
        <AuthPanel />
      </div>
      <div style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 16 }}>Sync</h2>
        <DocSyncPanel />
      </div>
      {restructureDialogOpen && <RestructureTextDialog onSubmit={(text) => void handleRestructureSubmit(text)} onCancel={() => setRestructureDialogOpen(false)} />}
    </AppShell>
  );
}
