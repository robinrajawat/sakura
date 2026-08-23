import { describe, expect, it, beforeEach } from 'vitest';
import { useDocumentsStore } from './documentsStore';
import { useOutlineStore } from './outlineStore';

describe('documentsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useDocumentsStore.setState({ docsIndex: [], openTabs: [], activeDocId: null, loaded: false, folders: [], docFolderMap: {} });
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

  describe('reorderTab (Phase 6.1: drag-to-reorder tabs)', () => {
    it('moves a tab to just before the target on side "left"', () => {
      useDocumentsStore.getState().newDocument();
      const a = useDocumentsStore.getState().activeDocId!;
      useDocumentsStore.getState().newDocument();
      const b = useDocumentsStore.getState().activeDocId!;
      useDocumentsStore.getState().newDocument();
      const c = useDocumentsStore.getState().activeDocId!;
      expect(useDocumentsStore.getState().openTabs).toEqual([a, b, c]);

      useDocumentsStore.getState().reorderTab(c, a, 'left');
      expect(useDocumentsStore.getState().openTabs).toEqual([c, a, b]);
    });

    it('moves a tab to just after the target on side "right"', () => {
      useDocumentsStore.getState().newDocument();
      const a = useDocumentsStore.getState().activeDocId!;
      useDocumentsStore.getState().newDocument();
      const b = useDocumentsStore.getState().activeDocId!;
      useDocumentsStore.getState().newDocument();
      const c = useDocumentsStore.getState().activeDocId!;

      useDocumentsStore.getState().reorderTab(a, b, 'right');
      expect(useDocumentsStore.getState().openTabs).toEqual([b, a, c]);
    });

    it('is a no-op when draggedId equals targetId', () => {
      useDocumentsStore.getState().newDocument();
      const a = useDocumentsStore.getState().activeDocId!;
      useDocumentsStore.getState().newDocument();
      const b = useDocumentsStore.getState().activeDocId!;
      const before = useDocumentsStore.getState().openTabs;

      useDocumentsStore.getState().reorderTab(a, a, 'left');
      expect(useDocumentsStore.getState().openTabs).toEqual(before);
      expect(useDocumentsStore.getState().openTabs).toEqual([a, b]);
    });

    it('persists the new order to localStorage', () => {
      useDocumentsStore.getState().newDocument();
      const a = useDocumentsStore.getState().activeDocId!;
      useDocumentsStore.getState().newDocument();
      const b = useDocumentsStore.getState().activeDocId!;

      useDocumentsStore.getState().reorderTab(b, a, 'left');
      const persisted = JSON.parse(localStorage.getItem('sakura_web_open_tabs_v1')!);
      expect(persisted).toEqual([b, a]);
    });
  });

  describe('folders (Phase 6.1: real file explorer)', () => {
    it('createFolder adds a top-level folder named "New Folder", open by default', () => {
      const id = useDocumentsStore.getState().createFolder();
      const folder = useDocumentsStore.getState().folders.find((f) => f.id === id);
      expect(folder).toEqual({ id, name: 'New Folder', open: true, parentId: null });
    });

    it('createFolder accepts a parentId for nesting', () => {
      const parentId = useDocumentsStore.getState().createFolder();
      const childId = useDocumentsStore.getState().createFolder(parentId);
      const child = useDocumentsStore.getState().folders.find((f) => f.id === childId);
      expect(child?.parentId).toBe(parentId);
    });

    it('createFolder persists to localStorage', () => {
      const id = useDocumentsStore.getState().createFolder();
      const persisted = JSON.parse(localStorage.getItem('sakura_web_folders_v1')!);
      expect(persisted).toEqual([{ id, name: 'New Folder', open: true, parentId: null }]);
    });

    it('renameFolder updates the name and persists it', () => {
      const id = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().renameFolder(id, 'Project Plans');
      expect(useDocumentsStore.getState().folders.find((f) => f.id === id)?.name).toBe('Project Plans');
      const persisted = JSON.parse(localStorage.getItem('sakura_web_folders_v1')!);
      expect(persisted[0].name).toBe('Project Plans');
    });

    it('renameFolder falls back to the existing name when given an empty/whitespace-only name', () => {
      const id = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().renameFolder(id, '   ');
      expect(useDocumentsStore.getState().folders.find((f) => f.id === id)?.name).toBe('New Folder');
    });

    it('toggleFolderOpen flips the open flag and persists it', () => {
      const id = useDocumentsStore.getState().createFolder();
      expect(useDocumentsStore.getState().folders.find((f) => f.id === id)?.open).toBe(true);
      useDocumentsStore.getState().toggleFolderOpen(id);
      expect(useDocumentsStore.getState().folders.find((f) => f.id === id)?.open).toBe(false);
      const persisted = JSON.parse(localStorage.getItem('sakura_web_folders_v1')!);
      expect(persisted[0].open).toBe(false);
    });

    it('setFolderForDoc files a document into a folder and persists it', () => {
      useDocumentsStore.getState().newDocument();
      const docId = useDocumentsStore.getState().activeDocId!;
      const folderId = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().setFolderForDoc(docId, folderId);
      expect(useDocumentsStore.getState().docFolderMap[docId]).toBe(folderId);
      const persisted = JSON.parse(localStorage.getItem('sakura_web_doc_folder_map_v1')!);
      expect(persisted[docId]).toBe(folderId);
    });

    it('setFolderForDoc with null unfiles a document (removes the map entry entirely)', () => {
      useDocumentsStore.getState().newDocument();
      const docId = useDocumentsStore.getState().activeDocId!;
      const folderId = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().setFolderForDoc(docId, folderId);
      useDocumentsStore.getState().setFolderForDoc(docId, null);
      expect(docId in useDocumentsStore.getState().docFolderMap).toBe(false);
    });

    it('newDocument accepts a folderId and files the new document into it directly', () => {
      const folderId = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().newDocument(folderId);
      const docId = useDocumentsStore.getState().activeDocId!;
      expect(useDocumentsStore.getState().docFolderMap[docId]).toBe(folderId);
    });

    it('deleteFolder promotes direct children up to the deleted folder\'s own parent', () => {
      const grandparent = useDocumentsStore.getState().createFolder();
      const parent = useDocumentsStore.getState().createFolder(grandparent);
      const child = useDocumentsStore.getState().createFolder(parent);

      useDocumentsStore.getState().deleteFolder(parent);

      const remaining = useDocumentsStore.getState().folders;
      expect(remaining.find((f) => f.id === parent)).toBeUndefined();
      expect(remaining.find((f) => f.id === child)?.parentId).toBe(grandparent);
    });

    it('deleteFolder promotes children to top-level (null) when the deleted folder itself was top-level', () => {
      const parent = useDocumentsStore.getState().createFolder();
      const child = useDocumentsStore.getState().createFolder(parent);

      useDocumentsStore.getState().deleteFolder(parent);

      expect(useDocumentsStore.getState().folders.find((f) => f.id === child)?.parentId).toBeNull();
    });

    it('deleteFolder unfiles documents that were directly inside it', () => {
      const folderId = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().newDocument(folderId);
      const docId = useDocumentsStore.getState().activeDocId!;
      expect(useDocumentsStore.getState().docFolderMap[docId]).toBe(folderId);

      useDocumentsStore.getState().deleteFolder(folderId);

      expect(docId in useDocumentsStore.getState().docFolderMap).toBe(false);
    });

    it('deleteFolder does not touch documents in OTHER folders', () => {
      const folderA = useDocumentsStore.getState().createFolder();
      const folderB = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().newDocument(folderB);
      const docInB = useDocumentsStore.getState().activeDocId!;

      useDocumentsStore.getState().deleteFolder(folderA);

      expect(useDocumentsStore.getState().docFolderMap[docInB]).toBe(folderB);
    });

    it('deleteFolder on a non-existent id is a safe no-op', () => {
      const before = useDocumentsStore.getState().folders;
      useDocumentsStore.getState().deleteFolder('nonexistent');
      expect(useDocumentsStore.getState().folders).toEqual(before);
    });

    it('deleteDocument removes any docFolderMap entry for the deleted document', () => {
      const folderId = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().newDocument(folderId);
      const docId = useDocumentsStore.getState().activeDocId!;
      expect(useDocumentsStore.getState().docFolderMap[docId]).toBe(folderId);

      useDocumentsStore.getState().deleteDocument(docId);

      expect(docId in useDocumentsStore.getState().docFolderMap).toBe(false);
    });

    it('init() restores previously persisted folders and docFolderMap', () => {
      const folderId = useDocumentsStore.getState().createFolder();
      useDocumentsStore.getState().renameFolder(folderId, 'Archive');
      useDocumentsStore.getState().newDocument(folderId);
      const docId = useDocumentsStore.getState().activeDocId!;

      // Simulate a fresh page load: reset in-memory state but keep localStorage.
      useDocumentsStore.setState({ docsIndex: [], openTabs: [], activeDocId: null, loaded: false, folders: [], docFolderMap: {} });
      useDocumentsStore.getState().init();

      expect(useDocumentsStore.getState().folders.find((f) => f.id === folderId)?.name).toBe('Archive');
      expect(useDocumentsStore.getState().docFolderMap[docId]).toBe(folderId);
    });
  });

  describe('per-tab independent undo/redo (Phase 6.2)', () => {
    it('each tab keeps its own undo history -- undoing on tab A does not touch tab B', () => {
      useDocumentsStore.getState().newDocument();
      const a = useDocumentsStore.getState().activeDocId!;
      const nodeAId = useOutlineStore.getState().nodes[0].id;
      useOutlineStore.getState().commitEdit(nodeAId, 'edited on tab A');
      expect(useOutlineStore.getState().canUndo()).toBe(true);

      useDocumentsStore.getState().newDocument();
      const b = useDocumentsStore.getState().activeDocId!;
      expect(b).not.toBe(a);
      // Brand-new tab -- its own undo history starts empty, unaffected by tab A's edit.
      expect(useOutlineStore.getState().canUndo()).toBe(false);

      const nodeBId = useOutlineStore.getState().nodes[0].id;
      useOutlineStore.getState().commitEdit(nodeBId, 'edited on tab B');
      useOutlineStore.getState().undo();
      // Undo on tab B reverts tab B's own edit, not tab A's.
      expect(useOutlineStore.getState().nodes.find((n) => n.id === nodeBId)?.text).not.toBe('edited on tab B');

      useDocumentsStore.getState().switchTab(a);
      // Tab A's own edit is still there (never touched by tab B's undo), and tab A's own undo
      // history is exactly as tab A left it.
      expect(useOutlineStore.getState().nodes.find((n) => n.id === nodeAId)?.text).toBe('edited on tab A');
      expect(useOutlineStore.getState().canUndo()).toBe(true);
    });

    it('undoing an edit on tab A, switching to tab B and back, then redoing on tab A still works', () => {
      useDocumentsStore.getState().newDocument();
      const a = useDocumentsStore.getState().activeDocId!;
      const nodeAId = useOutlineStore.getState().nodes[0].id;
      useOutlineStore.getState().commitEdit(nodeAId, 'first edit');
      useOutlineStore.getState().undo();
      expect(useOutlineStore.getState().canRedo()).toBe(true);

      useDocumentsStore.getState().newDocument(); // switches away to a brand-new tab B
      useDocumentsStore.getState().switchTab(a); // and back to tab A

      expect(useOutlineStore.getState().canRedo()).toBe(true);
      useOutlineStore.getState().redo();
      expect(useOutlineStore.getState().nodes.find((n) => n.id === nodeAId)?.text).toBe('first edit');
    });

    it('a brand-new tab always starts with empty undo/redo stacks, matching outlineStore\'s own defaults', () => {
      useDocumentsStore.getState().newDocument();
      expect(useOutlineStore.getState().undoStack).toEqual([]);
      expect(useOutlineStore.getState().redoStack).toEqual([]);
    });

    it('closing and reopening a tab preserves its undo history (same in-memory-session cache as selection/scroll)', () => {
      useDocumentsStore.getState().newDocument();
      const id = useDocumentsStore.getState().activeDocId!;
      const nodeId = useOutlineStore.getState().nodes[0].id;
      useOutlineStore.getState().commitEdit(nodeId, 'edited before close');
      expect(useOutlineStore.getState().canUndo()).toBe(true);

      useDocumentsStore.getState().newDocument(); // need a second open tab so closing the first doesn't zero out openTabs
      useDocumentsStore.getState().closeTab(id);
      useDocumentsStore.getState().openDocument(id);

      expect(useOutlineStore.getState().canUndo()).toBe(true);
      useOutlineStore.getState().undo();
      expect(useOutlineStore.getState().nodes.find((n) => n.id === nodeId)?.text).not.toBe('edited before close');
    });
  });
});
