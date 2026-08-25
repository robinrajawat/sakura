/**
 * Rewrite — the first real AI capability (§6.9, docs/phase6-full-parity-plan.md). Direct port of
 * legacy's real `rewriteNodeText`/`rewriteMultipleNodes`/`rewriteAllNodes` (legacy/index.html:
 * 28489-28512 and surrounding call sites), including the in-flight-edit-guard pattern
 * (`aiSnapshotChanged`/`applyAiBatchResults`) legacy uses for every batched AI capability, not
 * just this one.
 *
 * Plain orchestration functions (not a Zustand store) reading/writing `outlineStore`/
 * `aiSettingsStore` via `.getState()` — matches this project's own established convention for
 * cross-store, point-in-time action logic triggered from a click handler (e.g.
 * `ExportButtons.tsx`'s own `useOutlineStore.getState()`/`useDocumentsStore.getState()` calls),
 * rather than inventing a new store for what's really "a function three UI call sites share."
 *
 * **Deliberately NOT built in this slice**, each a real, separately-scoped follow-up:
 * - Sub-text-selection rewrite (legacy's real `rewriteSubTextSelection`, rewriting just a
 *   highlighted substring within the actively-edited node and splicing the result back at the
 *   same offsets) — needs live textarea selection-range access `OutlineTree.tsx`'s own
 *   uncontrolled-input editing model doesn't currently expose anywhere.
 * - Auto-rewrite on commit (its own real trigger/debounce/exclusion-filter logic, a materially
 *   bigger separate feature per the plan doc's own slice sequence).
 * - Provider fallback (`aiCapabilities.ts`'s own header) and usage tracking — both later slices.
 *
 * The in-flight guard here (`inFlightIds`) is a plain module-level `Set`, not persisted or
 * reactive — it exists purely to prevent double-firing the same node's rewrite while a request
 * for it is already outstanding, matching legacy's own real `aiRewriteInFlight` Set.
 */

import { useOutlineStore } from '../store/outlineStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import { callAiApi, callAiApiBatch, type AiCallContext } from './aiCapabilities';

export interface AiActionResult {
  ok: boolean;
  message: string;
}

/** Pure: matches legacy's real `aiSnapshotChanged` exactly — true when the node's text at
 * resolution time differs from what was sent to the AI, meaning the user edited it again while
 * the request was in flight and the result should be discarded rather than silently overwriting
 * the newer edit. */
export function aiSnapshotChanged(originalText: string, currentText: string): boolean {
  return originalText !== currentText;
}

const inFlightIds = new Set<number>();

function resolveCallContext(): AiCallContext | null {
  const ai = useAiSettingsStore.getState();
  const apiKey = ai.getKeyForProvider(ai.provider);
  if (!apiKey) return null;
  return { providerId: ai.provider, model: ai.model, apiKey };
}

const NO_KEY_MESSAGE = 'No AI provider key configured — set one up in Settings → AI.';

/** Rewrites a single node's own text. Matches legacy's real `rewriteNodeText` — an in-flight
 * guard prevents double-firing, and the AI's result is discarded (not applied) if the node's
 * text changed again while the request was outstanding. */
export async function rewriteNode(id: number): Promise<AiActionResult> {
  if (inFlightIds.has(id)) return { ok: false, message: 'Already rewriting this node.' };

  const node = useOutlineStore.getState().nodes.find((n) => n.id === id);
  if (!node) return { ok: false, message: 'Node not found.' };

  const ctx = resolveCallContext();
  if (!ctx) return { ok: false, message: NO_KEY_MESSAGE };

  const original = node.text ?? '';
  inFlightIds.add(id);
  try {
    const prompt = useAiSettingsStore.getState().prompt;
    const result = await callAiApi(original, prompt, ctx);
    const current = useOutlineStore.getState().nodes.find((n) => n.id === id);
    if (!current) return { ok: false, message: 'Node no longer exists.' };
    if (aiSnapshotChanged(original, current.text ?? '')) {
      return { ok: false, message: 'Not applied — this node was edited again before the rewrite finished.' };
    }
    useOutlineStore.getState().applyAiTextResult(id, result);
    return { ok: true, message: 'Rewrote 1 node.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  } finally {
    inFlightIds.delete(id);
  }
}

/** Rewrites every id in `ids` as one batch call (matches legacy's real `rewriteMultipleNodes`,
 * also the shared engine `rewriteAllNodes`/§6.9's later auto-rewrite slice will both reuse).
 * Ids already in flight are skipped rather than re-sent. Each node's result is independently
 * checked against the in-flight-edit guard before being applied — a race on one node doesn't
 * block the rest of the batch from applying. */
export async function rewriteNodes(ids: number[]): Promise<AiActionResult> {
  const targetIds = Array.from(new Set(ids)).filter((id) => !inFlightIds.has(id));
  if (!targetIds.length) return { ok: false, message: 'Already rewriting.' };

  const nodes = useOutlineStore.getState().nodes;
  const originals = new Map<number, string>();
  for (const id of targetIds) {
    const node = nodes.find((n) => n.id === id);
    if (node) originals.set(id, node.text ?? '');
  }
  if (!originals.size) return { ok: false, message: 'No nodes found.' };

  const ctx = resolveCallContext();
  if (!ctx) return { ok: false, message: NO_KEY_MESSAGE };

  const idsWithText = Array.from(originals.entries());
  idsWithText.forEach(([id]) => inFlightIds.add(id));
  try {
    const prompt = useAiSettingsStore.getState().prompt;
    const texts = idsWithText.map(([, text]) => text);
    const results = await callAiApiBatch(texts, prompt, ctx);

    let applied = 0;
    let skipped = 0;
    idsWithText.forEach(([id, original], i) => {
      const current = useOutlineStore.getState().nodes.find((n) => n.id === id);
      if (!current || aiSnapshotChanged(original, current.text ?? '')) {
        skipped++;
        return;
      }
      useOutlineStore.getState().applyAiTextResult(id, results[i]);
      applied++;
    });

    return {
      ok: applied > 0,
      message: skipped ? `Rewrote ${applied} node(s), skipped ${skipped} edited during the request.` : `Rewrote ${applied} node(s).`
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  } finally {
    idsWithText.forEach(([id]) => inFlightIds.delete(id));
  }
}

/** Rewrites every node in the current document. Matches legacy's real `rewriteAllNodes` — the
 * same batch engine as `rewriteNodes`, just given every node id. */
export function rewriteDocument(): Promise<AiActionResult> {
  const allIds = useOutlineStore.getState().nodes.map((n) => n.id);
  if (!allIds.length) return Promise.resolve({ ok: false, message: 'Nothing to rewrite.' });
  return rewriteNodes(allIds);
}
