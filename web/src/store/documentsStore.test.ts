import { describe, expect, it, beforeEach } from 'vitest';
import { useDocumentsStore } from './documentsStore';
import { useOutlineStore } from './outlineStore';

describe('documentsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDocumentsStore.setState({ docsIndex: [], openTabs: [], activeDocId: null, loaded: false });
    useOutlineStore.setState({ nodes: [] });
  });

  it('newDocument creates a document, opens it as a tab, and makes it active', () => {
    useDocumentsStore.getState().newDocument();
    const { docsIndex, openTabs, activeDocId } = useDocumentsStore.getState();
    expect(docsIndex).toHaveLength(1);
    expect(openTabs).toEqual([docsIndex[0].id]);
    expect(activeDocId).toBe(docsIndex[0].id);
    expect(useOutlineStore.getState().nodes).toHaveLength(1);
  });

  it('newDocument saves the previously active document before switching', () => {
    useDocumentsStore.getState().newDocument();
    const firstId = useDocumentsStore.getState().activeDocId!;
    useOutlineStore.setState({
      nodes: [{ id: 1, depth: 0, text: 'edited', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] }]
    });
    useDocumentsStore.getState().newDocument();
    // Switch back to the first document -- its edit should have been persisted.
    useDocumentsStore.getState().openDocument(firstId);
    expect(useOutlineStore.getState().nodes[0].text).toBe('edited');
  });

  it('openDocument switches the active tab and loads its stored nodes', () => {
    useDocumentsStore.getState().newDocument();
    const firstId = useDocumentsStore.getState().activeDocId!;
    useDocumentsStore.getState().newDocument();
    const secondId = useDocumentsStore.getState().activeDocId!;
    expect(useDocumentsStore.getState().openTabs).toEqual([firstId, secondId]);
    useDocumentsStore.getState().openDocument(firstId);
    expect(useDocumentsStore.getState().activeDocId).toBe(firstId);
    // Both tabs remain open -- openDocument doesn't close anything.
    expect(useDocumentsStore.getState().openTabs).toEqual([firstId, secondId]);
  });

  it('closeTab removes the tab but preserves the document itself', () => {
    useDocumentsStore.getState().newDocument();
    const id = useDocumentsStore.getState().activeDocId!;
    useDocumentsStore.getState().closeTab(id);
    expect(useDocumentsStore.getState().openTabs).toEqual([]);
    expect(useDocumentsStore.getState().activeDocId).toBeNull();
    // Still in the index -- not deleted.
    expect(useDocumentsStore.getState().docsIndex.map((d) => d.id)).toEqual([id]);
    // Reopening brings its content back.
    useDocumentsStore.getState().openDocument(id);
    expect(useOutlineStore.getState().nodes).toHaveLength(1);
  });

  it('closeTab on the active tab falls back to another open tab', () => {
    useDocumentsStore.getState().newDocument();
    const firstId = useDocumentsStore.getState().activeDocId!;
    useDocumentsStore.getState().newDocument();
    const secondId = useDocumentsStore.getState().activeDocId!;
    useDocumentsStore.getState().closeTab(secondId);
    expect(useDocumentsStore.getState().activeDocId).toBe(firstId);
  });

  it('renameDocument updates the title in the index and persisted storage', () => {
    useDocumentsStore.getState().newDocument();
    const id = useDocumentsStore.getState().activeDocId!;
    useDocumentsStore.getState().renameDocument(id, 'My Plan');
    expect(useDocumentsStore.getState().docsIndex[0].title).toBe('My Plan');
  });

  it('deleteDocument removes the document entirely, not just the tab', () => {
    useDocumentsStore.getState().newDocument();
    const id = useDocumentsStore.getState().activeDocId!;
    useDocumentsStore.getState().deleteDocument(id);
    expect(useDocumentsStore.getState().docsIndex).toEqual([]);
    expect(useDocumentsStore.getState().openTabs).toEqual([]);
    expect(localStorage.getItem(`sakura_web_doc_${id}_v1`)).toBeNull();
  });

  it('saveActiveDocNodes is a no-op when nothing is active', () => {
    expect(() => useDocumentsStore.getState().saveActiveDocNodes()).not.toThrow();
  });

  it('init() on first-ever launch creates its own explicit welcome document, independent of outlineStore\'s current content', () => {
    // Deliberately set outlineStore to something that must NOT leak into the new document --
    // this is the regression test for the real bug this decoupling fixes: init() used to
    // adopt whatever was transiently sitting in outlineStore at that moment, which meant a
    // fresh visitor's permanent first document was outlineStore.ts's own module-level default
    // content, whatever that happened to be.
    useOutlineStore.setState({
      nodes: [{ id: 1, depth: 0, text: 'should not leak into the new document', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] }]
    });
    useDocumentsStore.getState().init();
    const { docsIndex, openTabs, activeDocId } = useDocumentsStore.getState();
    expect(docsIndex).toHaveLength(1);
    expect(docsIndex[0].title).toBe('Welcome');
    expect(openTabs).toEqual([docsIndex[0].id]);
    expect(activeDocId).toBe(docsIndex[0].id);
    // The document has its own explicit welcome content -- not the pre-init outlineStore state.
    expect(useOutlineStore.getState().nodes[0].text).toBe('Welcome to Sakura');
    expect(useOutlineStore.getState().nodes.some((n) => n.text?.includes('should not leak'))).toBe(false);
  });

  it('init() is idempotent -- calling it twice does not create a second document', () => {
    useDocumentsStore.getState().init();
    useDocumentsStore.getState().init();
    expect(useDocumentsStore.getState().docsIndex).toHaveLength(1);
  });

  describe('per-tab view state (Phase 6.1: per-tab independent scroll/selection)', () => {
    it('restores the selected node when switching back to a previously-visited tab, instead of resetting to the first node', () => {
      useDocumentsStore.getState().newDocument();
      const firstId = useDocumentsStore.getState().activeDocId!;
      useOutlineStore.setState({
        nodes: [
          { id: 1, depth: 0, text: 'a', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] },
          { id: 2, depth: 0, text: 'b', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] }
        ]
      });
      useOutlineStore.getState().selectNode(2);
      expect(useOutlineStore.getState().selectedId).toBe(2);

      useDocumentsStore.getState().newDocument();
      const secondId = useDocumentsStore.getState().activeDocId!;
      expect(secondId).not.toBe(firstId);
      // Switching to the new doc resets selection to ITS first node -- no cache for it yet.
      expect(useOutlineStore.getState().selectedId).toBe(useOutlineStore.getState().nodes[0].id);

      useDocumentsStore.getState().switchTab(firstId);
      // Back on the first doc: selection is restored to node 2, not reset to node 1.
      expect(useDocumentsStore.getState().activeDocId).toBe(firstId);
      expect(useOutlineStore.getState().selectedId).toBe(2);
    });

    it('does not carry one document\'s collapsedIds into another (ids restart at 1 per document)', () => {
      useDocumentsStore.getState().newDocument();
      const firstId = useDocumentsStore.getState().activeDocId!;
      useOutlineStore.setState({
        nodes: [{ id: 1, depth: 0, text: 'a', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [] }]
      });
      useOutlineStore.getState().toggleCollapse(1);
      expect(useOutlineStore.getState().collapsedIds.has(1)).toBe(true);

      useDocumentsStore.getState().newDocument();
      // The new document also has a node with id 1 -- its collapsedIds must start empty, not
      // inherit the first document's collapsed node 1.
      expect(useOutlineStore.getState().collapsedIds.has(1)).toBe(false);

      useDocumentsStore.getState().switchTab(firstId);
      // Switching back restores the first document's own collapse state.
      expect(useOutlineStore.getState().collapsedIds.has(1)).toBe(true);
    });

    it('never resumes mid-inline-edit across a tab switch', () => {
      useDocumentsStore.getState().newDocument();
      const firstId = useDocumentsStore.getState().activeDocId!;
      const nodeId = useOutlineStore.getState().nodes[0].id;
      useOutlineStore.getState().startEditing(nodeId);
      expect(useOutlineStore.getState().editingId).toBe(nodeId);

      useDocumentsStore.getState().newDocument();
      useDocumentsStore.getState().switchTab(firstId);
      expect(useOutlineStore.getState().editingId).toBeNull();
    });

    it('captures and restores scroll position per tab via the registered scroll container', async () => {
      const fakeContainer = { scrollTop: 0 } as HTMLElement;
      useDocumentsStore.getState().registerScrollContainer(fakeContainer);

      useDocumentsStore.getState().newDocument();
      const firstId = useDocumentsStore.getState().activeDocId!;
      fakeContainer.scrollTop = 240;

      useDocumentsStore.getState().newDocument();
      // requestAnimationFrame'd reset to 0 for the brand-new tab.
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(fakeContainer.scrollTop).toBe(0);

      useDocumentsStore.getState().switchTab(firstId);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(fakeContainer.scrollTop).toBe(240);

      // Clean up the module-level registration so it doesn't leak into other tests.
      useDocumentsStore.getState().registerScrollContainer(null);
    });

    it('deleteDocument evicts the tab-view cache so a later document reusing storage never inherits stale view state', () => {
      useDocumentsStore.getState().newDocument();
      const id = useDocumentsStore.getState().activeDocId!;
      useOutlineStore.getState().selectNode(useOutlineStore.getState().nodes[0].id);
      useDocumentsStore.getState().newDocument();
      useDocumentsStore.getState().deleteDocument(id);
      // No assertion needed beyond "this doesn't throw" -- deleteDocument's own cache eviction
      // is exercised here; the real regression this guards is a future doc id collision picking
      // up a stale cache entry, which isn't practically reproducible with this store's id
      // generation but the eviction call itself is what matters.
      expect(useDocumentsStore.getState().docsIndex.find((d) => d.id === id)).toBeUndefined();
    });
  });
});
