import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlineStore, defaultNodeStyles } from '../store/outlineStore';
import { useDocumentsStore } from '../store/documentsStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import * as aiCapabilities from './aiCapabilities';
import { generateOutline, restructureText } from './aiOutline';

function seedNodes() {
  useOutlineStore.setState({
    nodes: [
      { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
      { id: 2, depth: 1, text: 'child', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
    ],
    selectedId: 2,
    editingId: null,
    collapsedIds: new Set(),
    nextId: 100,
    multiSelectedIds: [],
    selectionAnchorId: 2,
    undoStack: [],
    redoStack: []
  });
}

describe('generateOutline / restructureText', () => {
  beforeEach(() => {
    seedNodes();
    localStorage.clear();
    useAiSettingsStore.setState({ provider: 'gemini', model: 'gemini-3.5-flash', modelByProvider: {}, prompt: useAiSettingsStore.getState().prompt });
    vi.restoreAllMocks();
  });

  describe('generateOutline', () => {
    it('fails for an empty/whitespace-only topic', async () => {
      const result = await generateOutline('   ');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Enter a topic first');
    });

    it('fails cleanly when no AI key is configured', async () => {
      const result = await generateOutline('a real topic');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No AI provider key configured');
    });

    it('parses the AI response and nests it as children of the current selection', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiCapabilities, 'callAiApiOutline').mockResolvedValue('- Point one\n- Point two\n  - Sub point');
      const result = await generateOutline('competitor analysis');
      expect(result.ok).toBe(true);
      expect(spy).toHaveBeenCalledWith('competitor analysis', { providerId: 'gemini', model: 'gemini-3.5-flash', apiKey: 'sk-test', fallbackChain: [] });

      const nodes = useOutlineStore.getState().nodes;
      // seed: node 1 (depth 0), node 2 (depth 1, selected) -- new nodes nest as children of 2,
      // so depth 2/2/3, spliced right after node 2's own subtree.
      const inserted = nodes.slice(2);
      expect(inserted.map((n) => n.text)).toEqual(['Point one', 'Point two', 'Sub point']);
      expect(inserted.map((n) => n.depth)).toEqual([2, 2, 3]);
    });

    it('fails with a clear message when the AI returns an empty response', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiOutline').mockResolvedValue('');
      const result = await generateOutline('topic');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Empty response');
    });

    it('fails with a clear message when the AI response has no usable lines', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiOutline').mockResolvedValue('   \n  ');
      const result = await generateOutline('topic');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('did not return a usable outline');
    });

    it('surfaces the underlying error message on rejection', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiOutline').mockRejectedValue(new Error('rate limited'));
      const result = await generateOutline('topic');
      expect(result.ok).toBe(false);
      expect(result.message).toBe('rate limited');
    });

    it('pushes a real undo checkpoint', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiOutline').mockResolvedValue('- new point');
      const before = useOutlineStore.getState().nodes;
      await generateOutline('topic');
      expect(useOutlineStore.getState().canUndo()).toBe(true);
      useOutlineStore.getState().undo();
      expect(useOutlineStore.getState().nodes).toEqual(before);
    });
  });

  describe('restructureText', () => {
    it('fails for empty/whitespace-only input', async () => {
      const result = await restructureText('   ');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Paste some text first');
    });

    it('skips the AI entirely for already-structured text and lands in a new document', async () => {
      const spy = vi.spyOn(aiCapabilities, 'callAiApiRestructure');
      const docCountBefore = useDocumentsStore.getState().docsIndex.length;
      const result = await restructureText('Root\n  Child\n    Grandchild');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('without AI');
      expect(spy).not.toHaveBeenCalled();
      expect(useDocumentsStore.getState().docsIndex.length).toBe(docCountBefore + 1);
      const nodes = useOutlineStore.getState().nodes;
      expect(nodes.map((n) => n.text)).toEqual(['Root', 'Child', 'Grandchild']);
      expect(nodes.map((n) => n.depth)).toEqual([0, 1, 2]);
      spy.mockRestore();
    });

    it('calls the AI for flat unstructured text and lands the parsed result in a new document', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiCapabilities, 'callAiApiRestructure').mockResolvedValue('- Group A\n  - Item 1\n- Group B');
      const result = await restructureText('a big wall of unstructured prose with no bullets or indentation at all here');
      expect(result.ok).toBe(true);
      expect(spy).toHaveBeenCalled();
      const nodes = useOutlineStore.getState().nodes;
      expect(nodes.map((n) => n.text)).toEqual(['Group A', 'Item 1', 'Group B']);
    });

    it('fails cleanly when no AI key is configured for unstructured text', async () => {
      const result = await restructureText('a big wall of unstructured prose with no bullets or indentation at all here');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No AI provider key configured');
    });

    it('always lands in a brand-new document, never merging into the currently-open one', async () => {
      const originalNodes = useOutlineStore.getState().nodes;
      await restructureText('Root\n  Child');
      const newNodes = useOutlineStore.getState().nodes;
      expect(newNodes).not.toEqual(originalNodes);
      expect(newNodes.map((n) => n.text)).toEqual(['Root', 'Child']);
    });

    it('assigns fresh, non-colliding ids and bumps nextId past what it used (newDocument() resets nextId for the new document\'s own id space)', async () => {
      await restructureText('Root\n  Child');
      const nodes = useOutlineStore.getState().nodes;
      const ids = nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length); // no collisions
      expect(useOutlineStore.getState().nextId).toBe(Math.max(...ids) + 1);
    });

    it('fails with a clear message when the AI response has no usable lines', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiRestructure').mockResolvedValue('   ');
      const result = await restructureText('flat unstructured prose with no bullets or indent');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('did not return a usable structure');
    });
  });
});
