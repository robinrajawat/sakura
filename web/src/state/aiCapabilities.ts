/**
 * Per-capability thin wrappers over `aiCall.ts`'s `callAiByShape` — direct port of legacy's real
 * `callAiApi`/`callAiApiBatchChunk`/`callAiApiBatch` (legacy/index.html:28306-28348), each just
 * resolving a provider/model/key into a `callAiByShape` call with a fixed `maxTokens` and (for
 * the batch functions) the sentinel-marker chunking protocol every batched AI capability in this
 * app shares (Rewrite today; Suggest icon later reuses the exact same chunking, per
 * §6.9's own plan).
 *
 * **Deliberately single-provider, no fallback, in this slice.** Legacy's real `callAiApi` goes
 * through `callAiByShapeWithFallback` (usage recording + the provider fallback chain) — this
 * project's own §6.9 plan (docs/phase6-full-parity-plan.md) sequences that as its own later
 * slice (9 of 9), after every capability that calls through here already exists. `callAiApi`
 * below calls `callAiByShape` directly for now; when slice 9 lands, it becomes the one place that
 * needs to change to make every capability built on top of it fallback-aware for free.
 */

import { callAiByShape } from './aiCall';
import { getAiProviderById, extraHeadersForProvider } from './aiProviderCatalog';

export interface AiCallContext {
  providerId: string;
  model: string;
  apiKey: string;
}

function callProvider(ctx: AiCallContext, systemPrompt: string, userContent: string, maxTokens: number): Promise<string> {
  const provider = getAiProviderById(ctx.providerId);
  return callAiByShape({
    shape: provider.shape,
    baseUrl: provider.baseUrl,
    apiKey: ctx.apiKey,
    model: ctx.model,
    systemPrompt,
    userContent,
    maxTokens,
    extraHeaders: extraHeadersForProvider(ctx.providerId)
  });
}

/** Matches legacy's real `callAiApi` (index.html:28306-28310) — the node-Rewrite entry point.
 * `maxTokens` hardcoded to 1024 regardless of the user's `ai-max-tokens-select` setting, matching
 * legacy's own real, documented behavior exactly (that setting is scoped to note/Pad/Journal/
 * Library-style rich-text Rewrite, not the outline-node Rewrite this calls). */
export function callAiApi(text: string, systemPrompt: string, ctx: AiCallContext): Promise<string> {
  return callProvider(ctx, systemPrompt, text, 1024);
}

const AI_BATCH_CHUNK_SIZE = 30; // matches legacy's own real AI_BATCH_CHUNK_SIZE exactly

const BATCH_ITEM_REGEX = /<<<SAKURA-ITEM-(\d+)>>>\s*\n?([\s\S]*?)(?=\n<<<SAKURA-ITEM-\d+>>>|$)/g;

/** Pure: builds the one-call-covers-N-items batch prompt, matching legacy's real sentinel
 * marker format exactly. */
export function buildBatchUserContent(texts: string[]): string {
  return texts.map((t, i) => `<<<SAKURA-ITEM-${i + 1}>>>\n${t}`).join('\n');
}

/** Pure: parses a batch response back into one string per input item, in order — an item whose
 * marker didn't come back cleanly (model dropped it, mangled the number, etc.) falls back to
 * that item's own ORIGINAL text rather than an empty string, matching legacy's real behavior
 * exactly (never silently blank out a node the model failed to address). */
export function parseBatchResponse(raw: string, originals: string[]): string[] {
  const parsed: Record<number, string> = {};
  let m: RegExpExecArray | null;
  BATCH_ITEM_REGEX.lastIndex = 0;
  while ((m = BATCH_ITEM_REGEX.exec(raw)) !== null) {
    parsed[Number(m[1])] = m[2].trim();
  }
  return originals.map((original, i) => parsed[i + 1] ?? original);
}

/** One real network call covering up to `AI_BATCH_CHUNK_SIZE` items at once, matching legacy's
 * real `callAiApiBatchChunk` (index.html:28314-28332). `maxTokens` here (1024) matches legacy's
 * own real batch-chunk budget. */
export async function callAiApiBatchChunk(texts: string[], systemPrompt: string, ctx: AiCallContext): Promise<string[]> {
  const raw = await callProvider(ctx, systemPrompt, buildBatchUserContent(texts), 1024);
  return parseBatchResponse(raw, texts);
}

/** Chunks `texts` into groups of `AI_BATCH_CHUNK_SIZE`, calling `callAiApiBatchChunk` once per
 * chunk sequentially (not in parallel — matches legacy's real `callAiApiBatch`, which awaits
 * each chunk before starting the next), reporting progress after each chunk completes. Matches
 * legacy's real `callAiApiBatch` (index.html:28334-28348) exactly. */
export async function callAiApiBatch(texts: string[], systemPrompt: string, ctx: AiCallContext, onChunkProgress?: (done: number, total: number) => void): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < texts.length; i += AI_BATCH_CHUNK_SIZE) {
    const chunk = texts.slice(i, i + AI_BATCH_CHUNK_SIZE);
    const chunkResults = await callAiApiBatchChunk(chunk, systemPrompt, ctx);
    results.push(...chunkResults);
    onChunkProgress?.(results.length, texts.length);
  }
  return results;
}
