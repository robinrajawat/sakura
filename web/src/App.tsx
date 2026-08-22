import { OutlineTree } from './components/OutlineTree';

/**
 * Phase 0's validation spike, now carrying Phase 2's first slice
 * (docs/framework-migration-plan.md). Real create/edit/delete/fold, still wired to the
 * ported core logic, still not the real Sakura UI — gets replaced as Phase 2 continues.
 */
export function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Sakura (web) — Phase 2, in progress</h1>
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
      <OutlineTree />
    </div>
  );
}


