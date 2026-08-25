import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useOutlineStore, defaultNodeStyles } from '../store/outlineStore';
import { useSidebarStore } from '../store/sidebarStore';
import { useThemeStore } from '../store/themeStore';
import { useAutoRewriteStore } from '../store/autoRewriteStore';
import { useOutlinePrefsStore } from '../store/outlinePrefsStore';
import { useDocumentsStore } from '../store/documentsStore';
import * as aiRewrite from './aiRewrite';
import * as aiExpandTags from './aiExpandTags';
import * as aiOutline from './aiOutline';
import * as aiSummarise from './aiSummarise';
import {
  QA_COMMANDS,
  QA_ACTIONS,
  buildQaActionsWithRestructureDialog,
  qaPhraseMatch,
  qaBestPhrase,
  qaParseVerb,
  qaParseTargets,
  qaParse,
  qaSuggestForBareVerb,
  qaParseActionsList,
  qaSuggestActionsForBareVerb,
  qaVerbLabel,
  qaResolvedValue,
  qaExecuteCommand,
  buildQaEntries,
  navigableQaEntries,
  buildQaPickerEntries,
  qaPickerInsertText,
  QA_PICKER_VERBS,
  type QaAction,
  type QaEntry
} from './quickAssist';

function findCommand(id: string) {
  const cmd = QA_COMMANDS.find((c) => c.id === id);
  if (!cmd) throw new Error(`no such command: ${id}`);
  return cmd;
}

function findAction(id: string) {
  const action = QA_ACTIONS.find((a) => a.id === id);
  if (!action) throw new Error(`no such action: ${id}`);
  return action;
}

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
    selectionAnchorId: null,
    undoStack: [],
    redoStack: []
  });
}

describe('qaPhraseMatch / qaBestPhrase (pure)', () => {
  it('matches a whole-word/phrase substring, padded with spaces', () => {
    expect(qaPhraseMatch('hide toolbar', 'hide')).toBe(true);
    expect(qaPhraseMatch('overhide toolbar', 'hide')).toBe(false);
  });

  it('longest-match-wins: "get rid of" beats "get" even though both match', () => {
    expect(qaBestPhrase('get rid of toolbar', ['get', 'get rid of'])).toBe('get rid of');
  });

  it('returns null when nothing matches', () => {
    expect(qaBestPhrase('xyz', ['get', 'hide'])).toBeNull();
  });
});

describe('qaParseVerb / qaParseTargets / qaParse', () => {
  it('qaParseVerb picks the longest matching verb phrase directly', () => {
    expect(qaParseVerb('get rid of toolbar')).toBe('hide');
    expect(qaParseVerb('bring back the sidebar')).toBe('show');
    expect(qaParseVerb('xyz')).toBeNull();
  });

  it('parses a hide verb plus a target command', () => {
    const { verb, targets } = qaParse('hide file explorer');
    expect(verb).toBe('hide');
    expect(targets.map((c) => c.id)).toContain('sidebar');
  });

  it('parses a bare toggle verb with a target', () => {
    const { verb, targets } = qaParse('toggle dark mode');
    expect(verb).toBe('toggle');
    expect(targets.map((c) => c.id)).toEqual(['dark-mode']);
  });

  it('returns no verb/targets for empty input', () => {
    expect(qaParse('')).toEqual({ verb: null, targets: [] });
    expect(qaParse('   ')).toEqual({ verb: null, targets: [] });
  });

  it('qaParseTargets scores by longest matching keyword phrase', () => {
    const targets = qaParseTargets('quick insert icon only row');
    expect(targets[0].id).toBe('nqa-icon-row');
  });
});

describe('qaSuggestForBareVerb', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'light' });
  });

  it('suggests currently-off commands for a bare "show"', () => {
    const { verb, suggestions } = qaSuggestForBareVerb('show');
    expect(verb).toBe('show');
    expect(suggestions.some((c) => c.id === 'dark-mode')).toBe(true);
  });

  it('suggests currently-on commands for a bare "hide"', () => {
    const { verb, suggestions } = qaSuggestForBareVerb('hide');
    expect(verb).toBe('hide');
    expect(suggestions.some((c) => c.id === 'light-mode')).toBe(true);
  });

  it('narrows suggestions by a partial word after the verb', () => {
    const { suggestions } = qaSuggestForBareVerb('show dark');
    expect(suggestions.map((c) => c.id)).toEqual(['dark-mode']);
  });

  it('returns no suggestions when no verb is present', () => {
    expect(qaSuggestForBareVerb('xyz')).toEqual({ verb: null, suggestions: [] });
  });
});

