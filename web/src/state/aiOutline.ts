/**
 * Generate Outline + Restructure Text — §6.9 slice 5 (docs/phase6-full-parity-plan.md). Direct
 * port of legacy's real `generateOutlineWithAi`/`restructureTextWithAi`
 * (legacy/index.html:29442-29517), sharing `utils/parseTextToTree.ts`'s
 * `parseTextToTreeNodesCore`/`looksAlreadyStructuredCore` and `aiCapabilities.ts`'s
 * `callAiApiOutline`/`callAiApiRestructure`.
 *
 * Plain orchestration functions reading/writing `outlineStore`/`documentsStore`/
 * `aiSettingsStore` via `.getState()`, matching `aiRewrite.ts`'s own established convention.
 *
 * **Generate Outline** invents structure from a short topic and nests the result as children of
 * whatever's currently selected in the CURRENT document (or replaces an empty document) — see
 * `outlineStore.ts`'s own `insertGeneratedOutline` action, which owns the real undo checkpoint
 * this needs (a genuine addition to content the user was already looking at).
 *
 * **Restructure Text** reorganizes text the user already has, and — matching legacy's real,
 * deliberate behavior — ALWAYS lands in a brand-new document, never merging into whatever's
 * currently open. `looksAlreadyStructuredCore` is checked first: text that already reads as a
 * real hierarchy (tree-connector glyphs, or at least two distinct indentation widths) skips the
 * AI call entirely and goes straight through the free heuristic parser. New-document population
 * uses the same `useDocumentsStore.getState().newDocument()` + direct `useOutlineStore.setState`
 * pattern `ExportButtons.tsx`'s own OPML/Sakura-Document imports already establish — including
 * that same precedent's real divergence from legacy: no undo checkpoint for a brand-new
 * document's initial population (undoing "into" a document you just created isn't a
 * particularly useful operation, and every existing `web/` import already omits it).
 *
 * **Deliberately NOT built in this slice**, a real, documented, separately-scoped gap: legacy's
 * real `insertAiOutlineAsNewDoc` also stashes the original pasted text into that new document's
 * Pad ("Original pasted text") as a source-of-truth reference — skipped here because `web/`'s
 * `padStore.ts` is a single flat, app-wide, unpersisted store with no per-document scoping at
 * all yet (the same real architectural gap `docs/handoff-prompt.md`'s Sakura-Document-export
 * history already documents; there is nothing document-scoped for this feature to stash into
 * either).
 */

import { useOutlineStore } from '../store/outlineStore';
import { useDocumentsStore } from '../store/documentsStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import { defaultNodeStyles, type OutlineNode } from '../store/outlineStore';
import { rebuildParentIdsCore } from '../core/nodeSelection';
import { callAiApiOutline, callAiApiRestructure, type AiCallContext } from './aiCapabilities';
import { parseTextToTreeNodesCore, looksAlreadyStructuredCore, type ParsedTreeRow } from '../utils/parseTextToTree';

export interface AiActionResult {
  ok: boolean;
  message: string;
}

const NO_KEY_MESSAGE = 'No AI provider key configured — set one up in Settings → AI.';

function resolveCallContext(): AiCallContext | null {
  const ai = useAiSettingsStore.getState();
  const apiKey = ai.getKeyForProvider(ai.provider);
  if (!apiKey) return null;
  return { providerId: ai.provider, model: ai.model, apiKey };
}

/** Matches legacy's real `generateOutlineWithAi` orchestration. */
export async function generateOutline(topic: string): Promise<AiActionResult> {
  const trimmed = topic.trim();
  if (!trimmed) return { ok: false, message: 'Enter a topic first.' };

  const ctx = resolveCallContext();
  if (!ctx) return { ok: false, message: NO_KEY_MESSAGE };

  try {
    const raw = await callAiApiOutline(trimmed, ctx);
    if (!raw) return { ok: false, message: 'Empty response from AI.' };
    const parsed = parseTextToTreeNodesCore(raw);
    if (!parsed.length) return { ok: false, message: 'AI did not return a usable outline.' };
    const ids = useOutlineStore.getState().insertGeneratedOutline(parsed);
    return { ok: true, message: `Outline inserted — ${ids.length} node${ids.length === 1 ? '' : 's'}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function insertParsedIntoNewDocument(parsed: ParsedTreeRow[]): number {
  useDocumentsStore.getState().newDocument();
  let id = useOutlineStore.getState().nextId;
  const mapped: OutlineNode[] = parsed.map((n) => ({
    id: id++,
    depth: n.depth,
    text: n.text,
    parentId: null,
    isCheckbox: false,
    checked: false,
    note: '',
    codeBlock: null,
    tags: [],
    styles: defaultNodeStyles()
  }));
  rebuildParentIdsCore(mapped);
  useOutlineStore.setState({
    nodes: mapped,
    selectedId: mapped[0]?.id ?? null,
    editingId: null,
    multiSelectedIds: [],
    selectionAnchorId: mapped[0]?.id ?? null,
    nextId: id
  });
  return mapped.length;
}

/** Matches legacy's real `restructureTextWithAi` orchestration, including the free
 * already-structured bypass. */
export async function restructureText(pastedText: string): Promise<AiActionResult> {
  const trimmed = pastedText.trim();
  if (!trimmed) return { ok: false, message: 'Paste some text first.' };

  let parsed: ParsedTreeRow[];
  if (looksAlreadyStructuredCore(trimmed)) {
    parsed = parseTextToTreeNodesCore(trimmed);
    if (!parsed.length) return { ok: false, message: 'Could not find any usable lines in that text.' };
    const count = insertParsedIntoNewDocument(parsed);
    return { ok: true, message: `Already structured — parsed without AI ✦ (${count} node${count === 1 ? '' : 's'}).` };
  }

  const ctx = resolveCallContext();
  if (!ctx) return { ok: false, message: NO_KEY_MESSAGE };

  try {
    const raw = await callAiApiRestructure(trimmed, ctx);
    if (!raw) return { ok: false, message: 'Empty response from AI.' };
    parsed = parseTextToTreeNodesCore(raw);
    if (!parsed.length) return { ok: false, message: 'AI did not return a usable structure.' };
    const count = insertParsedIntoNewDocument(parsed);
    return { ok: true, message: `Restructured into a new document — ${count} node${count === 1 ? '' : 's'}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
