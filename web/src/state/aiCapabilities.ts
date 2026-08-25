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

/** Matches legacy's real `AI_OUTLINE_SYSTEM_PROMPT` (index.html:29350) verbatim. */
export const AI_OUTLINE_SYSTEM_PROMPT =
  'You write outlines as plain nested lists. Given a short topic or document type, respond with ONLY a nested outline: one item per line, using "-" for each item, indenting child items by exactly 2 spaces per level beneath their parent. Do not add numbering, headings, commentary, code fences, or any text before or after the list. Keep each label short (a few words), 3-5 levels deep, sized as a working outline rather than a finished document.';

/** Matches legacy's real `callAiApiOutline` (index.html:29373-29378) — Generate Outline's entry
 * point. `maxTokens=2048` matches legacy's own real budget. */
export function callAiApiOutline(topic: string, ctx: AiCallContext): Promise<string> {
  return callProvider(ctx, AI_OUTLINE_SYSTEM_PROMPT, 'Topic: ' + topic, 2048);
}

/** Matches legacy's real `AI_RESTRUCTURE_SYSTEM_PROMPT` (index.html:29351) verbatim. */
export const AI_RESTRUCTURE_SYSTEM_PROMPT =
  'You convert unstructured or messy pasted text into a hierarchical outline for a tree-based outliner. Prioritize making each node read well as a tree item over preserving the source verbatim: fix broken mid-sentence line wraps (common artifacts of copying from PDFs/Word), trim filler and redundant phrasing, and tighten long sentences into concise node labels. Reformat tabular data into nested parent/child nodes (e.g. a table row becomes a parent node with its columns as child nodes) rather than dumping raw rows as one line. You may infer grouping and hierarchy from headings, numbering, and context even when the source has no indentation at all. The one hard rule: do not invent facts, names, numbers, codes, or claims that are not present in the source text — every node must trace back to something actually in the input. Split the input into logical line items and nest them by topic/sub-topic. Respond with ONLY a nested outline: one item per line, using "-" for each item, indenting child items by exactly 2 spaces per level beneath their parent. Do not add commentary, code fences, or any text before or after the list. If the input already reads as a flat list of short items with no obvious grouping, keep it flat rather than forcing artificial nesting.';

/** Matches legacy's real `AI_RESTRUCTURE_MAX_CHARS` (index.html:29382) — caps the source text so
 * a single giant paste doesn't blow the request size or the response token budget. */
export const AI_RESTRUCTURE_MAX_CHARS = 16000;

/** Matches legacy's real `callAiApiRestructure` (index.html:29383-29389) — Restructure Text's
 * entry point. `maxTokens=4096` matches legacy's own real budget (larger than Outline's, since
 * this can echo back a much longer structured document). */
export function callAiApiRestructure(text: string, ctx: AiCallContext): Promise<string> {
  const truncated = text.length > AI_RESTRUCTURE_MAX_CHARS;
  const userMsg = 'Text to restructure:\n\n' + text.slice(0, AI_RESTRUCTURE_MAX_CHARS) + (truncated ? '\n\n[...truncated — input was longer than the supported limit]' : '');
  return callProvider(ctx, AI_RESTRUCTURE_SYSTEM_PROMPT, userMsg, 4096);
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
