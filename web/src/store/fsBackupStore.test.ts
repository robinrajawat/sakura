import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// §6.8 slice: mocking `idbKv.ts`'s module boundary, matching backupStore.test.ts's own
// established precedent (jsdom has no real IndexedDB). `supported` is computed once at module
// load from `typeof window.showSaveFilePicker`, so the "supported" behaviors below need
// `window.showSaveFilePicker` set BEFORE the module is first imported -- `vi.resetModules()` +
// a fresh dynamic import (the same pattern themeStore.test.ts already established for its own
// module-load-time initializer) is how each "supported" test gets a clean module reevaluation.
const mockIdbGet = vi.fn();
const mockIdbSet = vi.fn().mockResolvedValue(true);
const mockIdbDelete = vi.fn().mockResolvedValue(true);

vi.mock('../utils/idbKv', () => ({
  idbGet: (...args: unknown[]) => mockIdbGet(...args),
  idbSet: (...args: unknown[]) => mockIdbSet(...args),
  idbDelete: (...args: unknown[]) => mockIdbDelete(...args)
}));

// Cast at the module boundary, matching this project's own established `as unknown as X`
// convention for adapting a test fake down to a real, richer SDK/browser type -- this fake only
// needs the members `fsBackupStore.ts` actually calls (`name`/`queryPermission`/
// `requestPermission`/`createWritable`), not `lib.dom.d.ts`'s full real `FileSystemFileHandle`
// (`kind`/`getFile`/`isSameEntry`).
function fakeHandle(name = 'sakura-backup.json', overrides: Record<string, unknown> = {}): FileSystemFileHandle {
  return {
    name,
    queryPermission: vi.fn().mockResolvedValue('granted'),
    requestPermission: vi.fn().mockResolvedValue('granted'),
    createWritable: vi.fn().mockResolvedValue({ write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) }),
    ...overrides
  } as unknown as FileSystemFileHandle;
}

describe('fsBackupStore -- unsupported browser (no window.showSaveFilePicker)', () => {
  beforeEach(() => {
    mockIdbGet.mockReset();
    mockIdbSet.mockClear();
    mockIdbDelete.mockClear();
    localStorage.clear();
  });

  it("status starts (and init() stays) 'unsupported' when the File System Access API doesn't exist", async () => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    vi.resetModules();
    const { useFsBackupStore } = await import('./fsBackupStore');
    expect(useFsBackupStore.getState().status).toBe('unsupported');
    expect(useFsBackupStore.getState().supported).toBe(false);
    await useFsBackupStore.getState().init();
    expect(useFsBackupStore.getState().status).toBe('unsupported');
    expect(mockIdbGet).not.toHaveBeenCalled();
  });

  it('connect() is a no-op when unsupported', async () => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    vi.resetModules();
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().connect();
    expect(useFsBackupStore.getState().status).toBe('unsupported');
  });
});

