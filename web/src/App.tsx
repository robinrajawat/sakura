import { useState } from 'react';
import { OutlineTree } from './components/OutlineTree';
import { PreviewPane } from './components/PreviewPane';
import { PresenterMode } from './components/PresenterMode';
import { ExportButtons } from './components/ExportButtons';
import { PadPanel } from './components/PadPanel';
import { HubTodosPanel } from './components/HubTodosPanel';

/**
 * Phase 3 in progress (docs/framework-migration-plan.md). Edit/Preview/Present toggle -- the
 * simplest possible entry point for each mode (see each component's own header for what's
 * deliberately not in scope yet). Still not the real Sakura UI shell.
 */
export function App() {
  const [mode, setMode] = useState<'edit' | 'preview' | 'present'>('edit');

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Sakura (web) — Phase 3, in progress</h1>
      <div style={{ marginBottom: 12 }}>
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
    </div>
  );
}


