import { describe, expect, it, beforeEach } from 'vitest';
import { useCounterStore } from './counterStore';

// Phase 0 placeholder test — proves Vitest runs correctly against a Zustand store inside
// web/, same toolchain-validation purpose as counterStore.ts itself. Real test coverage
// starts at Phase 1, alongside the ported src/state/*.ts stores.
describe('counterStore (Phase 0 toolchain validation)', () => {
  beforeEach(() => {
    useCounterStore.setState({ count: 0 });
  });

  it('starts at 0', () => {
    expect(useCounterStore.getState().count).toBe(0);
  });

  it('increments correctly', () => {
    useCounterStore.getState().increment();
    expect(useCounterStore.getState().count).toBe(1);
  });
});
