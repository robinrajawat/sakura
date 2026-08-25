import { useSidebarStore } from '../store/sidebarStore';
import { useThemeStore } from '../store/themeStore';
import { useAutoRewriteStore } from '../store/autoRewriteStore';
import { useOutlinePrefsStore } from '../store/outlinePrefsStore';
import { useOutlineStore } from '../store/outlineStore';
import { useDocumentsStore } from '../store/documentsStore';
import { rewriteDocument, rewriteNode, rewriteNodes } from './aiRewrite';
import { expandNode, suggestTags } from './aiExpandTags';
import { generateOutline, restructureText } from './aiOutline';
import { summariseSelectionIntoParent } from './aiSummarise';

/**
 * §6.10 slice 3 (docs/phase6-full-parity-plan.md): Quick Assist's command surface. Direct port of
 * legacy's real `QA_COMMANDS`/`QA_ACTIONS` (legacy/index.html:17014-17128) and their surrounding
 * parse/match functions (`qaPhraseMatch`/`qaBestPhrase`/`qaParse`/`qaSuggestForBareVerb`/
 * `qaParseActionsList`/`qaSuggestActionsForBareVerb`, legacy/index.html:17078-17200) -- but only
 * the subset legacy's own real ids have a genuine, working equivalent for in `web/` today, per an
 * explicit audit against every current store/state module (not a guess). Legacy's own header
 * comment on QA_COMMANDS makes the scoping principle explicit: "every one of these already has a
 * real settings-panel control backing it -- Quick Assist is just a faster front door onto code
 * that already exists." The corollary this slice applies: never invent a front door onto a
 * capability `web/` doesn't really have yet.
 *
 * Of legacy's 39 QA_COMMANDS ids, 11 have a real boolean get/set pair in `web/` today: sidebar
 * (`sidebarStore`), dark-mode/light-mode (`themeStore`), auto-rewrite (`autoRewriteStore`),
 * tree-lines/compact-rows/always-expand-inline/outline-numbering/nqa-icon-row/nodeqa-feature
 * (`outlinePrefsStore`, the last two already real from §6.10 slice 1's Quick Insert work), plus
 * quickassist-feature itself (`outlinePrefsStore.quickAssistEnabled`, new this slice -- legacy's
 * own QA_COMMANDS list includes its own master toggle too, so this isn't an addition beyond
 * legacy's real scope, just this slice's own equivalent existing for the first time). Every other
 * id (toolbar visibility, zen mode, spellcheck, hover-toolbar, the 14 feature-activation flags,
 * preview theme/font, presenter auto-laser, cloud Gist auto-sync, accent branches/cursor, and
 * more) has no real `web/` state to attach to and is simply not included -- see this repo's
 * phase6-full-parity-plan.md §6.10 section for the full per-id audit.
 *
 * Of legacy's 11 QA_ACTIONS ids, 9 have a real callable `web/` function: new-document
 * (`documentsStore.newDocument`), duplicate-node (`outlineStore.duplicateSelected`), and all 7 AI
 * actions (`aiRewrite`/`aiExpandTags`/`aiOutline`/`aiSummarise`). The remaining 2 (editors-choice
 * preset, documentation-mode preset) are marked N/A in `outlinePrefsStore.ts`'s own header --
 * `web/` has no settings for most of what those ~40-setting snapshots would need to restore.
 *
 * Deliberately NOT part of this slice: category-prefix search scoping ("notes: budget"), the
 * chip-mode category picker, fuzzy matching, and Quick Assist's Global Search integration across
 * Documents/Notes/Tags/Settings/Help -- all of that is legacy's real search-hit half of Quick
 * Assist (`collectSearchGroups` and friends), scoped separately as §6.10 slice 4 in the plan doc.
 * This slice is the command-only half: open/close, type a phrase, match a command or action,
 * execute it with Undo.
 */

