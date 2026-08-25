import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlineStore, defaultNodeStyles } from '../store/outlineStore';
import { useDocumentsStore } from '../store/documentsStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import * as aiCapabilities from './aiCapabilities';
import {
  lookupIconForTextCore,
  buildHistoricalIconIndexCore,
  buildIconBatchPrompt,
  parseIconBatchResponseCore,
  parseIconOptionsResponseCore,
  suggestIconsForNodeIds,
  suggestIconChoiceForNode,
  suggestIconForSelection,
  suggestIconsForAllDocumentNodes,
  applyIconChoice
} from './aiIcon';

function seedNodes() {
  useOutlineStore.setState({
    nodes: [
      { id: 1, depth: 0, text: 'webshop checkout flow', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
      { id: 2, depth: 1, text: 'a completely unmatched label', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
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
  useDocumentsStore.setState({ docsIndex: [], openTabs: [], activeDocId: null, loaded: true, folders: [], docFolderMap: {} });
}

describe('lookupIconForTextCore (pure)', () => {
  it('matches a whole-word keyword case-insensitively', () => {
    expect(lookupIconForTextCore('Webshop checkout flow')).toBe('🛒');
  });
  it('does not match a substring that is not a whole word', () => {
    expect(lookupIconForTextCore('webshopping district')).toBe(null);
  });
  it('returns null when nothing matches', () => {
    expect(lookupIconForTextCore('a completely unmatched label')).toBe(null);
  });
});

describe('buildHistoricalIconIndexCore (pure)', () => {
  it('keys the map by the icon-stripped, lowercased label', () => {
    const map = buildHistoricalIconIndexCore([['🛒 Webshop Flow']]);
    expect(map.get('webshop flow')).toBe('🛒');
  });
  it('ignores entries with no leading icon', () => {
    const map = buildHistoricalIconIndexCore([['plain label']]);
    expect(map.size).toBe(0);
  });
  it('lets a later array win on a key collision', () => {
    const map = buildHistoricalIconIndexCore([['🛒 same label'], ['🚀 same label']]);
    expect(map.get('same label')).toBe('🚀');
  });
});

describe('buildIconBatchPrompt (pure)', () => {
  it('numbers each label and substitutes (untitled) for a blank one', () => {
    const prompt = buildIconBatchPrompt(['first', '', 'third']);
    expect(prompt).toContain('[1] first');
    expect(prompt).toContain('[2] (untitled)');
    expect(prompt).toContain('[3] third');
  });
});

describe('parseIconBatchResponseCore (pure)', () => {
  it('parses a numbered emoji-per-line response in order', () => {
    expect(parseIconBatchResponseCore('[1] 🛒\n[2] 🚀', 2)).toEqual(['🛒', '🚀']);
  });
  it('leaves an entry blank when its marker never comes back', () => {
    expect(parseIconBatchResponseCore('[1] 🛒', 2)).toEqual(['🛒', '']);
  });
  it('keeps only the first whitespace-separated token per line', () => {
    expect(parseIconBatchResponseCore('[1] 🛒 (shopping cart)', 1)).toEqual(['🛒']);
  });
});

describe('parseIconOptionsResponseCore (pure)', () => {
  it('splits on whitespace and keeps only single-emoji tokens', () => {
    expect(parseIconOptionsResponseCore('🛒 🚀 📦 💳')).toEqual(['🛒', '🚀', '📦', '💳']);
  });
  it('drops a non-emoji stray token', () => {
    expect(parseIconOptionsResponseCore('🛒 not-an-emoji 🚀')).toEqual(['🛒', '🚀']);
  });
});

describe('suggestIconsForNodeIds / suggestIconChoiceForNode / applyIconChoice', () => {
  beforeEach(() => {
    seedNodes();
    localStorage.clear();
    useAiSettingsStore.setState({ provider: 'gemini', model: 'gemini-3.5-flash', modelByProvider: {}, prompt: useAiSettingsStore.getState().prompt });
    vi.restoreAllMocks();
  });

  describe('suggestIconsForNodeIds', () => {
    it('fails for an empty id list', async () => {
      const result = await suggestIconsForNodeIds([]);
      expect(result.ok).toBe(false);
    });

    it('applies a keyword-tier icon without any AI call', async () => {
      const spy = vi.spyOn(aiCapabilities, 'callAiApiWithPrompt');
      const result = await suggestIconsForNodeIds([1]);
      expect(result.ok).toBe(true);
      expect(spy).not.toHaveBeenCalled();
      expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('🛒 webshop checkout flow');
    });

    it('fails cleanly when an AI call is needed but no key is configured', async () => {
      const result = await suggestIconsForNodeIds([2]);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No AI provider key configured');
    });

    it('falls through to the AI for an unmatched label and applies the result', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('[1] 🚀');
      const result = await suggestIconsForNodeIds([2]);
      expect(result.ok).toBe(true);
      expect(spy).toHaveBeenCalledWith('', expect.stringContaining('[1] a completely unmatched label'), expect.any(Number), { providerId: 'gemini', model: 'gemini-3.5-flash', apiKey: 'sk-test' });
      expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('🚀 a completely unmatched label');
    });

    it('dedupes identical labels into a single AI lookup', async () => {
      useOutlineStore.setState({
        nodes: [
          { id: 1, depth: 0, text: 'same label', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
          { id: 2, depth: 0, text: 'same label', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
        ]
      });
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      const spy = vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('[1] 🚀');
      await suggestIconsForNodeIds([1, 2]);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(useOutlineStore.getState().nodes.map((n) => n.text)).toEqual(['🚀 same label', '🚀 same label']);
    });

    it('reports no suitable icons found when the AI returns nothing usable', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('');
      const result = await suggestIconsForNodeIds([2]);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No suitable icons found');
    });

    it('surfaces the underlying error on rejection', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockRejectedValue(new Error('quota exceeded'));
      const result = await suggestIconsForNodeIds([2]);
      expect(result.ok).toBe(false);
      expect(result.message).toBe('quota exceeded');
    });
  });

  describe('suggestIconChoiceForNode', () => {
    it('fails for a node id that does not exist', async () => {
      const result = await suggestIconChoiceForNode(999999);
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Node not found.');
    });

    it('fails for a node with no text', async () => {
      const result = await suggestIconChoiceForNode(3);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Add some text');
    });

    it('auto-applies directly when there is exactly one candidate (keyword tier, no key configured)', async () => {
      const result = await suggestIconChoiceForNode(1);
      expect(result.ok).toBe(true);
      expect(result.candidates).toBeUndefined();
      expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('🛒 webshop checkout flow');
    });

    it('returns candidates for a picker when the AI adds distinct options on top of the keyword tier', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('🚀 📦 💳 🔑');
      const result = await suggestIconChoiceForNode(1);
      expect(result.ok).toBe(true);
      expect(result.candidates).toEqual(['🛒', '🚀', '📦', '💳', '🔑']);
      expect(result.nodeId).toBe(1);
      // nothing applied yet
      expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('webshop checkout flow');
    });

    it('reports no suitable icons found when there is no key and no keyword/history match', async () => {
      const result = await suggestIconChoiceForNode(2);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No AI provider key configured');
    });

    it('still returns the keyword-tier candidate even when the AI options call fails', async () => {
      await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
      vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockRejectedValue(new Error('network down'));
      const result = await suggestIconChoiceForNode(1);
      expect(result.ok).toBe(true);
      expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('🛒 webshop checkout flow');
    });
  });

  describe('applyIconChoice', () => {
    it('applies the chosen icon to the node', () => {
      const result = applyIconChoice(1, '🚀');
      expect(result.ok).toBe(true);
      expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('🚀 webshop checkout flow');
    });
    it('fails for a node id that does not exist', () => {
      const result = applyIconChoice(999999, '🚀');
      expect(result.ok).toBe(false);
    });
  });

  describe('suggestIconForSelection', () => {
    it('routes a multi-selection through the batch path', async () => {
      const result = await suggestIconForSelection([1, 2]);
      // node 1 matches the keyword tier; node 2 needs AI but no key is configured -> whole batch fails
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No AI provider key configured');
    });
    it('routes a single selection through the picker-capable path', async () => {
      const result = await suggestIconForSelection([1]);
      expect(result.ok).toBe(true);
      expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('🛒 webshop checkout flow');
    });
    it('fails when nothing is selected', async () => {
      const result = await suggestIconForSelection([]);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Select a node first');
    });
  });

  describe('suggestIconsForAllDocumentNodes', () => {
    it('fails when the document has no nodes', async () => {
      useOutlineStore.setState({ nodes: [] });
      const result = await suggestIconsForAllDocumentNodes();
      expect(result.ok).toBe(false);
      expect(result.message).toContain('No nodes');
    });
    it('suggests icons for every node in the document', async () => {
      useOutlineStore.setState({
        nodes: [{ id: 1, depth: 0, text: 'webshop checkout flow', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }]
      });
      const result = await suggestIconsForAllDocumentNodes();
      expect(result.ok).toBe(true);
      expect(useOutlineStore.getState().nodes[0].text).toBe('🛒 webshop checkout flow');
    });
  });
});
