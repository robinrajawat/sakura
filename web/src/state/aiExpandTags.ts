/**
 * Expand node + Suggest tags — §6.9 slice 6 (docs/phase6-full-parity-plan.md). Direct port of
 * legacy's real `expandNodeWithAi`/`suggestTagsWithAi` (legacy/index.html:28352-28408), both
 * simple single-node single-shot capabilities built on `aiCapabilities.ts`'s generic
 * `callAiApiWithPrompt`. Plain orchestration functions using `.getState()`, matching
 * `aiRewrite.ts`/`aiOutline.ts`'s own established convention.
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
  return { providerId: ai.provider, model: ai.model, apiKey };
}

/** Matches legacy's real `AI_EXPAND_SYSTEM_PROMPT` (index.html:29346) verbatim. */
export const AI_EXPAND_SYSTEM_PROMPT =
  'You expand a single outline node into a structured subtree. Given a node label, respond with ONLY a flat list of child items using "-" prefix, one per line, no nesting. Be concise, 3-8 items. No intro text, no numbering, no blank lines.';

/** Pure: matches legacy's real per-line bullet-prefix strip exactly — deliberately flat (no
 * indentation/depth parsing, unlike Generate Outline/Restructure Text's own parser), since
 * Expand's response is always a flat list by design. */
export function parseExpandResponseCore(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.replace(/^[-*+•●]\s*/, '').trim())
    .filter(Boolean);
}

/** Matches legacy's real `expandNodeWithAi` orchestration. */
export async function expandNode(nodeId: number): Promise<AiActionResult> {
  const node = useOutlineStore.getState().nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, message: 'Node not found.' };
  const text = node.text ?? '';
  if (!text.trim()) return { ok: false, message: 'Nothing to expand — this node has no text.' };

  const ctx = resolveCallContext();
  if (!ctx) return { ok: false, message: NO_KEY_MESSAGE };

  try {
    const raw = await callAiApiWithPrompt(AI_EXPAND_SYSTEM_PROMPT, 'Node: ' + text, 512, ctx);
    if (!raw) return { ok: false, message: 'Empty response from AI.' };
    const lines = parseExpandResponseCore(raw);
    if (!lines.length) return { ok: false, message: 'AI returned no items.' };
    const ids = useOutlineStore.getState().expandNodeChildren(nodeId, lines);
    if (!ids.length) return { ok: false, message: 'Node was deleted while expanding.' };
    return { ok: true, message: `Expanded into ${ids.length} node${ids.length === 1 ? '' : 's'}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Matches legacy's real `AI_TAG_SYSTEM_PROMPT` (index.html:29347) verbatim. */
export const AI_TAG_SYSTEM_PROMPT =
  'You suggest tags for an outline node. Given the node text and a list of existing tags in the document, respond with ONLY a JSON array of tag strings (lowercase, hyphenated, no #). Prefer reusing existing tags if relevant. Suggest 1-4 tags total. Example: ["integration","pricing","ewm"]. No other text.';

/** Pure: matches legacy's real per-tag cleanup exactly — lowercase, spaces to hyphens, strip
 * anything outside `[a-z0-9-]`, cap at 40 chars. Applied uniformly regardless of whether the tag
 * came from the JSON-array path or the fallback split (see `parseTagsResponseCore` below). */
export function normalizeTagCore(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
}

/** Pure: matches legacy's real tag-response parsing exactly — tries a JSON array first
 * (stripping a ```json fence the model sometimes wraps it in), and falls back to a plain
 * comma/newline split if that fails (a model that ignores the "respond with ONLY a JSON array"
 * instruction still usually produces something usable this way). Every resulting tag is
 * normalized via `normalizeTagCore` regardless of which path produced it. */
export function parseTagsResponseCore(raw: string): string[] {
  let tags: unknown;
  try {
    tags = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    tags = raw
      .split(/[,\n]/)
      .map((t) => t.replace(/[^a-z0-9-]/g, '').trim())
      .filter(Boolean);
  }
  if (!Array.isArray(tags)) return [];
  return tags.map((t) => normalizeTagCore(String(t))).filter(Boolean);
}

/** Matches legacy's real `suggestTagsWithAi` orchestration, including deduping existing tags
 * across the whole document to hand the AI as context and preferring reuse. */
export async function suggestTags(nodeId: number): Promise<AiActionResult> {
  const nodes = useOutlineStore.getState().nodes;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, message: 'Node not found.' };
  const text = node.text ?? '';
  if (!text.trim()) return { ok: false, message: 'Nothing to tag — this node has no text.' };

  const ctx = resolveCallContext();
  if (!ctx) return { ok: false, message: NO_KEY_MESSAGE };

  try {
    const existingTags = Array.from(new Set(nodes.flatMap((n) => n.tags)));
    const userMsg = 'Node: ' + text + '\nExisting tags: ' + (existingTags.length ? existingTags.join(', ') : 'none');
    const raw = await callAiApiWithPrompt(AI_TAG_SYSTEM_PROMPT, userMsg, 256, ctx);
    if (!raw) return { ok: false, message: 'Empty response from AI.' };
    const tags = parseTagsResponseCore(raw);
    if (!tags.length) return { ok: false, message: 'AI returned no tags.' };
    const newTags = useOutlineStore.getState().addSuggestedTags(nodeId, tags);
    if (!newTags.length) return { ok: true, message: 'No new tags to add.' };
    return { ok: true, message: 'Added tags: ' + newTags.map((t) => '#' + t).join(', ') };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