export interface QaCommand {
  id: string;
  label: string;
  keywords: string[];
  get: () => boolean;
  set: (v: boolean) => void;
}

export interface QaActionRunResult {
  ok: boolean;
  message: string;
  /** True when the action opened its own UI (a dialog) instead of completing immediately --
   * matches the Restructure Text action, which needs a real textarea `window.prompt` can't
   * provide (see `RestructureTextDialog.tsx`'s own header). No toast shows for these. */
  handledElsewhere?: boolean;
}

export interface QaAction {
  id: string;
  label: string;
  keywords: string[];
  requiresSelection: boolean;
  /** Whether "Undo" is a real, correct affordance for this action's effect. False only for
   * new-document -- creating a document doesn't push onto `outlineStore`'s undo stack (a
   * different document, a different stack), so offering an Undo button that doesn't actually
   * undo document creation would be worse than not offering one. Everything else here mutates
   * the current document's own node tree, which the generic outline `undo()` genuinely reverses. */
  supportsUndo: boolean;
  run: () => Promise<QaActionRunResult>;
}

/** Direct copy of legacy's real `QA_HIDE_PHRASES`/`QA_SHOW_PHRASES`/`QA_TOGGLE_PHRASES`
 * (legacy/index.html:16981-16983). */
export const QA_HIDE_PHRASES = [
  'get rid of', "don't want", 'do not want', "don't need", 'do not need', "don't show", 'do not show', 'no more', 'turn off', 'switch off', 'hide',
  'remove', 'close', 'disable', 'deactivate', 'turn it off'
];
export const QA_SHOW_PHRASES = ['bring back', 'turn on', 'switch on', 'show', 'display', 'enable', 'activate', 'get me', 'get', 'add', 'open'];
export const QA_TOGGLE_PHRASES = ['toggle', 'flip'];
/** Direct copy of legacy's real `QA_RUN_PHRASES` (legacy/index.html:16984). */
export const QA_RUN_PHRASES = ['run'];

export const QA_COMMANDS: QaCommand[] = [
  {
    id: 'sidebar',
    label: 'File Explorer',
    keywords: ['sidebar', 'side bar', 'file explorer', 'files panel'],
    get: () => useSidebarStore.getState().open,
    set: (v) => {
      if (useSidebarStore.getState().open !== v) useSidebarStore.getState().toggleOpen();
    }
  },
  {
    id: 'dark-mode',
    label: 'Dark mode',
    keywords: ['dark mode', 'dark theme'],
    get: () => useThemeStore.getState().theme === 'dark',
    set: (v) => useThemeStore.getState().setTheme(v ? 'dark' : 'light')
  },
  {
    id: 'light-mode',
    label: 'Light mode',
    keywords: ['light mode', 'light theme'],
    get: () => useThemeStore.getState().theme === 'light',
    set: (v) => useThemeStore.getState().setTheme(v ? 'light' : 'dark')
  },
  {
    id: 'auto-rewrite',
    label: 'Auto-rewrite on commit',
    keywords: ['auto rewrite', 'auto-rewrite', 'automatic rewrite'],
    get: () => useAutoRewriteStore.getState().enabled,
    set: (v) => useAutoRewriteStore.getState().setEnabled(v)
  },
  {
    id: 'tree-lines',
    label: 'Tree lines',
    keywords: ['tree lines', 'branch lines', 'connectors'],
    get: () => !useOutlinePrefsStore.getState().hideTreeLines,
    set: (v) => useOutlinePrefsStore.getState().setHideTreeLines(!v)
  },
  {
    id: 'compact-rows',
    label: 'Compact rows',
    keywords: ['compact rows', 'compact mode'],
    get: () => useOutlinePrefsStore.getState().compactRows,
    set: (v) => useOutlinePrefsStore.getState().setCompactRows(v)
  },
  {
    id: 'always-expand-inline',
    label: 'Always expand inline',
    keywords: [
      'note preview',
      'remark preview',
      'qa preview',
      'inline note',
      'inline remark',
      'inline qa',
      'expand inline',
      'quote',
      'citation',
      'comment',
      'question answer'
    ],
    get: () => useOutlinePrefsStore.getState().alwaysExpandInlineEnabled,
    set: (v) => useOutlinePrefsStore.getState().setAlwaysExpandInlineEnabled(v)
  },
  {
    id: 'outline-numbering',
    label: 'Outline numbering',
    keywords: ['outline numbering', 'numbering'],
    get: () => useOutlinePrefsStore.getState().outlineNumbering,
    set: (v) => useOutlinePrefsStore.getState().setOutlineNumbering(v)
  },
  {
    id: 'nqa-icon-row',
    label: 'Quick Insert icon-only row',
    keywords: ['quick insert icon', 'node quick assist icon', 'icon row', 'icon only row', 'mini quick assist icons'],
    get: () => useOutlinePrefsStore.getState().quickInsertIconOnly,
    set: (v) => useOutlinePrefsStore.getState().setQuickInsertIconOnly(v)
  },
  {
    id: 'nodeqa-feature',
    label: 'Quick Insert',
    keywords: ['quick insert', 'node quick assist', 'node assist'],
    get: () => useOutlinePrefsStore.getState().quickInsertEnabled,
    set: (v) => useOutlinePrefsStore.getState().setQuickInsertEnabled(v)
  },
  {
    id: 'quickassist-feature',
    label: 'Quick Assist',
    keywords: ['quick assist', 'command box', 'command palette'],
    get: () => useOutlinePrefsStore.getState().quickAssistEnabled,
    set: (v) => useOutlinePrefsStore.getState().setQuickAssistEnabled(v)
  }
];

