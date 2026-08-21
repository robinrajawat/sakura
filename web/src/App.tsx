import { useCounterStore } from './counterStore';

/**
 * Phase 0 placeholder. Deliberately minimal — this component exists only to prove the
 * toolchain (React + Vite + TypeScript + Zustand) works end to end inside the new
 * workspace, not as any real Sakura UI. It gets replaced entirely once Phase 2's outline
 * tree spike starts (docs/framework-migration-plan.md).
 */
export function App() {
  const { count, increment } = useCounterStore();

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>Sakura (web) — Phase 0 scaffold</h1>
      <p>
        This is not the real app. It exists to prove the React + Vite + TypeScript +
        Zustand toolchain builds and runs correctly inside the new{' '}
        <code>web/</code> workspace before any real UI work starts.
      </p>
      <p>
        Zustand store round-trip check: <button onClick={increment}>count is {count}</button>
      </p>
    </div>
  );
}
