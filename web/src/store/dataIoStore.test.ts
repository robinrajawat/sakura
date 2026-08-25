import { beforeEach, describe, expect, it, vi } from 'vitest';

// §6.8 slice: mocking `idbKv.ts`'s module boundary, matching backupStore.test.ts/
// fsBackupStore.test.ts's own established precedent (jsdom has no real IndexedDB).
const mockIdbGet = vi.fn();
const mockIdbSet = vi.fn().mockResolvedValue(true);
const mockIdbDelete = vi.fn().mockResolvedValue(true);

vi.mock('../utils/idbKv', () => ({
  idbGet: (...args: unknown[]) => mockIdbGet(...args),
  idbSet: (...args: unknown[]) => mockIdbSet(...args),
  idbDelete: (...args: unknown[]) => mockIdbDelete(...args)
}));

import { useDataIoStore } from './dataIoStore';

// jsdom's Blob/File polyfill doesn't implement `.text()` at all in this environment -- a plain
// duck-typed fake satisfying just the one method `importFromFile` actually calls, matching this
// project's own established `as unknown as X` convention for adapting a test fake to a real,
// richer browser type, rather than a real `File` instance jsdom can't fully back here.
function fakeFile(content: string): File {
  return { text: () => Promise.resolve(content) } as unknown as File;
}

describe('dataIoStore', () => {
  beforeEach(() => {
    mockIdbGet.mockReset();
    mockIdbSet.mockClear();
    mockIdbDelete.mockClear();
    localStorage.clear();
    useDataIoStore.setState({ preRestoreAvailable: false, preRestoreSavedAt: null, preRestoreReason: null });
  });

  describe('exportAll', () => {
    it('downloads a JSON file named sakura-backup-<date>.json with the current localStorage snapshot', () => {
      localStorage.setItem('sakura_web_theme', 'dark');
      // jsdom doesn't implement URL.createObjectURL/revokeObjectURL at all -- assigned directly
      // (vi.spyOn requires the property to already exist) rather than a real object URL.
      const originalCreate = URL.createObjectURL;
      const originalRevoke = URL.revokeObjectURL;
      const createObjectURLSpy = vi.fn().mockReturnValue('blob:fake');
      const revokeSpy = vi.fn();
      URL.createObjectURL = createObjectURLSpy;
      URL.revokeObjectURL = revokeSpy;
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      useDataIoStore.getState().exportAll();

      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('application/json');
      expect(revokeSpy).toHaveBeenCalledWith('blob:fake');

      clickSpy.mockRestore();
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    });
  });

  describe('importFromFile', () => {
    it('returns "invalid" for a file that is not valid JSON', async () => {
      const result = await useDataIoStore.getState().importFromFile(fakeFile('not json'));
      expect(result).toBe('invalid');
    });

    it('returns "invalid" for JSON that lacks a data object', async () => {
      const result = await useDataIoStore.getState().importFromFile(fakeFile(JSON.stringify({ foo: 'bar' })));
      expect(result).toBe('invalid');
    });

    it('snapshots the current state and clears/rewrites localStorage on success', async () => {
      localStorage.setItem('stale_key', 'should be gone');
      const payload = { _sakuraExport: true, formatVersion: 1, exportedAt: 1, data: { sakura_web_theme: 'light' } };
      const result = await useDataIoStore.getState().importFromFile(fakeFile(JSON.stringify(payload)));

      expect(result).toBe('ok');
      expect(localStorage.getItem('stale_key')).toBeNull();
      expect(localStorage.getItem('sakura_web_theme')).toBe('light');
      const snapshotCall = mockIdbSet.mock.calls.find(([key]) => key === 'preRestoreSnapshot');
      expect(snapshotCall).toBeTruthy();
      expect(snapshotCall![1].reason).toBe('restore from backup file');
    });

    it('the pre-restore snapshot captures what was there BEFORE the import overwrote it', async () => {
      localStorage.setItem('sakura_web_theme', 'dark');
      const payload = { data: { sakura_web_theme: 'light' } };
      await useDataIoStore.getState().importFromFile(fakeFile(JSON.stringify(payload)));
      const snapshotCall = mockIdbSet.mock.calls.find(([key]) => key === 'preRestoreSnapshot');
      expect(snapshotCall![1].payload.data).toEqual({ sakura_web_theme: 'dark' });
    });

    it('rolls back to the pre-restore snapshot when a write fails partway', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
        if (key === 'poison') throw new Error('quota exceeded');
      });
      // The snapshot write itself succeeds (mocked idbSet); the rollback read needs to return it.
      mockIdbGet.mockImplementation(async (key: string) =>
        key === 'preRestoreSnapshot' ? { payload: { data: { original: 'value' } }, savedAt: 1, reason: 'restore from backup file' } : undefined
      );
      const payload = { data: { good: '1', poison: '2' } };
      const result = await useDataIoStore.getState().importFromFile(fakeFile(JSON.stringify(payload)));
      expect(result).toBe('rolled-back');
      setItemSpy.mockRestore();
    });

    it('reports "failed" (not "rolled-back") when the write fails AND no snapshot can be read back', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      mockIdbGet.mockResolvedValue(undefined); // nothing to roll back to
      const payload = { data: { anything: '1' } };
      const result = await useDataIoStore.getState().importFromFile(fakeFile(JSON.stringify(payload)));
      expect(result).toBe('failed');
      setItemSpy.mockRestore();
    });
  });

  describe('undoLastRestore', () => {
    it('returns false when there is no pre-restore snapshot', async () => {
      mockIdbGet.mockResolvedValue(undefined);
      const result = await useDataIoStore.getState().undoLastRestore();
      expect(result).toBe(false);
    });

    it('restores the snapshot and deletes it -- one level deep, matching legacy exactly', async () => {
      localStorage.setItem('current', 'stuff');
      mockIdbGet.mockResolvedValue({ payload: { data: { restored_key: 'value' } }, savedAt: 5000, reason: 'restore from backup file' });
      const result = await useDataIoStore.getState().undoLastRestore();
      expect(result).toBe(true);
      expect(localStorage.getItem('current')).toBeNull();
      expect(localStorage.getItem('restored_key')).toBe('value');
      expect(mockIdbDelete).toHaveBeenCalledWith('preRestoreSnapshot');
    });

    it('returns false and does not delete the snapshot when the write itself fails', async () => {
      mockIdbGet.mockResolvedValue({ payload: { data: { poison: '1' } }, savedAt: 1, reason: 'x' });
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });
      const result = await useDataIoStore.getState().undoLastRestore();
      expect(result).toBe(false);
      expect(mockIdbDelete).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
    });
  });

  describe('refreshUndoStatus', () => {
    it('reflects an available pre-restore snapshot', async () => {
      mockIdbGet.mockResolvedValue({ payload: { data: {} }, savedAt: 4242, reason: 'restore from safety copy' });
      await useDataIoStore.getState().refreshUndoStatus();
      const s = useDataIoStore.getState();
      expect(s.preRestoreAvailable).toBe(true);
      expect(s.preRestoreSavedAt).toBe(4242);
      expect(s.preRestoreReason).toBe('restore from safety copy');
    });

    it('reflects no snapshot available', async () => {
      mockIdbGet.mockResolvedValue(undefined);
      await useDataIoStore.getState().refreshUndoStatus();
      expect(useDataIoStore.getState().preRestoreAvailable).toBe(false);
    });
  });
});
