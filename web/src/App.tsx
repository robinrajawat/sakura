import { useState } from 'react';
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
import { useThemeStore } from './store/themeStore';
import { MobileHub } from './components/MobileHub';
import { useIsMobileViewport } from './utils/useIsMobileViewport';

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
  const isMobile = useIsMobileViewport();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
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
        </>
      }
      tabBar={<DocumentTabs />}
      sidebar={<SidebarFileExplorer />}
      statusLeft={<span>Phase 6.2, in progress</span>}
      statusRight={<span>{mode}</span>}
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
    </AppShell>
  );
}
