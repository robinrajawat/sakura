import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOutlineStore } from './outlineStore';

// §6.8 slice: `idbKv.ts` wraps the raw browser `indexedDB` API, which jsdom (this project's test
// environment) doesn't implement at all (`typeof indexedDB` is `undefined` here) -- mocking the
// module boundary here, the same "mock the platform/SDK boundary, test the store's own
// orchestration logic" approach `docSyncStore.test.ts` already established for
// `firebase/firestore`, lets these tests exercise `backupStore.ts`'s real debounce/key-naming/
// restore logic without needing a real IndexedDB. The raw `idbKv.ts` helper itself (a thin,
// direct port of legacy's own `idbOpen`/`idbGet`/`idbSet`) is verified separately in real
// headless Chrome instead, where real IndexedDB actually exists.
const mockIdbSet = vi.fn().mockResolvedValue(true);
const mockIdbGet = vi.fn();

vi.mock('../utils/idbKv', () => ({
  idbSet: (...args: unknown[]) => mockIdbSet(...args),
  idbGet: (...args: unknown[]) => mockIdbGet(...args)
}));

import { useBackupStore } from './backupStore';

describe('backupStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockIdbSet.mockClear();
    mockIdbGet.mockReset();
    mockIdbGet.mockResolvedValue(undefined);
    localStorage.clear();
    useBackupStore.setState({ lastSavedAt: null, loaded: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('init() mirrors immediately on mount, matching legacy\'s own startup mirrorToIndexedDb() call', async () => {
    localStorage.setItem('sakura_web_theme', 'dark');
    useBackupStore.getState().init();
    await vi.waitFor(() => expect(mockIdbSet).toHaveBeenCalledTimes(1));
    const [key, entry] = mockIdbSet.mock.calls[0];
    expect(key).toBe('localStorageMirror');
    expect((entry as { payload: { data: Record<string, string> } }).payload.data).toEqual({ sakura_web_theme: 'dark' });
  });

  it('init() is idempotent -- calling it twice only registers one outline subscription', async () => {
    useBackupStore.getState().init();
    await vi.waitFor(() => expect(mockIdbSet).toHaveBeenCalledTimes(1));
    useBackupStore.getState().init();
    mockIdbSet.mockClear();

    useOutlineStore.setState({ nodes: [{ ...useOutlineStore.getState().nodes[0], text: 'edited' }] });
    await vi.advanceTimersByTimeAsync(1200);
    // If init() had registered the subscription twice, this would fire twice.
    expect(mockIdbSet).toHaveBeenCalledTimes(1);
  });

  it('queues a mirror write 1200ms after an outline edit settles, matching legacy\'s real scheduleBackupWrite timer', async () => {
    useBackupStore.getState().init();
    await vi.waitFor(() => expect(mockIdbSet).toHaveBeenCalledTimes(1));
    mockIdbSet.mockClear();

    useOutlineStore.setState({ nodes: [{ ...useOutlineStore.getState().nodes[0], text: 'edited' }] });
    await vi.advanceTimersByTimeAsync(1199);
    expect(mockIdbSet).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockIdbSet).toHaveBeenCalledTimes(1);
  });

  it('refreshStatus() reads the stored savedAt into lastSavedAt', async () => {
    mockIdbGet.mockResolvedValue({ payload: { data: {} }, savedAt: 5000 });
    await useBackupStore.getState().refreshStatus();
    expect(useBackupStore.getState().lastSavedAt).toBe(5000);
  });

  it('refreshStatus() leaves lastSavedAt null when there is no safety copy yet', async () => {
    mockIdbGet.mockResolvedValue(undefined);
    await useBackupStore.getState().refreshStatus();
    expect(useBackupStore.getState().lastSavedAt).toBeNull();
  });

  it('restoreFromSafetyCopy() clears localStorage and writes back every entry from the mirror', async () => {
    localStorage.setItem('stale_key', 'should be gone');
    mockIdbGet.mockResolvedValue({
      payload: { data: { sakura_web_theme: 'light', sakura_web_docs_index: '[]' } },
      savedAt: 1000
    });
    const restored = await useBackupStore.getState().restoreFromSafetyCopy();
    expect(restored).toBe(true);
    expect(localStorage.getItem('stale_key')).toBeNull();
    expect(localStorage.getItem('sakura_web_theme')).toBe('light');
    expect(localStorage.getItem('sakura_web_docs_index')).toBe('[]');
  });

  it('restoreFromSafetyCopy() returns false and leaves localStorage untouched when there is no safety copy', async () => {
    localStorage.setItem('kept', 'yes');
    mockIdbGet.mockResolvedValue(undefined);
    const restored = await useBackupStore.getState().restoreFromSafetyCopy();
    expect(restored).toBe(false);
    expect(localStorage.getItem('kept')).toBe('yes');
  });
});
