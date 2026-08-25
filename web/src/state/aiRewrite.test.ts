import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlineStore, defaultNodeStyles } from '../store/outlineStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import * as aiCapabilities from './aiCapabilities';
import { aiSnapshotChanged, rewriteNode, rewriteNodes, rewriteDocument } from './aiRewrite';

function seedNodes() {
  useOutlineStore.setState({
    nodes: [
      { id: 1, depth: 0, text: 'root text here', parentId: null, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
      { id: 2, depth: 1, text: 'child text here', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() },
      { id: 3, depth: 1, text: 'sibling text here', parentId: 1, isCheckbox: false, checked: false, note: '', codeBlock: null, tags: [], styles: defaultNodeStyles() }
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

describe('aiSnapshotChanged (pure)', () => {
  it('is false when the text is unchanged', () => {
    expect(aiSnapshotChanged('same', 'same')).toBe(false);
  });
  it('is true when the text changed', () => {
    expect(aiSnapshotChanged('original', 'edited since')).toBe(true);
  });
});

describe('rewriteNode / rewriteNodes / rewriteDocument', () => {
  beforeEach(() => {
    seedNodes();
    localStorage.clear();
    useAiSettingsStore.setState({ provider: 'gemini', model: 'gemini-3.5-flash', modelByProvider: {}, prompt: useAiSettingsStore.getState().prompt });
    vi.restoreAllMocks();
  });

  it('rewriteNode fails with a clear message when no AI key is configured', async () => {
    const result = await rewriteNode(1);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No AI provider key configured');
  });

  it('rewriteNode fails for a node id that does not exist', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    const result = await rewriteNode(999999);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Node not found.');
  });

  it('rewriteNode applies the AI result to the node text', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApi').mockResolvedValue('corrected root text');
    const result = await rewriteNode(1);
    expect(result.ok).toBe(true);
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('corrected root text');
  });

  it('rewriteNode passes the current prompt and node text through to callAiApi', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    useAiSettingsStore.getState().setPrompt('a custom rewrite prompt');
    const spy = vi.spyOn(aiCapabilities, 'callAiApi').mockResolvedValue('x');
    await rewriteNode(2);
    expect(spy).toHaveBeenCalledWith('child text here', 'a custom rewrite prompt', { providerId: 'gemini', model: 'gemini-3.5-flash', apiKey: 'sk-test' });
  });

  it('rewriteNode discards the result if the node was edited again while the request was in flight', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApi').mockImplementation(async () => {
      // Simulate the user editing the node again before the AI responds.
      useOutlineStore.getState().applyAiTextResult(1, 'user edited this again');
      return 'stale ai result';
    });
    const result = await rewriteNode(1);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('edited again');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('user edited this again');
  });

  it('rewriteNode refuses to double-fire while already in flight for the same node', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    let resolveCall: (v: string) => void;
    vi.spyOn(aiCapabilities, 'callAiApi').mockImplementation(() => new Promise((resolve) => (resolveCall = resolve)));
    const first = rewriteNode(1);
    const second = await rewriteNode(1);
    expect(second.ok).toBe(false);
    expect(second.message).toContain('Already rewriting');
    resolveCall!('done');
    await first;
  });

  it('rewriteNode surfaces the underlying error message on failure', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApi').mockRejectedValue(new Error('Invalid API key'));
    const result = await rewriteNode(1);
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Invalid API key');
  });

  it('rewriteNodes applies a batch result to every id', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApiBatch').mockResolvedValue(['fixed root', 'fixed child']);
    const result = await rewriteNodes([1, 2]);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Rewrote 2 node(s).');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('fixed root');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('fixed child');
  });

  it('rewriteNodes skips a node edited during the request without blocking the rest of the batch', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    vi.spyOn(aiCapabilities, 'callAiApiBatch').mockImplementation(async () => {
      useOutlineStore.getState().applyAiTextResult(1, 'user edited node 1 mid-flight');
      return ['stale for node 1', 'fixed child'];
    });
    const result = await rewriteNodes([1, 2]);
    expect(result.ok).toBe(true);
    expect(result.message).toBe('Rewrote 1 node(s), skipped 1 edited during the request.');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 1)?.text).toBe('user edited node 1 mid-flight');
    expect(useOutlineStore.getState().nodes.find((n) => n.id === 2)?.text).toBe('fixed child');
  });

  it('rewriteNodes fails cleanly when no AI key is configured', async () => {
    const result = await rewriteNodes([1, 2]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('No AI provider key configured');
  });

  it('rewriteDocument rewrites every node in the current document', async () => {
    await useAiSettingsStore.getState().saveKeyForProvider('gemini', 'sk-test');
    const spy = vi.spyOn(aiCapabilities, 'callAiApiBatch').mockResolvedValue(['R1', 'R2', 'R3']);
    const result = await rewriteDocument();
    expect(result.ok).toBe(true);
    expect(spy.mock.calls[0][0]).toEqual(['root text here', 'child text here', 'sibling text here']);
    expect(useOutlineStore.getState().nodes.map((n) => n.text)).toEqual(['R1', 'R2', 'R3']);
  });

  it('rewriteDocument is a no-op for an empty document', async () => {
    useOutlineStore.setState({ nodes: [] });
    const result = await rewriteDocument();
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Nothing to rewrite.');
  });
});