export const QA_ACTIONS: QaAction[] = [
  {
    id: 'new-document',
    label: 'New document',
    keywords: ['new document', 'new doc', 'create document'],
    requiresSelection: false,
    supportsUndo: false,
    run: async () => {
      useDocumentsStore.getState().newDocument();
      return { ok: true, message: 'Created a new document.' };
    }
  },
  {
    id: 'duplicate-node',
    label: 'Duplicate node',
    keywords: ['duplicate node', 'duplicate'],
    requiresSelection: true,
    supportsUndo: true,
    run: async () => {
      const before = useOutlineStore.getState().undoStack.length;
      useOutlineStore.getState().duplicateSelected();
      const ok = useOutlineStore.getState().undoStack.length > before;
      return { ok, message: ok ? 'Duplicated node.' : 'Nothing to duplicate.' };
    }
  },
  {
    id: 'ai-rewrite-document',
    label: 'Rewrite document (AI)',
    keywords: ['rewrite document', 'rewrite whole document', 'rewrite entire document', 'ai rewrite document'],
    requiresSelection: false,
    supportsUndo: true,
    run: () => rewriteDocument()
  },
  {
    id: 'ai-rewrite-node',
    label: 'Rewrite this node (AI)',
    keywords: ['rewrite node', 'rewrite this node', 'ai rewrite node', 'rewrite selected'],
    requiresSelection: true,
    supportsUndo: true,
    run: async () => {
      const ids = useOutlineStore.getState().selectedIds();
      if (!ids.length) return { ok: false, message: 'Select a node first.' };
      return ids.length === 1 ? rewriteNode(ids[0]) : rewriteNodes(ids);
    }
  },
  {
    id: 'ai-expand-node',
    label: 'Expand into subtree (AI)',
    keywords: ['expand node', 'expand into subtree', 'ai expand'],
    requiresSelection: true,
    supportsUndo: true,
    run: async () => {
      const ids = useOutlineStore.getState().selectedIds();
      if (ids.length !== 1) return { ok: false, message: 'Select exactly one node to expand.' };
      return expandNode(ids[0]);
    }
  },
  {
    id: 'ai-summarise-selection',
    label: 'Summarise selection into parent (AI)',
    keywords: ['summarise selection', 'summarize selection', 'ai summarise', 'ai summarize'],
    requiresSelection: true,
    supportsUndo: true,
    run: () => summariseSelectionIntoParent()
  },
  {
    id: 'ai-suggest-tags',
    label: 'Suggest tags (AI)',
    keywords: ['suggest tags', 'ai suggest tags', 'tag suggestions'],
    requiresSelection: true,
    supportsUndo: true,
    run: async () => {
      const ids = useOutlineStore.getState().selectedIds();
      if (ids.length !== 1) return { ok: false, message: 'Select exactly one node to tag.' };
      return suggestTags(ids[0]);
    }
  },
  {
    id: 'ai-generate-outline',
    label: 'Generate outline (AI)',
    keywords: ['generate outline', 'ai outline', 'create outline'],
    requiresSelection: false,
    supportsUndo: true,
    run: async () => {
      const topic = window.prompt(
        'Generate Outline with AI\n\nDescribe what you want an outline for (e.g. "competitor analysis" or "onboarding checklist for a new hire").'
      );
      if (topic === null) return { ok: false, message: 'Cancelled.' };
      return generateOutline(topic);
    }
  },
  {
    id: 'ai-restructure-text',
    label: 'Restructure text (AI)',
    keywords: ['restructure text', 'ai restructure', 'restructure notes'],
    requiresSelection: false,
    supportsUndo: true,
    // Overridden by buildQaActionsWithRestructureDialog below -- this base entry exists so
    // QA_ACTIONS stays a complete, testable list even before a caller injects the real dialog
    // opener, but qaParseActionsList/qaSuggestActionsForBareVerb callers should always use the
    // built version in a React context.
    run: async () => restructureText('')
  }
];

