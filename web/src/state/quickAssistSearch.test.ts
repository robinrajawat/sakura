import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlineStore, defaultNodeStyles, type OutlineNode } from '../store/outlineStore';
import { useDocumentsStore } from '../store/documentsStore';
import { useSidebarStore } from '../store/sidebarStore';
import { useNotePanelStore } from '../store/notePanelStore';
import { qaTokenizeQuery, qaHayMatches, buildMatchSnippet, collectQaSearchGroups, qaParseCategoryPrefix, QA_SEARCH_CATEGORIES, QA_CATEGORY_PRIMARY_PREFIX } from './quickAssistSearch';

function node(overrides: Partial<OutlineNode>): OutlineNode {
  return {
    id: 1,
    depth: 0,
    text: '',
    parentId: null,
    isCheckbox: false,
    checked: false,
    note: '',
    codeBlock: null,
    tags: [],
    styles: defaultNodeStyles(),
    ...overrides
  };
}

describe('qaTokenizeQuery / qaHayMatches (pure)', () => {
  it('tokenizes on whitespace', () => {
    expect(qaTokenizeQuery('freight  EWM  unit')).toEqual(['freight', 'EWM', 'unit']);
  });

  it('AND-matches tokens regardless of order', () => {
    expect(qaHayMatches('EWM freight unit', qaTokenizeQuery('freight ewm'))).toBe(true);
    expect(qaHayMatches('EWM freight unit', qaTokenizeQuery('freight zzz'))).toBe(false);
  });

  it('returns false for empty tokens', () => {
    expect(qaHayMatches('anything', [])).toBe(false);
  });

  it('lowercases the haystack but not the tokens -- callers must lowercase the query first, matching legacy\'s own real qaHayMatches contract', () => {
    expect(qaHayMatches('Budget Plan', ['budget'])).toBe(true);
    expect(qaHayMatches('Budget Plan', ['Budget'])).toBe(false);
  });
});

describe('buildMatchSnippet (pure)', () => {
  it('windows a ±26-char slice around the earliest token match with ellipses', () => {
    const text = 'a'.repeat(40) + 'needle' + 'b'.repeat(40);
    const snippet = buildMatchSnippet(text, ['needle']);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('needle');
  });

  it('falls back to the first 64 chars when no token is found', () => {
    const text = 'x'.repeat(100);
    expect(buildMatchSnippet(text, ['zzz'])).toBe('x'.repeat(64));
  });
});

describe('qaParseCategoryPrefix (pure)', () => {
  it('parses a recognized alias prefix, returning the rest of the text', () => {
    expect(qaParseCategoryPrefix('notes: budget')).toEqual({ categoryKey: 'notes', rest: 'budget' });
    expect(qaParseCategoryPrefix('note:budget')).toEqual({ categoryKey: 'notes', rest: 'budget' });
    expect(qaParseCategoryPrefix('doc: roadmap')).toEqual({ categoryKey: 'documents', rest: 'roadmap' });
  });

  it('is case-insensitive on the prefix itself', () => {
    expect(qaParseCategoryPrefix('NOTES: budget')).toEqual({ categoryKey: 'notes', rest: 'budget' });
  });

  it('returns null for an unrecognized prefix or no colon at all', () => {
    expect(qaParseCategoryPrefix('zzz: budget')).toBeNull();
    expect(qaParseCategoryPrefix('just a plain query')).toBeNull();
  });

  it('every category has a working primary-prefix round-trip', () => {
    QA_SEARCH_CATEGORIES.forEach((c) => {
      const prefix = QA_CATEGORY_PRIMARY_PREFIX[c.key];
      expect(qaParseCategoryPrefix(`${prefix}: x`)?.categoryKey).toBe(c.key);
    });
  });
});

