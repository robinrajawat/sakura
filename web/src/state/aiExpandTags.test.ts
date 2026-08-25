import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlineStore, defaultNodeStyles } from '../store/outlineStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import * as aiCapabilities from './aiCapabilities';
import { expandNode, suggestTags, parseExpandResponseCore, normalizeTagCore, parseTagsResponseCore } from './aiExpandTags';

function seedNodes() {
  useOutlineStore.setState({
    nodes: [
      { id: 1, depth: 0, text: 'root text here', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
      { id: 2, depth: 1, text: 'child text here', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: ['existing'], styles: defaultNodeStyles() },
      { id: 3, depth: 0, text: '', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
    ],
    selectedId: 1,
    editingId: null,
    collapsedIds: new Set(),
    nextId: 100,
    multiSelectedIds: [],
    selectionAnchorId: 1,
    undoStack: [],
    redoStack: []
  });
}

describe('parseExpandResponseCore (pure)', () => {
  it('strips bullet prefixes and drops blank lines', () => {
    expect(parseExpandResponseCore('- one\n* two\n+ three\n• four\n●five\n\nsix')).toEqual(['one', 'two', 'three', 'four', 'five', 'six']);
  });
  it('returns [] for empty input', () => {
    expect(parseExpandResponseCore('')).toEqual([]);
  });
});

describe('normalizeTagCore (pure)', () => {
  it('lowercases, hyphenates spaces, strips invalid chars, caps length', () => {
    expect(normalizeTagCore('Pricing Model')).toBe('pricing-model');
    expect(normalizeTagCore('EWM #123!')).toBe('ewm-123');
    expect(normalizeTagCore('a'.repeat(60))).toBe('a'.repeat(40));
  });
});

describe('parseTagsResponseCore (pure)', () => {
  it('parses a real JSON array response', () => {
    expect(parseTagsResponseCore('["Pricing", "Integration"]')).toEqual(['pricing', 'integration']);
  });
  it('strips a ```json fence around the array', () => {
    expect(parseTagsResponseCore('```json\n["a", "b"]\n```')).toEqual(['a', 'b']);
  });
  it('falls back to a comma/newline split when JSON parsing fails', () => {
    expect(parseTagsResponseCore('pricing, integration\nsecurity')).toEqual(['pricing', 'integration', 'security']);
  });
  it('returns [] when the parsed JSON is not an array', () => {
    expect(parseTagsResponseCore('{"not": "an array"}')).toEqual([]);
  });
});

describe('expandNode / suggestTags', () => {
  beforeEach(() => {
    seedNodes();
    localStorage.clear();
    useAiSettingsStore.setState({ provider: 'gemini', model: 'gemini-3.5-flash', modelByProvider: {}, prompt: useAiSettingsStore.getState().prompt });
    vi.restoreAllMocks();
  });

  describe('expandNode', () => {
    it('fails for a node id that does not exist', async () => {
      const result = await expandNode(999999);
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Node not found.');
    });

    it('fails for a node with no text', async () => {
      const result = await expandNode(3);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Nothing to expand');
    });

    it('fails cleanly when no AI key is configured', async () => {
      const result = await expandNode(1);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No AI provider key configured');
    });

    it('parses the response and inserts children right after the node', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('- Sub item A\n- Sub item B\n- Sub item C');
      const result = await expandNode(1);
      expect(result.ok).toBe(true);
      expect(result.message).toContain('3 nodes');
      expect(spy).toHaveBeenCalledWith(expect.any(String), 'Node: root text here', 512, { providerId: 'gemini', model: 'gemini-3.5-flash', apiKey: 'sk-test', fallbackChain: [] });
      const nodes = useOutlineStore.getState().nodes;
      expect(nodes.map((n) => n.text)).toEqual(['root text here', 'Sub item A', 'Sub item B', 'Sub item C', 'child text here', '']);
    });

    it('fails with a clear message on an empty AI response', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('');
      const result = await expandNode(1);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Empty response');
    });

    it('surfaces the underlying error on rejection', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockRejectedValue(new Error('quota exceeded'));
      const result = await expandNode(1);
      expect(result.ok).toBe(false);
      expect(result.message).toBe('quota exceeded');
    });
  });

  describe('suggestTags', () => {
    it('fails for a node id that does not exist', async () => {
      const result = await suggestTags(999999);
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Node not found.');
    });

    it('fails for a node with no text', async () => {
      const result = await suggestTags(3);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Nothing to tag');
    });

    it('fails cleanly when no AI key is configured', async () => {
      const result = await suggestTags(1);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No AI provider key configured');
    });

    it('sends existing tags across the whole document as context', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('["existing", "brand-new"]');
      await suggestTags(1);
      expect(spy.mock.calls[0][1]).toBe('Node: root text here\nExisting tags: existing');
    });

    it('says "none" when the document has no existing tags at all', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      useOutlineStore.setState({ nodes: useOutlineStore.getState().nodes.map((n) => ({ ...n, tags: [] })) });
      const spy = vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('["x"]');
      await suggestTags(1);
      expect(spy.mock.calls[0][1]).toContain('Existing tags: none');
    });

    it('adds only genuinely new tags to the node', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('["existing", "brand-new"]');
      const result = await suggestTags(2);
      expect(result.ok).toBe(true);
      expect(result.message).toBe('Added tags: #brand-new');
      expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.tags).toEqual(['existing', 'brand-new']);
    });

    it('reports "No new tags to add" without error when every suggested tag already exists', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('["existing"]');
      const result = await suggestTags(2);
      expect(result.ok).toBe(true);
      expect(result.message).toBe('No new tags to add.');
    });

    it('fails with a clear message on an empty AI response', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('');
      const result = await suggestTags(1);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Empty response');
    });

    it('fails with a clear message when the AI returns no usable tags', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('[]');
      const result = await suggestTags(1);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('AI returned no tags');
    });
  });
});