/** Legacy's real `ai-restructure-text` action opens a dialog for the pasted text rather than
 * acting immediately (see `RestructureTextDialog.tsx`'s own header for why `window.prompt` isn't
 * adequate there) -- that dialog is React state owned by `App.tsx`, unreachable from this plain
 * module, so the real action is built here via injection rather than baked into QA_ACTIONS
 * directly. Matches `aiFallback.ts`'s own established dependency-injection pattern for the same
 * reason (a plain module can't reach into a specific component's state). */
export function buildQaActionsWithRestructureDialog(openRestructureDialog: () => void): QaAction[] {
  return QA_ACTIONS.map((action) =>
    action.id === 'ai-restructure-text'
      ? {
          ...action,
          run: async () => {
            openRestructureDialog();
            return { ok: true, message: '', handledElsewhere: true };
          }
        }
      : action
  );
}

/** Direct port of legacy's real `qaPhraseMatch` (legacy/index.html:17078-17080). */
export function qaPhraseMatch(text: string, phrase: string): boolean {
  return (' ' + text + ' ').includes(' ' + phrase + ' ');
}

/** Direct port of legacy's real `qaBestPhrase` (legacy/index.html:17081-17085). */
export function qaBestPhrase(text: string, phrases: string[]): string | null {
  let best: string | null = null;
  phrases.forEach((p) => {
    if (qaPhraseMatch(text, p) && (!best || p.length > best.length)) best = p;
  });
  return best;
}

export type QaVerb = 'hide' | 'show' | 'toggle';

/** Direct port of legacy's real `qaParseVerb` (legacy/index.html:17155-17163). */
export function qaParseVerb(text: string): QaVerb | null {
  const hide = qaBestPhrase(text, QA_HIDE_PHRASES);
  const show = qaBestPhrase(text, QA_SHOW_PHRASES);
  const toggle = qaBestPhrase(text, QA_TOGGLE_PHRASES);
  const candidates: { verb: QaVerb; phrase: string | null }[] = [
    { verb: 'hide' as const, phrase: hide },
    { verb: 'show' as const, phrase: show },
    { verb: 'toggle' as const, phrase: toggle }
  ].filter((c) => c.phrase);
  if (!candidates.length) return null;
  candidates.sort((a, b) => (b.phrase as string).length - (a.phrase as string).length);
  return candidates[0].verb;
}