describe('collectQaSearchGroups', () => {
  beforeEach(() => {
    localStorage.clear();
    useDocumentsStore.setState({ docsIndex: [], openTabs: [], activeDocId: null, loaded: false, folders: [], docFolderMap: {} });
    useOutlineStore.setState({ nodes: [], selectedId: null, editingId: null, collapsedIds: new Set(), nextId: 100, multiSelectedIds: [], selectionAnchorId: null, undoStack: [], redoStack: [] });
    useSidebarStore.setState({ open: true, width: 234, loaded: true });
    useNotePanelStore.setState({ open: false, nodeId: null, mode: 'note', maximized: false, position: null });
  });

  it('returns nothing for an empty query', () => {
    expect(collectQaSearchGroups('')).toEqual([]);
  });

  it('Documents: matches by title, marks the current document', () => {
    useDocumentsStore.setState({
      docsIndex: [
        { id: 'a', title: 'Budget Plan', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null },
        { id: 'b', title: 'Roadmap', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }
      ],
      activeDocId: 'a'
    });
    const groups = collectQaSearchGroups('budget');
    const docsGroup = groups.find((g) => g.name === 'Documents');
    expect(docsGroup?.items).toHaveLength(1);
    expect(docsGroup?.items[0].label).toBe('● Budget Plan');
    expect(docsGroup?.items[0].meta).toBe('Current document');
  });

  it('Documents: navigates via openDocument when switching to a non-active document', () => {
    useDocumentsStore.setState({
      docsIndex: [
        { id: 'a', title: 'Budget Plan', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null },
        { id: 'b', title: 'Roadmap', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }
      ],
      activeDocId: 'a'
    });
    const spy = vi.spyOn(useDocumentsStore.getState(), 'openDocument').mockImplementation(() => {});
    const groups = collectQaSearchGroups('roadmap');
    groups.find((g) => g.name === 'Documents')!.items[0].action();
    expect(spy).toHaveBeenCalledWith('b');
  });

  it('In documents: matches the active document live via outlineStore, not stale storage', () => {
    useDocumentsStore.setState({ docsIndex: [{ id: 'a', title: 'Doc A', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }], activeDocId: 'a' });
    useOutlineStore.setState({ nodes: [node({ id: 1, text: 'the quarterly forecast' })] });
    const groups = collectQaSearchGroups('quarterly');
    const hit = groups.find((g) => g.name === 'In documents')?.items[0];
    expect(hit?.label).toContain('quarterly');
    expect(hit?.meta).toBe('● Doc A');
  });

  it('In documents: matches another (non-active) document from its stored nodes', () => {
    useDocumentsStore.setState({
      docsIndex: [
        { id: 'a', title: 'Doc A', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null },
        { id: 'b', title: 'Doc B', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }
      ],
      activeDocId: 'a'
    });
    localStorage.setItem('sakura_web_doc_b_v1', JSON.stringify({ title: 'Doc B', nodes: [node({ id: 5, text: 'a hidden treasure' })] }));
    const groups = collectQaSearchGroups('treasure');
    const hit = groups.find((g) => g.name === 'In documents')?.items[0];
    expect(hit?.meta).toBe('Doc B');
    const spy = vi.spyOn(useDocumentsStore.getState(), 'openDocument').mockImplementation(() => {});
    const selectSpy = vi.spyOn(useOutlineStore.getState(), 'selectNode');
    hit?.action();
    expect(spy).toHaveBeenCalledWith('b');
    expect(selectSpy).toHaveBeenCalledWith(5);
  });

  it('caps node-text matches at 2 per document and 6 total', () => {
    useDocumentsStore.setState({ docsIndex: [{ id: 'a', title: 'Doc A', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }], activeDocId: 'a' });
    useOutlineStore.setState({
      nodes: Array.from({ length: 5 }, (_, i) => node({ id: i + 1, text: `match ${i}` }))
    });
    const groups = collectQaSearchGroups('match');
    expect(groups.find((g) => g.name === 'In documents')?.items).toHaveLength(2);
  });

  it('Notes: strips HTML before matching and snippeting, opens the note panel on click', () => {
    useDocumentsStore.setState({ docsIndex: [{ id: 'a', title: 'Doc A', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }], activeDocId: 'a' });
    useOutlineStore.setState({ nodes: [node({ id: 2, note: '<p>remember the <b>onboarding</b> checklist</p>' })] });
    const groups = collectQaSearchGroups('onboarding');
    const hit = groups.find((g) => g.name === 'Notes')?.items[0];
    expect(hit?.label).not.toContain('<b>');
    expect(hit?.label).toContain('onboarding');
    const selectSpy = vi.spyOn(useOutlineStore.getState(), 'selectNode');
    const openSpy = vi.spyOn(useNotePanelStore.getState(), 'openPanel');
    hit?.action();
    expect(selectSpy).toHaveBeenCalledWith(2);
    expect(openSpy).toHaveBeenCalledWith(2, true, false, 'note');
  });

  it('Code: matches raw code text, opens the note panel on the code tab', () => {
    useDocumentsStore.setState({ docsIndex: [{ id: 'a', title: 'Doc A', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }], activeDocId: 'a' });
    useOutlineStore.setState({ nodes: [node({ id: 3, codeBlock: { lang: 'js', code: 'function computeTotal(){}' } })] });
    // Mixed-case query on purpose -- collectQaSearchGroups lowercases defensively (see its own header).
    const groups = collectQaSearchGroups('computeTotal');
    const hit = groups.find((g) => g.name === 'Code')?.items[0];
    expect(hit?.label).toContain('computeTotal');
    const openSpy = vi.spyOn(useNotePanelStore.getState(), 'openPanel');
    hit?.action();
    expect(openSpy).toHaveBeenCalledWith(3, false, true, 'code');
  });

  it('Tags: matches a tag, not the node text, labels with a # prefix', () => {
    useDocumentsStore.setState({ docsIndex: [{ id: 'a', title: 'Doc A', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }], activeDocId: 'a' });
    useOutlineStore.setState({ nodes: [node({ id: 4, text: 'quarterly review', tags: ['urgent', 'finance'] })] });
    const groups = collectQaSearchGroups('urgent');
    const hit = groups.find((g) => g.name === 'Tags')?.items[0];
    expect(hit?.label).toBe('#urgent — quarterly review');
  });

  it('Folders: matches by name, reports the parent path', () => {
    useDocumentsStore.setState({
      folders: [
        { id: 'root', name: 'Projects', open: false, parentId: null },
        { id: 'child', name: 'Budget 2026', open: false, parentId: 'root' }
      ]
    });
    const groups = collectQaSearchGroups('budget');
    const hit = groups.find((g) => g.name === 'Folders')?.items[0];
    expect(hit?.label).toBe('Budget 2026');
    expect(hit?.meta).toBe('In Projects');
  });

  it('Folders: clicking opens the sidebar and expands every closed ancestor, leaving open ones untouched', () => {
    useSidebarStore.setState({ open: false, width: 234, loaded: true });
    useDocumentsStore.setState({
      folders: [
        { id: 'root', name: 'Projects', open: true, parentId: null },
        { id: 'mid', name: 'Active', open: false, parentId: 'root' },
        { id: 'child', name: 'Budget 2026', open: false, parentId: 'mid' }
      ]
    });
    const groups = collectQaSearchGroups('budget');
    groups.find((g) => g.name === 'Folders')!.items[0].action();
    expect(useSidebarStore.getState().open).toBe(true);
    const folders = useDocumentsStore.getState().folders;
    expect(folders.find((f) => f.id === 'root')!.open).toBe(true);
    expect(folders.find((f) => f.id === 'mid')!.open).toBe(true);
    expect(folders.find((f) => f.id === 'child')!.open).toBe(true);
  });

  it('drains a single shared budget of 8 across every group, in group order', () => {
    useDocumentsStore.setState({
      docsIndex: Array.from({ length: 6 }, (_, i) => ({ id: `d${i}`, title: `match doc ${i}`, createdAt: 1, modifiedAt: 1, status: '', author: '', link: null })),
      activeDocId: 'd0'
    });
    useOutlineStore.setState({ nodes: [node({ id: 1, text: 'a match here' })] });
    const groups = collectQaSearchGroups('match');
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBeLessThanOrEqual(8);
    expect(groups[0].name).toBe('Documents');
  });

  it('a scopedCategoryKey restricts results to just that one category', () => {
    useDocumentsStore.setState({ docsIndex: [{ id: 'a', title: 'Doc A', createdAt: 1, modifiedAt: 1, status: '', author: '', link: null }], activeDocId: 'a' });
    useOutlineStore.setState({ nodes: [node({ id: 1, text: 'a match here', note: '<p>a match here too</p>' })] });
    const scoped = collectQaSearchGroups('match', 'notes');
    expect(scoped.map((g) => g.name)).toEqual(['Notes']);
    const unscoped = collectQaSearchGroups('match');
    expect(unscoped.map((g) => g.name)).toContain('In documents');
    expect(unscoped.map((g) => g.name)).toContain('Notes');
  });
});
