/**
 * Summarise selection — §6.9 slice 8 (docs/phase6-full-parity-plan.md). Direct port of legacy's
 * real `summariseSelectionWithAi` (legacy/index.html:28410-28451): selects the current
 * selection's TOP-LEVEL roots (`selectionRootIndexes()` — matches legacy's own real
 * `getSelectionRootIndexes()`, already ported and used elsewhere in `outlineStore.ts`, not
 * every individually-selected node), asks the AI for one short label covering all of them, and
 * inserts a new parent node carrying that label immediately above the selection with every
 * selected root's whole subtree indented underneath it.
 *
 * Plain orchestration function using `.getState()`, matching this project's own established
 * convention for cross-store AI capability logic (`aiRewrite.ts`/`aiOutline.ts`/
 * `aiExpandTags.ts`/`aiIcon.ts`).
 *
 * Out of scope, a real, separately-scoped sibling feature in legacy: "Summarise subtree into
 * note" (legacy's own `ntb-ai-summarise`, legacy/index.html:34316-34380) — a completely different
 * capability that reads a node's subtree and appends PROSE to that node's Note field, unrelated
 * to this outline-level "summarise a selection into a new parent node" capability beyond sharing
 * a name. `web/`'s note panel has no AI actions at all yet (same gap `aiRewrite.ts`'s own header
 * already documents for note-level Rewrite).
 *
 * **Deliberately NOT built in this slice**: provider fallback (`aiCapabilities.ts`'s own header)
 * and usage tracking — both later slices.
 */

import { useOutlineStore } from '../store/outlineStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import { callAiApiWithPrompt, type AiCallContext } from './aiCapabilities';

export interface AiActionResult {
  ok: boolean;
  message: string;
}

const NO_KEY_MESSAGE = 'No AI provider key configured — set one up in Settings → AI.';

function resolveCallContext(): AiCallContext | null {
  const ai = useAiSettingsStore.getState();
  const apiKey = ai.getKeyForProvider(ai.provider);
  if (!apiKey) return null;
  return { providerId: ai.provider, model: ai.model, apiKey, fallbackChain: ai.getEffectiveFallbackChain() };
}

/** Matches legacy's real `AI_SUMMARISE_SYSTEM_PROMPT` (index.html:29349) verbatim. */
export const AI_SUMMARISE_SYSTEM_PROMPT =
  'You write a concise one-line label that summarises a group of outline nodes. Given a list of node texts, respond with ONLY the summary label — a short noun phrase, no more than 8 words, no punctuation at the end, no quotes. Example: Distribution Model Components';

/** Pure: matches legacy's real leading/trailing-quote strip on the AI's raw response
 * (index.html:28423) exactly. */
export function stripSummaryLabelCore(raw: string): string {
  return raw.replace(/^["']|["']$/g, '').trim();
}

/** Matches legacy's real `summariseSelectionWithAi` orchestration exactly, including requiring
 * at least 2 selected roots and aborting entirely (not partially applying) if any selected root
 * was deleted while the request was in flight. */
export async function summariseSelectionIntoParent(): Promise<AiActionResult> {
  const outline = useOutlineStore.getState();
  const roots = outline.selectionRootIndexes();
  if (roots.length < 2) return { ok: false, message: 'Select 2 or more nodes to summarise.' };

  const nodes = outline.nodes;
  const rootIds = roots.map((i) => nodes[i].id);
  const texts = roots.map((i) => nodes[i].text || '').filter(Boolean);
  if (!texts.length) return { ok: false, message: 'Nothing to summarise.' };

  const ctx = resolveCallContext();
  if (!ctx) return { ok: false, message: NO_KEY_MESSAGE };

  try {
    const userMsg = 'Nodes:\n' + texts.map((t) => '- ' + t).join('\n');
    const raw = await callAiApiWithPrompt(AI_SUMMARISE_SYSTEM_PROMPT, userMsg, 128, ctx);
    if (!raw) return { ok: false, message: 'Empty response from AI.' };
    const label = stripSummaryLabelCore(raw);
    if (!label) return { ok: false, message: 'AI returned an empty label.' };
    const newParentId = useOutlineStore.getState().applySummaryParent(rootIds, label);
    if (newParentId === null) return { ok: false, message: 'Selection changed while summarising — try again.' };
    return { ok: true, message: 'Summarised into: ' + label };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