describe('qaVerbLabel / qaResolvedValue', () => {
  const cmd = findCommand('dark-mode');

  it('a toggle verb (or none) reflects current state, inverted', () => {
    useThemeStore.setState({ theme: 'light' });
    expect(qaVerbLabel(null, cmd)).toBe('Show');
    expect(qaResolvedValue(null, cmd)).toBe(true);
    useThemeStore.setState({ theme: 'dark' });
    expect(qaVerbLabel('toggle', cmd)).toBe('Hide');
    expect(qaResolvedValue('toggle', cmd)).toBe(false);
  });

  it('an explicit hide/show verb wins regardless of current state', () => {
    expect(qaVerbLabel('show', cmd)).toBe('Show');
    expect(qaResolvedValue('hide', cmd)).toBe(false);
  });
});

describe('qaExecuteCommand', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'light' });
  });

  it('applies the resolved value and returns an undo that restores it', () => {
    const cmd = findCommand('dark-mode');
    const result = qaExecuteCommand(cmd, null);
    expect(result.changed).toBe(true);
    expect(useThemeStore.getState().theme).toBe('dark');
    result.undo?.();
    expect(useThemeStore.getState().theme).toBe('light');
  });

  it('reports no-op when the resolved value already matches current state', () => {
    const cmd = findCommand('light-mode');
    const result = qaExecuteCommand(cmd, 'show');
    expect(result.changed).toBe(false);
    expect(result.message).toContain('already');
  });
});

describe('QA_COMMANDS wiring against real stores', () => {
  it('sidebar toggles useSidebarStore.open', () => {
    const cmd = findCommand('sidebar');
    useSidebarStore.setState({ open: false });
    cmd.set(true);
    expect(useSidebarStore.getState().open).toBe(true);
    expect(cmd.get()).toBe(true);
  });

  it('auto-rewrite toggles useAutoRewriteStore.enabled', () => {
    const cmd = findCommand('auto-rewrite');
    cmd.set(true);
    expect(useAutoRewriteStore.getState().enabled).toBe(true);
    cmd.set(false);
    expect(useAutoRewriteStore.getState().enabled).toBe(false);
  });

  it('tree-lines is the inverse of outlinePrefsStore.hideTreeLines', () => {
    const cmd = findCommand('tree-lines');
    useOutlinePrefsStore.setState({ hideTreeLines: true });
    expect(cmd.get()).toBe(false);
    cmd.set(true);
    expect(useOutlinePrefsStore.getState().hideTreeLines).toBe(false);
  });

  it('quickassist-feature wires to outlinePrefsStore.quickAssistEnabled', () => {
    const cmd = findCommand('quickassist-feature');
    cmd.set(false);
    expect(useOutlinePrefsStore.getState().quickAssistEnabled).toBe(false);
    cmd.set(true);
    expect(useOutlinePrefsStore.getState().quickAssistEnabled).toBe(true);
  });
});

