import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlineStore, defaultNodeStyles } from '../store/outlineStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import * as aiCapabilities from './aiCapabilities';
import { stripSummaryLabelCore, summariseSelectionIntoParent } from './aiSummarise';

function seedNodes() {
  useOutlineStore.setState({
    nodes: [
      { id: 1, depth: 0, text: 'root', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
      { id: 2, depth: 1, text: 'child A', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
      { id: 3, depth: 1, text: 'child B', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
    ],
    selectedId: 2,
    editingId: null,
    collapsedIds: new Set(),
    nextId: 100,
    multiSelectedIds: [2, 3],
    selectionAnchorId: 2,
    undoStack: [],
    redoStack: []
  });
}

describe('stripSummaryLabelCore (pure)', () => {
  it('strips a single layer of matching leading/trailing quotes', () => {
    expect(stripSummaryLabelCore('"Distribution Model Components"')).toBe('Distribution Model Components');
    expect(stripSummaryLabelCore("'Distribution Model Components'")).toBe('Distribution Model Components');
  });
  it('trims surrounding whitespace', () => {
    expect(stripSummaryLabelCore('  Distribution Model Components  ')).toBe('Distribution Model Components');
  });
  it('leaves unquoted text unchanged (aside from trimming)', () => {
    expect(stripSummaryLabelCore('Distribution Model Components')).toBe('Distribution Model Components');
  });
});

describe('summariseSelectionIntoParent', () => {
  beforeEach(() => {
    seedNodes();
    localStorage.clear();
    useAiSettingsStore.setState({ provider: 'gemini', model: 'gemini-3.5-flash', modelByProvider: {}, prompt: useAiSettingsStore.getState().prompt });
    vi.restoreAllMocks();
  });

  it('fails when fewer than 2 nodes are selected', async () => {
    useOutlineStore.setState({ multiSelectedIds: [] });
    const result = await summariseSelectionIntoParent();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Select 2 or more nodes');
  });

  it('fails cleanly when no AI key is configured', async () => {
    const result = await summariseSelectionIntoParent();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No AI provider key configured');
  });

  it('sends the selected roots\' bare texts and inserts the returned label as a new parent', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    const spy = vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('"Group Label"');
    const result = await summariseSelectionIntoParent();
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Summarised into: Group Label');
    expect(spy).toHaveBeenCalledWith(expect.any(String), 'Nodes:\n- child A\n- child B', 128, { providerId: 'gemini', model: 'gemini-3.5-flash', apiKey: 'sk-test', fallbackChain: [] });
    const nodes = useOutlineStore.getState().nodes;
    expect(nodes.map((n) => n.text)).toEqual(['root', 'Group Label', 'child A', 'child B']);
  });

  it('fails with a clear message on an empty AI response', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('');
    const result = await summariseSelectionIntoParent();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Empty response');
  });

  it('fails with a clear message when the AI returns an empty label after stripping quotes', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockResolvedValue('""');
    const result = await summariseSelectionIntoParent();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('empty label');
  });

  it('surfaces the underlying error on rejection', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockRejectedValue(new Error('quota exceeded'));
    const result = await summariseSelectionIntoParent();
    expect(result.ok).toBe(false);
    expect(result.message).toBe('quota exceeded');
  });

  it('aborts (no state change) when a selected root was deleted while the request was in flight', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApiWithPrompt').mockImplementation(async () => {
      // Simulate a concurrent deletion of one of the selected roots while the request is in flight.
      useOutlineStore.setState({ nodes: useOutlineStore.getState().nodes.filter((n) => n.id !== 3) });
      return 'Group Label';
    });
    const result = await summariseSelectionIntoParent();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Selection changed');
    expect(useOutlineStore.getState().nodes.some((n) => n.text === 'Group Label')).toBe(false);
  });
});