describe('fsBackupStore -- supported browser', () => {
  let mockShowSaveFilePicker: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockIdbGet.mockReset();
    mockIdbGet.mockResolvedValue(undefined);
    mockIdbSet.mockClear();
    mockIdbDelete.mockClear();
    localStorage.clear();
    mockShowSaveFilePicker = vi.fn();
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = mockShowSaveFilePicker;
    vi.resetModules();
  });

  afterEach(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('init() with no stored handle and no prior connection -> disconnected', async () => {
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    expect(useFsBackupStore.getState().status).toBe('disconnected');
  });

  it('init() with no stored handle but a prior connection flag -> handle-lost', async () => {
    localStorage.setItem('sakura_fsBackupConnected', '1');
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    expect(useFsBackupStore.getState().status).toBe('handle-lost');
  });

  it('init() retries once after 150ms before concluding the handle is genuinely gone', async () => {
    vi.useFakeTimers();
    mockIdbGet.mockResolvedValueOnce(undefined).mockResolvedValueOnce(fakeHandle());
    const { useFsBackupStore } = await import('./fsBackupStore');
    const initPromise = useFsBackupStore.getState().init();
    await vi.advanceTimersByTimeAsync(150);
    await initPromise;
    expect(mockIdbGet).toHaveBeenCalledTimes(2);
    expect(useFsBackupStore.getState().status).toBe('connected');
    vi.useRealTimers();
  });

  it('init() with a stored handle and granted permission -> connected', async () => {
    mockIdbGet.mockResolvedValue(fakeHandle('my-backup.json'));
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    expect(useFsBackupStore.getState().status).toBe('connected');
    expect(useFsBackupStore.getState().fileName).toBe('my-backup.json');
  });

  it('init() with a stored handle but no granted permission -> permission-needed', async () => {
    mockIdbGet.mockResolvedValue(fakeHandle('x.json', { queryPermission: vi.fn().mockResolvedValue('prompt') }));
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    expect(useFsBackupStore.getState().status).toBe('permission-needed');
  });

  it('connect() saves the picked handle, sets the connected flag, and writes immediately', async () => {
    const handle = fakeHandle('picked.json');
    mockShowSaveFilePicker.mockResolvedValue(handle);
    localStorage.setItem('sakura_web_theme', 'dark');
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().connect();
    expect(useFsBackupStore.getState().status).toBe('connected');
    expect(useFsBackupStore.getState().fileName).toBe('picked.json');
    expect(mockIdbSet).toHaveBeenCalledWith('fsHandle', handle);
    expect(localStorage.getItem('sakura_fsBackupConnected')).toBe('1');
    expect(handle.createWritable).toHaveBeenCalledTimes(1);
  });

  it('connect() silently does nothing on AbortError (the picker was dismissed)', async () => {
    const abortError = new Error('cancelled');
    abortError.name = 'AbortError';
    mockShowSaveFilePicker.mockRejectedValue(abortError);
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().connect();
    expect(useFsBackupStore.getState().status).toBe('disconnected');
    expect(mockIdbSet).not.toHaveBeenCalled();
  });

  it('reconnect() re-requests permission on the existing handle and writes on success', async () => {
    const handle = fakeHandle('existing.json', { queryPermission: vi.fn().mockResolvedValue('prompt') });
    mockIdbGet.mockResolvedValue(handle);
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    expect(useFsBackupStore.getState().status).toBe('permission-needed');
    await useFsBackupStore.getState().reconnect();
    expect(useFsBackupStore.getState().status).toBe('connected');
    expect(handle.createWritable).toHaveBeenCalledTimes(1);
  });

  it('reconnect() falls back to connect() when there is no handle at all', async () => {
    const handle = fakeHandle('picked.json');
    mockShowSaveFilePicker.mockResolvedValue(handle);
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().reconnect();
    expect(mockShowSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(useFsBackupStore.getState().status).toBe('connected');
  });

  it('reconnect() stays permission-needed when permission is denied', async () => {
    const handle = fakeHandle('x.json', {
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('denied')
    });
    mockIdbGet.mockResolvedValue(handle);
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    await useFsBackupStore.getState().reconnect();
    expect(useFsBackupStore.getState().status).toBe('permission-needed');
  });

  it('disconnect() clears the handle, the connected flag, and the IndexedDB entry', async () => {
    const handle = fakeHandle();
    mockIdbGet.mockResolvedValue(handle);
    localStorage.setItem('sakura_fsBackupConnected', '1');
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    expect(useFsBackupStore.getState().status).toBe('connected');
    await useFsBackupStore.getState().disconnect();
    expect(useFsBackupStore.getState().status).toBe('disconnected');
    expect(useFsBackupStore.getState().fileName).toBeNull();
    expect(mockIdbDelete).toHaveBeenCalledWith('fsHandle');
    expect(localStorage.getItem('sakura_fsBackupConnected')).toBeNull();
  });

  it('writeNow() is a no-op when not connected', async () => {
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().writeNow();
    expect(useFsBackupStore.getState().lastBackedUpAt).toBeNull();
  });

  it('writeNow() writes the current localStorage snapshot and updates lastBackedUpAt when connected', async () => {
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const handle = fakeHandle('b.json', { createWritable: vi.fn().mockResolvedValue(writable) });
    mockIdbGet.mockResolvedValue(handle);
    localStorage.setItem('sakura_web_theme', 'dark');
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    await useFsBackupStore.getState().writeNow();
    expect(writable.write).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writable.write.mock.calls[0][0] as string);
    expect(written.data).toEqual({ sakura_web_theme: 'dark' });
    expect(written._sakuraExport).toBe(true);
    expect(useFsBackupStore.getState().lastBackedUpAt).not.toBeNull();
  });

  it('writeNow() falls back to permission-needed when the write itself fails', async () => {
    const handle = fakeHandle('c.json', { createWritable: vi.fn().mockRejectedValue(new Error('denied')) });
    mockIdbGet.mockResolvedValue(handle);
    const { useFsBackupStore } = await import('./fsBackupStore');
    await useFsBackupStore.getState().init();
    await useFsBackupStore.getState().writeNow();
    expect(useFsBackupStore.getState().status).toBe('permission-needed');
  });
});