describe('QA_ACTIONS wiring', () => {
  beforeEach(() => {
    seedNodes();
    vi.restoreAllMocks();
  });

  it('new-document calls documentsStore.newDocument and never offers undo', async () => {
    const spy = vi.spyOn(useDocumentsStore.getState(), 'newDocument').mockImplementation(() => {});
    const action = findAction('new-document');
    expect(action.supportsUndo).toBe(false);
    const result = await action.run();
    expect(result.ok).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it('duplicate-node reports failure when nothing is selected', async () => {
    useOutlineStore.setState({ selectedId: null, multiSelectedIds: [] });
    const result = await findAction('duplicate-node').run();
    expect(result.ok).toBe(false);
  });

  it('duplicate-node reports success and grows the undo stack when a node is selected', async () => {
    const result = await findAction('duplicate-node').run();
    expect(result.ok).toBe(true);
    expect(useOutlineStore.getState().undoStack.length).toBe(1);
  });

  it('ai-rewrite-node requires a selection', async () => {
    useOutlineStore.setState({ selectedId: null, multiSelectedIds: [] });
    const result = await findAction('ai-rewrite-node').run();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Select a node');
  });

  it('ai-rewrite-node delegates to rewriteNode for a single selection', async () => {
    const spy = vi.spyOn(aiRewrite, 'rewriteNode').mockResolvedValue({ ok: true, message: 'Rewrote 1 node.' });
    const result = await findAction('ai-rewrite-node').run();
    expect(spy).toHaveBeenCalledWith(2);
    expect(result.ok).toBe(true);
  });

  it('ai-expand-node requires exactly one selected node', async () => {
    useOutlineStore.setState({ selectedId: 1, multiSelectedIds: [1, 2] });
    const result = await findAction('ai-expand-node').run();
    expect(result.ok).toBe(false);
    expect(result.message).toContain('exactly one');
  });

  it('ai-expand-node delegates to expandNode', async () => {
    const spy = vi.spyOn(aiExpandTags, 'expandNode').mockResolvedValue({ ok: true, message: 'Expanded.' });
    await findAction('ai-expand-node').run();
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('ai-suggest-tags requires exactly one selected node and delegates to suggestTags', async () => {
    const spy = vi.spyOn(aiExpandTags, 'suggestTags').mockResolvedValue({ ok: true, message: 'Tagged.' });
    await findAction('ai-suggest-tags').run();
    expect(spy).toHaveBeenCalledWith(2);
  });

  it('ai-summarise-selection delegates to summariseSelectionIntoParent', async () => {
    const spy = vi.spyOn(aiSummarise, 'summariseSelectionIntoParent').mockResolvedValue({ ok: true, message: 'Summarised.' });
    await findAction('ai-summarise-selection').run();
    expect(spy).toHaveBeenCalled();
  });

  it('ai-rewrite-document delegates to rewriteDocument', async () => {
    const spy = vi.spyOn(aiRewrite, 'rewriteDocument').mockResolvedValue({ ok: true, message: 'Rewrote document.' });
    await findAction('ai-rewrite-document').run();
    expect(spy).toHaveBeenCalled();
  });

  it('ai-generate-outline reports cancelled when the prompt is dismissed', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const result = await findAction('ai-generate-outline').run();
    expect(result.ok).toBe(false);
    expect(result.message).toBe('Cancelled.');
  });

  it('ai-generate-outline delegates to generateOutline with the entered topic', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('onboarding checklist');
    const spy = vi.spyOn(aiOutline, 'generateOutline').mockResolvedValue({ ok: true, message: 'Generated.' });
    await findAction('ai-generate-outline').run();
    expect(spy).toHaveBeenCalledWith('onboarding checklist');
  });
});

describe('buildQaActionsWithRestructureDialog', () => {
  it('overrides only the ai-restructure-text action to open the injected dialog', async () => {
    const openDialog = vi.fn();
    const actions = buildQaActionsWithRestructureDialog(openDialog);
    const restructure = actions.find((a) => a.id === 'ai-restructure-text')!;
    const result = await restructure.run();
    expect(openDialog).toHaveBeenCalled();
    expect(result.handledElsewhere).toBe(true);
    // every other action is untouched
    expect(actions.filter((a) => a.id !== 'ai-restructure-text')).toEqual(QA_ACTIONS.filter((a) => a.id !== 'ai-restructure-text'));
  });
});

describe('qaParseActionsList / qaSuggestActionsForBareVerb', () => {
  it('matches an action by its keyword phrase', () => {
    const results = qaParseActionsList('duplicate node');
    expect(results[0]?.id).toBe('duplicate-node');
  });

  it('returns nothing for empty input', () => {
    expect(qaParseActionsList('')).toEqual([]);
  });

  it('a bare "run" surfaces every action, narrowed by any partial word after it', () => {
    const all = qaSuggestActionsForBareVerb('run');
    expect(all.matched).toBe(true);
    expect(all.actions.length).toBeGreaterThan(1);
    const narrowed = qaSuggestActionsForBareVerb('run duplicate');
    expect(narrowed.actions.map((a) => a.id)).toEqual(['duplicate-node']);
  });

  it('accepts an injected action list (used by the restructure-dialog build)', () => {
    const fakeAction: QaAction = { id: 'fake', label: 'Fake', keywords: ['fake'], requiresSelection: false, supportsUndo: false, run: async () => ({ ok: true, message: '' }) };
    expect(qaParseActionsList('fake', [fakeAction])).toEqual([fakeAction]);
  });
});

describe('buildQaEntries / navigableQaEntries', () => {
  beforeEach(() => {
    seedNodes();
    useThemeStore.setState({ theme: 'light' });
  });

  it('returns nothing for an empty query', () => {
    expect(buildQaEntries('', true)).toEqual([]);
  });

  it('renders a disabled action row when it requires a selection that is not there', () => {
    const entries = buildQaEntries('duplicate node', false);
    const row = entries.find((e) => e.kind === 'action' && e.action.id === 'duplicate-node');
    expect(row).toMatchObject({ kind: 'action', disabled: true });
  });

  it('navigableQaEntries excludes disabled action rows but keeps enabled ones', () => {
    const entries = buildQaEntries('duplicate node', false);
    expect(navigableQaEntries(entries)).toEqual([]);
    const enabledEntries = buildQaEntries('duplicate node', true);
    expect(navigableQaEntries(enabledEntries).length).toBe(1);
  });

  it('caps commands at 6 and actions at 4, matching legacy\'s own real limits', () => {
    const entries = buildQaEntries('show', true);
    const commandCount = entries.filter((e) => e.kind === 'command').length;
    expect(commandCount).toBeLessThanOrEqual(6);
  });

  describe('category-prefix scoping (§6.10 slice 4b)', () => {
    beforeEach(() => {
      useDocumentsStore.setState({ docsIndex: [{ id: 'a', title: 'Doc A', createdAt: 1, modifiedAt: 1 }], activeDocId: 'a', openTabs: ['a'], folders: [], docFolderMap: {} });
      useOutlineStore.setState({ nodes: [{ id: 1, depth: 0, text: 'toggle dark mode notes', parentId: null, isCheckbox: false, checked: false, note: '<p>toggle dark mode notes</p>', codeBlock: null, tags: [], styles: defaultNodeStyles() }] });
    });

    it('a recognized prefix skips command/action matching entirely, even for a phrase that would otherwise match', () => {
      const entries = buildQaEntries('notes: toggle dark mode', true);
      expect(entries.some((e) => e.kind === 'command' || e.kind === 'action')).toBe(false);
    });

    it('a recognized prefix scopes search hits to just that one category', () => {
      const entries = buildQaEntries('notes: toggle dark mode', true) as Extract<QaEntry, { kind: 'search' }>[];
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.group === 'Notes')).toBe(true);
    });

    it('an unrecognized prefix falls back to normal command/search parsing', () => {
      const entries = buildQaEntries('zzz: dark mode', true);
      expect(entries.some((e) => e.kind === 'command')).toBe(true);
    });
  });
});

