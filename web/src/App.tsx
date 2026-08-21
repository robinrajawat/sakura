import { OutlineTree } from './components/OutlineTree';

/**
 * Phase 0 validation spike (docs/framework-migration-plan.md). This is the outline tree
 * spike itself, not real Sakura UI — it exists to prove React + Vite + TypeScript + Zustand,
 * wired to the real ported nodeMutations/nodeQueries/nodeSelection core logic, can render,
 * select, indent/outdent, and drag-reorder a tree without friction. It gets replaced entirely
 * once Phase 2 starts building the real editor, informed by whatever this spike surfaces.
 */
export function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 640 }}>
      <h1>Sakura (web) — Phase 0 validation spike</h1>
      <p>
        Click a row to select it, then <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> to indent/outdent.
        Drag a row onto another to reorder it (drop on the top half to go above, the bottom
        half to go below).
      </p>
      <OutlineTree />
    </div>
  );
}