/** Direct port of legacy's real `qaParseTargets` (legacy/index.html:17167-17175), scored against
 * `QA_COMMANDS` (this file's audited subset) instead of legacy's full 39. */
export function qaParseTargets(text: string): QaCommand[] {
  const scored = QA_COMMANDS.map((cmd) => {
    const best = qaBestPhrase(text, cmd.keywords);
    return best ? { cmd, score: best.length } : null;
  }).filter((x): x is { cmd: QaCommand; score: number } => x !== null);
  if (!scored.length) return [];
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.cmd);
}

/** Direct port of legacy's real `qaParse` (legacy/index.html:17176-17180). */
export function qaParse(text: string): { verb: QaVerb | null; targets: QaCommand[] } {
  const q = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return { verb: null, targets: [] };
  return { verb: qaParseVerb(q), targets: qaParseTargets(q) };
}

/** Direct port of legacy's real `qaSuggestForBareVerb` (legacy/index.html:17187-17200). */
export function qaSuggestForBareVerb(q: string): { verb: QaVerb | null; suggestions: QaCommand[] } {
  const hide = qaBestPhrase(q, QA_HIDE_PHRASES);
  const show = qaBestPhrase(q, QA_SHOW_PHRASES);
  const toggle = qaBestPhrase(q, QA_TOGGLE_PHRASES);
  const candidates: { verb: QaVerb; phrase: string | null }[] = [
    { verb: 'hide' as const, phrase: hide },
    { verb: 'show' as const, phrase: show },
    { verb: 'toggle' as const, phrase: toggle }
  ].filter((c) => c.phrase);
  if (!candidates.length) return { verb: null, suggestions: [] };
  candidates.sort((a, b) => (b.phrase as string).length - (a.phrase as string).length);
  const { verb, phrase } = candidates[0];
  const remainder = (' ' + q + ' ').replace(' ' + (phrase as string) + ' ', ' ').trim();
  const pool = QA_COMMANDS.filter((cmd) => (verb === 'hide' ? cmd.get() : verb === 'show' ? !cmd.get() : true));
  const filtered = remainder ? pool.filter((cmd) => cmd.label.toLowerCase().includes(remainder) || cmd.keywords.some((k) => k.includes(remainder))) : pool;
  filtered.sort((a, b) => a.label.localeCompare(b.label));
  return { verb, suggestions: filtered.slice(0, 8) };
}

/** Direct port of legacy's real `qaParseActionsList` (legacy/index.html:17130-17139) -- legacy
 * also filters out AI action ids when its `FEATURE_FLAGS.ai` toggle is off; `web/` has no feature-
 * flags system, so every action here is always eligible. */
export function qaParseActionsList(q: string, actions: QaAction[] = QA_ACTIONS): QaAction[] {
  if (!q) return [];
  const scored = actions
    .map((action) => {
      const best = qaBestPhrase(q, action.keywords);
      return best ? { action, score: best.length } : null;
    })
    .filter((x): x is { action: QaAction; score: number } => x !== null);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.action);
}

/** Direct port of legacy's real `qaSuggestActionsForBareVerb` (legacy/index.html:16993-16999). */
export function qaSuggestActionsForBareVerb(q: string, actions: QaAction[] = QA_ACTIONS): { matched: boolean; actions: QaAction[] } {
  const phrase = qaBestPhrase(q, QA_RUN_PHRASES);
  if (!phrase) return { matched: false, actions: [] };
  const remainder = (' ' + q + ' ').replace(' ' + phrase + ' ', ' ').trim();
  const filtered = remainder ? actions.filter((a) => a.label.toLowerCase().includes(remainder) || a.keywords.some((k) => k.includes(remainder))) : actions;
  return { matched: true, actions: filtered.slice(0, 8) };
}

