import { create } from 'zustand';

/**
 * Phase 0 placeholder store — exists only to prove Zustand is wired correctly end to end
 * (typecheck, build, and a real render+interaction in the browser). The real stores start
 * at Phase 1, porting the existing src/state/*.ts modules from legacy/ into this shape.
 */
interface CounterState {
  count: number;
  increment: () => void;
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 }))
}));
