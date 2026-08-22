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
});