describe('buildQaPickerEntries / qaPickerInsertText', () => {
  it('returns the 4 verb chips followed by all 6 category chips, in order', () => {
    const entries = buildQaPickerEntries();
    const verbs = entries.filter((e) => e.kind === 'verb');
    const categories = entries.filter((e) => e.kind === 'category');
    expect(verbs.map((e) => (e as Extract<QaEntry, { kind: 'verb' }>).verb)).toEqual(QA_PICKER_VERBS);
    expect(categories).toHaveLength(6);
    expect(entries.indexOf(verbs[0])).toBeLessThan(entries.indexOf(categories[0]));
  });

  it('qaPickerInsertText inserts "<verb> " for a verb chip', () => {
    expect(qaPickerInsertText({ kind: 'verb', verb: 'toggle' })).toBe('toggle ');
    expect(qaPickerInsertText({ kind: 'verb', verb: 'run' })).toBe('run ');
  });

  it('qaPickerInsertText inserts "<prefix>: " for a category chip, using each category\'s real primary prefix', () => {
    expect(qaPickerInsertText({ kind: 'category', categoryKey: 'notes', group: 'Notes' })).toBe('note: ');
    expect(qaPickerInsertText({ kind: 'category', categoryKey: 'in-documents', group: 'In documents' })).toBe('text: ');
  });
});
