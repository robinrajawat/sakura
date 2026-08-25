import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultNodeStyles } from './outlineStore';

// §6.8 slice: mocking `idbKv.ts`'s module boundary, matching backupStore.test.ts/
// fsBackupStore.test.ts's own established precedent (jsdom has no real IndexedDB).
const mockIdbGet = vi.fn();
const mockIdbSet = vi.fn().mockResolvedValue(true);

vi.mock('../utils/idbKv', () => ({
  idbGet: (...args: unknown[]) => mockIdbGet(...args),
  idbSet: (...args: unknown[]) => mockIdbSet(...args)
}));

import { useVersionHistoryStore, REVISION_MIN_GAP_MS, REVISION_MAX_PER_DOC, type DocRevision } from './versionHistoryStore';

function node(text: string) {
  return { id: 1, depth: 0, text, parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() };
}

describe('versionHistoryStore', () => {
  beforeEach(() => {
    mockIdbGet.mockReset();
    mockIdbSet.mockClear();
    useVersionHistoryStore.setState({ docId: null, revisions: [], loading: false });
  });

  describe('loadRevisions', () => {
    it('reads docrev:<id> and populates state', async () => {
      const revs: DocRevision[] = [{ ts: 1000, reason: 'Auto', nodes: [node('a')], title: 'Doc' }];
      mockIdbGet.mockResolvedValue(revs);
      await useVersionHistoryStore.getState().loadRevisions('doc1');
      expect(mockIdbGet).toHaveBeenCalledWith('docrev:doc1');
      expect(useVersionHistoryStore.getState().revisions).toEqual(revs);
      expect(useVersionHistoryStore.getState().docId).toBe('doc1');
      expect(useVersionHistoryStore.getState().loading).toBe(false);
    });

    it('defaults to [] when nothing is stored or the read fails', async () => {
      mockIdbGet.mockResolvedValue(undefined);
      await useVersionHistoryStore.getState().loadRevisions('doc1');
      expect(useVersionHistoryStore.getState().revisions).toEqual([]);

      mockIdbGet.mockRejectedValue(new Error('denied'));
      await useVersionHistoryStore.getState().loadRevisions('doc2');
      expect(useVersionHistoryStore.getState().revisions).toEqual([]);
    });

    it('discards a stale response for a docId the store has since navigated away from', async () => {
      let resolveFirst: (v: DocRevision[]) => void;
      const firstPromise = new Promise<DocRevision[]>((res) => {
        resolveFirst = res;
      });
      mockIdbGet.mockReturnValueOnce(firstPromise);
      const loadA = useVersionHistoryStore.getState().loadRevisions('docA');

      mockIdbGet.mockResolvedValueOnce([{ ts: 2000, reason: 'Auto', nodes: [], title: 'B' }]);
      await useVersionHistoryStore.getState().loadRevisions('docB');
      expect(useVersionHistoryStore.getState().docId).toBe('docB');

      resolveFirst!([{ ts: 1000, reason: 'Auto', nodes: [], title: 'A' }]);
      await loadA;
      // The late docA response must not clobber the already-landed docB state.
      expect(useVersionHistoryStore.getState().docId).toBe('docB');
      expect(useVersionHistoryStore.getState().revisions[0].title).toBe('B');
    });
  });

  describe('maybeCapture', () => {
    it('does nothing when prevNodes is empty (nothing meaningful to preserve)', async () => {
      await useVersionHistoryStore.getState().maybeCapture('doc1', [], 'Title');
      expect(mockIdbSet).not.toHaveBeenCalled();
    });

    it('records a new Auto revision when there is no prior history at all', async () => {
      mockIdbGet.mockResolvedValue([]);
      await useVersionHistoryStore.getState().maybeCapture('doc1', [node('a')], 'Title');
      expect(mockIdbSet).toHaveBeenCalledTimes(1);
      const [key, list] = mockIdbSet.mock.calls[0];
      expect(key).toBe('docrev:doc1');
      expect(list).toHaveLength(1);
      expect(list[0].reason).toBe('Auto');
      expect(list[0].title).toBe('Title');
    });

    it('skips capture when content is identical to the most recent revision', async () => {
      const nodes = [node('a')];
      mockIdbGet.mockResolvedValue([{ ts: Date.now() - REVISION_MIN_GAP_MS - 1, reason: 'Auto', nodes, title: 'Title' }]);
      await useVersionHistoryStore.getState().maybeCapture('doc1', nodes, 'Title');
      expect(mockIdbSet).not.toHaveBeenCalled();
    });

    it('skips capture when content differs but less than REVISION_MIN_GAP_MS has passed', async () => {
      mockIdbGet.mockResolvedValue([{ ts: Date.now() - 1000, reason: 'Auto', nodes: [node('old')], title: 'Title' }]);
      await useVersionHistoryStore.getState().maybeCapture('doc1', [node('new')], 'Title');
      expect(mockIdbSet).not.toHaveBeenCalled();
    });

    it('captures when content differs AND the gap has elapsed', async () => {
      mockIdbGet.mockResolvedValue([{ ts: Date.now() - REVISION_MIN_GAP_MS - 1, reason: 'Auto', nodes: [node('old')], title: 'Title' }]);
      await useVersionHistoryStore.getState().maybeCapture('doc1', [node('new')], 'Title');
      expect(mockIdbSet).toHaveBeenCalledTimes(1);
    });

    it('captures on a title-only change even with identical nodes', async () => {
      const nodes = [node('a')];
      mockIdbGet.mockResolvedValue([{ ts: Date.now() - REVISION_MIN_GAP_MS - 1, reason: 'Auto', nodes, title: 'Old Title' }]);
      await useVersionHistoryStore.getState().maybeCapture('doc1', nodes, 'New Title');
      expect(mockIdbSet).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordRevision', () => {
    it('bypasses the rate-limit gate entirely', async () => {
      mockIdbGet.mockResolvedValue([{ ts: Date.now(), reason: 'Auto', nodes: [node('a')], title: 'T' }]);
      await useVersionHistoryStore.getState().recordRevision('doc1', [node('b')], 'T', 'Manual checkpoint');
      expect(mockIdbSet).toHaveBeenCalledTimes(1);
      const [, list] = mockIdbSet.mock.calls[0];
      expect(list).toHaveLength(2);
      expect(list[1].reason).toBe('Manual checkpoint');
    });

    it('caps the list at REVISION_MAX_PER_DOC, dropping the oldest first', async () => {
      const existing: DocRevision[] = Array.from({ length: REVISION_MAX_PER_DOC }, (_, i) => ({
        ts: i,
        reason: 'Auto',
        nodes: [node(`n${i}`)],
        title: 'T'
      }));
      mockIdbGet.mockResolvedValue(existing);
      await useVersionHistoryStore.getState().recordRevision('doc1', [node('newest')], 'T', 'Manual checkpoint');
      const [, list] = mockIdbSet.mock.calls[0];
      expect(list).toHaveLength(REVISION_MAX_PER_DOC);
      expect(list[0].ts).toBe(1); // the oldest (ts:0) was dropped
      expect(list[list.length - 1].nodes[0].text).toBe('newest');
    });

    it('updates live state only when the store is currently scoped to this docId', async () => {
      // A fresh array per call -- `recordRevision` mutates (`.push`) the array it reads back,
      // so a shared `mockResolvedValue([])` reference would leak state between the two calls
      // below in a way real IndexedDB (which always deserializes a fresh array) never would.
      mockIdbGet.mockImplementation(async () => []);
      useVersionHistoryStore.setState({ docId: 'other-doc', revisions: [] });
      await useVersionHistoryStore.getState().recordRevision('doc1', [node('a')], 'T', 'Manual checkpoint');
      expect(useVersionHistoryStore.getState().revisions).toEqual([]); // untouched -- wrong doc

      useVersionHistoryStore.setState({ docId: 'doc1', revisions: [] });
      await useVersionHistoryStore.getState().recordRevision('doc1', [node('a')], 'T', 'Manual checkpoint');
      expect(useVersionHistoryStore.getState().revisions).toHaveLength(1);
    });
  });
});