/** Direct port of legacy's real `qaVerbLabel` (legacy/index.html:17201-17204). */
export function qaVerbLabel(verb: QaVerb | null, cmd: QaCommand): 'Hide' | 'Show' {
  if (verb === 'toggle' || !verb) return cmd.get() ? 'Hide' : 'Show';
  return verb === 'hide' ? 'Hide' : 'Show';
}

/** Direct port of legacy's real `qaResolvedValue` (legacy/index.html:17205-17208). */
export function qaResolvedValue(verb: QaVerb | null, cmd: QaCommand): boolean {
  if (verb === 'toggle' || !verb) return !cmd.get();
  return verb === 'show';
}

export interface QaCommandExecuteResult {
  changed: boolean;
  message: string;
  undo?: () => void;
}

/** Direct port of legacy's real `qaExecute` (legacy/index.html:17209-17215), returning the
 * outcome instead of calling `showActionToast` directly so the caller (a React component) decides
 * how to present it. */
export function qaExecuteCommand(cmd: QaCommand, verb: QaVerb | null): QaCommandExecuteResult {
  const cur = cmd.get();
  const next = qaResolvedValue(verb, cmd);
  if (next === cur) return { changed: false, message: `${cmd.label} is already ${next ? 'shown' : 'hidden'}` };
  cmd.set(next);
  return { changed: true, message: `${next ? 'Shown' : 'Hidden'}: ${cmd.label}`, undo: () => cmd.set(cur) };
}

export type QaEntry = { kind: 'command'; cmd: QaCommand; verb: QaVerb | null } | { kind: 'action'; action: QaAction; disabled: boolean };

/** Direct port of the command/action-matching portion of legacy's real `qaRender`
 * (legacy/index.html:17342-17461) -- the search-hit portion (`collectSearchGroups` and the
 * category/chip/fuzzy machinery around it) is out of scope for this slice, see this file's own
 * header. Returns every matched row in legacy's own real order (commands first, capped at 6, then
 * actions, capped at 4) with `disabled` set on action rows needing a selection that isn't there --
 * matching legacy's own real behavior of still showing those rows (inert, with a reason) rather
 * than hiding them outright. */
export function buildQaEntries(query: string, hasSelection: boolean, actions: QaAction[] = QA_ACTIONS): QaEntry[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  const { verb, targets } = qaParse(q);
  let commands = targets.slice(0, 6);
  let effVerb = verb;
  if (!commands.length) {
    const bare = qaSuggestForBareVerb(q);
    if (bare.verb && bare.suggestions.length) {
      commands = bare.suggestions;
      effVerb = bare.verb;
    }
  }
  const entries: QaEntry[] = commands.map((cmd) => ({ kind: 'command', cmd, verb: effVerb }));
  let actionRows = qaParseActionsList(q, actions).slice(0, 4);
  if (!actionRows.length) {
    const bareRun = qaSuggestActionsForBareVerb(q, actions);
    if (bareRun.matched && bareRun.actions.length) actionRows = bareRun.actions;
  }
  actionRows.forEach((action) => {
    entries.push({ kind: 'action', action, disabled: action.requiresSelection && !hasSelection });
  });
  return entries;
}

/** The subset of `buildQaEntries`' output that keyboard navigation (ArrowUp/Down, Enter) actually
 * indexes into -- matches legacy's own real `qaEntries` construction, which never pushes a
 * disabled action row onto the navigable list in the first place (legacy/index.html:17371's own
 * `if(!row.disabled)qaEntries.push(...)`) even though the disabled row still renders. */
export function navigableQaEntries(entries: QaEntry[]): QaEntry[] {
  return entries.filter((e) => !(e.kind === 'action' && e.disabled));
}
