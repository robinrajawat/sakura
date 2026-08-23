import { useState } from 'react';
import { AppShell } from './components/AppShell';
import { SidebarFileExplorer } from './components/SidebarFileExplorer';
import { OutlineTree } from './components/OutlineTree';
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
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const registerScrollContainer = useDocumentsStore((s) => s.registerScrollContainer);
  const sidebarOpen = useSidebarStore((s) => s.open);
  const toggleSidebarOpen = useSidebarStore((s) => s.toggleOpen);
  const undo = useOutlineStore((s) => s.undo);
  const redo = useOutlineStore((s) => s.redo);
  const canUndo = useOutlineStore((s) => s.canUndo());
  const canRedo = useOutlineStore((s) => s.canRedo());

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
