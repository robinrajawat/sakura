/**
 * Suggest icon — §6.9 slice 7 (docs/phase6-full-parity-plan.md). Direct port of legacy's real
 * `suggestIconsForNodeIds`/`suggestIconChoiceForNode`/`suggestIconForSelection`/
 * `suggestIconsForAllNodes` (legacy/index.html:29003-29315), including the two free tiers ahead
 * of any AI call — a local keyword→emoji lookup (`ICON_KEYWORD_MAP`) and an exact-label match
 * against icons already settled on elsewhere in the document/other saved documents — and the
 * single-node picker variant that lets the person choose among several AI-suggested options
 * rather than auto-applying (only makes sense one node at a time; a picker per node during a
 * multi-select or whole-document run would mean dismissing one for every single node, so those
 * still auto-apply via `suggestIconsForNodeIds`, same as legacy).
 *
 * Plain orchestration functions using `.getState()`, matching this project's own established
 * convention for cross-store AI capability logic (`aiRewrite.ts`/`aiOutline.ts`/
 * `aiExpandTags.ts`).
 *
 * **Deliberately simplified from legacy in one place**: the picker (`suggestIconChoiceForNode`)
 * doesn't compute a pixel-precise anchor position above the node's own row the way legacy's real
 * `showIconPickerPopover` does (it queries `.node-row[data-id="..."]` and does viewport-edge
 * math) — `web/`'s row markup has no equivalent stable selector, and this project's own "port the
 * effect, not the exact technique" precedent (established in earlier §6.9 slices) covers this:
 * `components/IconPickerPopover.tsx` always renders centered, matching legacy's own real
 * fallback path for when no anchor row is found (legacy/index.html:29247-29249) rather than
 * inventing new positioning behavior. Historical-icon-index scope is also narrower than legacy's:
 * it covers the live document plus every saved document (`documentsStore.ts`'s `docsIndex`), NOT
 * templates — `web/` has no live Templates surface yet (`templatesIndex.ts` is ported but never
 * wired into the app, see that module's own header), so there is nothing there to read.
 *
 * **Deliberately NOT built in this slice**: provider fallback (`aiCapabilities.ts`'s own header)
 * and usage tracking — both later slices.
 */

import { useOutlineStore, type OutlineNode } from '../store/outlineStore';
import { useDocumentsStore, loadDocNodesById } from '../store/documentsStore';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import { callAiApiWithPrompt, type AiCallContext } from './aiCapabilities';
import { splitLeadingIconCore } from '../utils/iconText';

export interface AiActionResult {
  ok: boolean;
  message: string;
}

/** Returned by `suggestIconChoiceForNode` when there's more than one real candidate: nothing has
 * been applied yet, and the caller (a UI component) should show a picker for the person to
 * choose from — `applyIconChoice` below applies whichever one they pick. */
export interface IconChoiceOutcome extends AiActionResult {
  candidates?: string[];
  nodeId?: number;
}

const NO_KEY_MESSAGE = 'No AI provider key configured — set one up in Settings → AI.';

function resolveCallContext(): AiCallContext | null {
  const ai = useAiSettingsStore.getState();
  const apiKey = ai.getKeyForProvider(ai.provider);
  if (!apiKey) return null;
  return { providerId: ai.provider, model: ai.model, apiKey };
}

/** Matches legacy's real `ICON_KEYWORD_MAP` (index.html:29032-29079) verbatim — the free,
 * instant, no-API-call first tier. */
export const ICON_KEYWORD_MAP: { emoji: string; keywords: string[] }[] = [
  { emoji: '🔷', keywords: ['sap', 's/4hana', 's4hana', 'abap', 'cds view', 'business object'] },
  { emoji: '🛒', keywords: ['webshop', 'e-commerce', 'ecommerce', 'shop', 'cart', 'checkout', 'storefront'] },
  { emoji: '🖥️', keywords: ['ui', 'frontend', 'front-end', 'interface', 'ux', 'fiori', 'fiori elements', 'sapui5', 'ui5'] },
  { emoji: '⚙️', keywords: ['backend', 'back-end', 'server', 'api', 'microservice', 'odata'] },
  { emoji: '🗄️', keywords: ['database', 'db', 'sql', 'nosql', 'schema'] },
  { emoji: '🔐', keywords: ['security', 'auth', 'authentication', 'authorization', 'login', 'permission', 'encryption'] },
  { emoji: '🧪', keywords: ['test', 'tests', 'testing', 'qa', 'unit test', 'unit tests'] },
  { emoji: '🚀', keywords: ['deploy', 'deployment', 'release', 'ci/cd', 'cicd', 'pipeline'] },
  { emoji: '☁️', keywords: ['cloud', 'infrastructure', 'hosting', 'aws', 'azure', 'gcp'] },
  { emoji: '🔧', keywords: ['devops', 'maintenance', 'config', 'configuration', 'setup'] },
  { emoji: '📱', keywords: ['mobile', 'ios', 'android'] },
  { emoji: '🎨', keywords: ['design', 'branding', 'mockup', 'prototype', 'style guide'] },
  { emoji: '📣', keywords: ['marketing', 'campaign', 'seo', 'advertising', 'promotion'] },
  { emoji: '📄', keywords: ['documentation', 'docs', 'readme', 'spec', 'requirement', 'requirements'] },
  { emoji: '🐛', keywords: ['bug', 'bugs', 'issue', 'defect', 'hotfix'] },
  { emoji: '📅', keywords: ['meeting', 'schedule', 'calendar', 'timeline', 'roadmap'] },
  { emoji: '💡', keywords: ['idea', 'ideas', 'brainstorm', 'concept', 'proposal'] },
  { emoji: '🔬', keywords: ['research', 'analysis', 'investigation', 'study'] },
  { emoji: '✉️', keywords: ['email', 'newsletter', 'notification', 'notifications'] },
  { emoji: '💳', keywords: ['payment', 'payments', 'billing', 'invoice', 'invoicing', 'pricing'] },
  { emoji: '📊', keywords: ['analytics', 'metrics', 'dashboard', 'kpi', 'report', 'reporting'] },
  { emoji: '👥', keywords: ['team', 'hr', 'staff', 'onboarding', 'people'] },
  { emoji: '⚖️', keywords: ['legal', 'compliance', 'contract', 'policy', 'gdpr'] },
  { emoji: '📦', keywords: ['inventory', 'product', 'shipping', 'logistics', 'warehouse'] },
  { emoji: '🌐', keywords: ['network', 'web', 'domain', 'dns'] },
  { emoji: '🔑', keywords: ['access', 'credentials', 'license', 'licensing'] },
  { emoji: '🎧', keywords: ['support', 'helpdesk', 'ticket', 'tickets', 'customer service'] },
  { emoji: '💰', keywords: ['budget', 'finance', 'financial', 'accounting', 'expense', 'expenses'] },
  { emoji: '📈', keywords: ['sales', 'revenue', 'quota', 'deal', 'deals'] },
  { emoji: '🎓', keywords: ['training', 'curriculum', 'tutorial', 'lesson'] },
  { emoji: '🏭', keywords: ['manufacturing', 'production', 'assembly line', 'factory'] },
  { emoji: '📝', keywords: ['content', 'cms', 'blog post', 'article', 'copywriting'] },
  { emoji: '📡', keywords: ['monitoring', 'observability', 'logging', 'logs', 'alerting', 'uptime'] },
  { emoji: '⚡', keywords: ['performance', 'optimization', 'latency', 'throughput', 'benchmark'] },
  { emoji: '♿', keywords: ['accessibility', 'a11y', 'wcag'] },
  { emoji: '🌍', keywords: ['localization', 'internationalization', 'i18n', 'l10n', 'translation'] },
  { emoji: '🔀', keywords: ['git', 'github', 'gitlab', 'repository', 'pull request'] },
  { emoji: '🤖', keywords: ['machine learning', 'neural network', 'dataset', 'ai model', 'llm'] },
  { emoji: '🔌', keywords: ['integration', 'integrations', 'webhook', 'connector'] },
  { emoji: '🖨️', keywords: ['hardware', 'firmware', 'sensor'] },
  { emoji: '🎉', keywords: ['event', 'events', 'conference', 'workshop', 'webinar'] },
  { emoji: '🤝', keywords: ['partnership', 'partnerships', 'vendor', 'supplier'] },
  { emoji: '🚩', keywords: ['risk assessment', 'risk register', 'governance', 'audit', 'audits'] },
  { emoji: '🧑\u200d💼', keywords: ['recruitment', 'hiring', 'candidate'] },
  { emoji: '📋', keywords: ['survey', 'surveys', 'feedback', 'nps'] },
  { emoji: '🔁', keywords: ['automation', 'automate', 'workflow', 'workflows'] }
];

/** Pure: matches legacy's real `lookupIconForText` exactly — a whole-word, case-insensitive
 * keyword scan, first matching entry in `ICON_KEYWORD_MAP` order wins. */
export function lookupIconForTextCore(text: string): string | null {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  for (const entry of ICON_KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      const re = new RegExp('\\b' + kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '\\b');
      if (re.test(t)) return entry.emoji;
    }
  }
  return null;
}

/** Pure: matches legacy's real `buildHistoricalIconIndex`'s `consider` step — an exact
 * icon-stripped-label → icon map, built from one or more arrays of raw node text, later arrays
 * winning on a key collision (same as legacy's own sequential `Map.set` calls). Takes plain text
 * arrays (not node objects) so it stays independently testable of any store. */
export function buildHistoricalIconIndexCore(textArrays: string[][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const texts of textArrays) {
    for (const text of texts) {
      const { icon, rest } = splitLeadingIconCore(text);
      const key = rest.trim().toLowerCase();
      if (key && icon) map.set(key, icon);
    }
  }
  return map;
}

/** Reads the live document plus every saved document (see this file's own header for why
 * templates aren't included) and builds the historical-icon lookup. */
function buildHistoricalIconIndex(): Map<string, string> {
  const live = useOutlineStore.getState().nodes.map((n) => n.text || '');
  const docsIndex = useDocumentsStore.getState().docsIndex;
  const arrays = [live, ...docsIndex.map((d) => loadDocNodesById(d.id).map((n) => n.text || ''))];
  return buildHistoricalIconIndexCore(arrays);
}

/** Matches legacy's real `AI_ICON_SYSTEM_PROMPT` (index.html:29114) verbatim. Concatenated
 * directly into the request's user content (not passed as a separate system prompt) — matches
 * legacy's own real `callAiRaw` usage here exactly (empty system prompt, everything in one
 * combined string), unlike Expand/Tags' `callAiApiWithPrompt(systemPrompt, userMsg, ...)` split. */
export const AI_ICON_SYSTEM_PROMPT =
  'You assign exactly one relevant emoji to each short text label, based on its topic or theme (for example, a label about a webshop or storefront gets a shopping-cart-style emoji; a label about backend services gets a gear-style emoji). You will receive a numbered list of labels. Reply with ONLY a numbered list in the exact same format [1], [2], etc., each line followed by exactly one emoji and nothing else — no words, no punctuation, no explanation. If a label has no clear thematic fit, use 📌.';

/** Pure: matches legacy's real numbered-list prompt build inside `callAiIconBatchChunk`
 * (index.html:29116-29117) exactly. */
export function buildIconBatchPrompt(texts: string[]): string {
  const numbered = texts.map((t, i) => `[${i + 1}] ${t && t.trim() ? t : '(untitled)'}`).join('\n');
  return AI_ICON_SYSTEM_PROMPT + '\n\nLabels:\n' + numbered;
}

const ICON_BATCH_ITEM_REGEX = /\[(\d+)\]\s*([\s\S]*?)(?=\n\[\d+\]|$)/g;

/** Pure: matches legacy's real per-item batch-response parse (index.html:29119-29128) exactly —
 * keeps only the first whitespace-separated token per line (defensive against a model adding
 * stray words despite instructions), and leaves an entry '' (not the original text — unlike the
 * Rewrite batch parser, there's no sensible "original" to fall back to for an icon) when its
 * marker didn't come back cleanly. */
export function parseIconBatchResponseCore(raw: string, count: number): string[] {
  const results = new Array(count).fill('');
  let m: RegExpExecArray | null;
  ICON_BATCH_ITEM_REGEX.lastIndex = 0;
  while ((m = ICON_BATCH_ITEM_REGEX.exec(raw)) !== null) {
    const i = parseInt(m[1], 10) - 1;
    if (i >= 0 && i < count) {
      results[i] = m[2].trim().split(/\s+/)[0] || '';
    }
  }
  return results;
}

const AI_ICON_BATCH_CHUNK_SIZE = 30; // matches legacy's own real AI_BATCH_CHUNK_SIZE exactly

async function callAiIconBatchChunk(texts: string[], ctx: AiCallContext): Promise<string[]> {
  const prompt = buildIconBatchPrompt(texts);
  const raw = await callAiApiWithPrompt('', prompt, Math.min(8192, texts.length * 8 + 100), ctx);
  return parseIconBatchResponseCore(raw, texts.length);
}

/** Matches legacy's real `callAiIconBatch` (index.html:29131-29142) — chunks sequentially (not
 * in parallel), same shape as `aiCapabilities.ts`'s own `callAiApiBatch`. */
async function callAiIconBatch(texts: string[], ctx: AiCallContext): Promise<string[]> {
  if (texts.length <= AI_ICON_BATCH_CHUNK_SIZE) return callAiIconBatchChunk(texts, ctx);
  const all = new Array(texts.length).fill('');
  for (let start = 0; start < texts.length; start += AI_ICON_BATCH_CHUNK_SIZE) {
    const end = Math.min(start + AI_ICON_BATCH_CHUNK_SIZE, texts.length);
    const chunk = texts.slice(start, end);
    const chunkResults = await callAiIconBatchChunk(chunk, ctx);
    for (let i = 0; i < chunkResults.length; i++) all[start + i] = chunkResults[i];
  }
  return all;
}

/** Matches a single emoji "grapheme" (optionally with a variation selector or ZWJ continuation)
 * and nothing else — used to sanity-check the AI's free-text reply for the picker's own options
 * prompt below, matching legacy's real `SINGLE_ICON_TOKEN_RE` exactly. */
const SINGLE_ICON_TOKEN_RE = /^\p{Extended_Pictographic}(?:\uFE0F|\u200d\p{Extended_Pictographic})*$/u;

const AI_ICON_OPTIONS_PROMPT =
  'Suggest 4 different relevant emoji options for the following short text label, based on its topic or theme, ordered from most to least relevant. Reply with ONLY the 4 emoji separated by single spaces, and nothing else — no words, no numbering, no punctuation other than the emoji themselves.';

/** Pure: matches legacy's real `callAiIconOptions` response parse (index.html:29151) exactly. */
export function parseIconOptionsResponseCore(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => SINGLE_ICON_TOKEN_RE.test(s));
}

async function callAiIconOptions(text: string, ctx: AiCallContext): Promise<string[]> {
  const prompt = AI_ICON_OPTIONS_PROMPT + '\n\nLabel: ' + (text && text.trim() ? text : '(untitled)');
  const raw = await callAiApiWithPrompt('', prompt, 60, ctx);
  return parseIconOptionsResponseCore(raw);
}

/** Batch, auto-applying entry point — matches legacy's real `suggestIconsForNodeIds`
 * (index.html:29153-29209): keyword and historical-match tiers run first for every node, only
 * labels that miss both fall through to a single deduped AI batch call (identical labels share
 * one lookup, common in reused boilerplate), and every entry independently re-checks the
 * in-flight-edit guard before applying via `outlineStore.ts`'s `applySuggestedIcons`. */
export async function suggestIconsForNodeIds(nodeIds: number[]): Promise<AiActionResult> {
  if (!nodeIds.length) return { ok: false, message: 'No nodes selected.' };

  const nodes = useOutlineStore.getState().nodes;
  const targets = nodeIds.map((id) => nodes.find((n) => n.id === id)).filter((n): n is OutlineNode => !!n);
  if (!targets.length) return { ok: false, message: 'No nodes found.' };

  const bareTexts = targets.map((n) => splitLeadingIconCore(n.text || '').rest);
  const originalFullTexts = targets.map((n) => n.text || '');
  const historyIndex = buildHistoricalIconIndex();

  const hits: (string | null)[] = new Array(targets.length).fill(null);
  const aiSlots: number[] = [];
  bareTexts.forEach((bare, j) => {
    let icon = lookupIconForTextCore(bare);
    if (!icon) {
      const key = bare.trim().toLowerCase();
      if (key) icon = historyIndex.get(key) || null;
    }
    if (icon) hits[j] = icon;
    else aiSlots.push(j);
  });

  let aiResults: string[] = [];
  if (aiSlots.length) {
    const ctx = resolveCallContext();
    if (!ctx) return { ok: false, message: NO_KEY_MESSAGE };
    const uniqueTexts: string[] = [];
    const textToUniqueIdx = new Map<string, number>();
    aiSlots.forEach((j) => {
      const key = bareTexts[j].trim().toLowerCase();
      if (!textToUniqueIdx.has(key)) {
        textToUniqueIdx.set(key, uniqueTexts.length);
        uniqueTexts.push(bareTexts[j]);
      }
    });
    try {
      const uniqueResults = await callAiIconBatch(uniqueTexts, ctx);
      aiResults = aiSlots.map((j) => {
        const key = bareTexts[j].trim().toLowerCase();
        return uniqueResults[textToUniqueIdx.get(key)!] || '';
      });
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  let aiPtr = 0;
  const finalTexts = targets.map((_n, j) => {
    let icon = hits[j];
    if (icon === null) {
      icon = aiResults[aiPtr] || '';
      aiPtr++;
    }
    return icon ? icon + ' ' + bareTexts[j] : '';
  });

  const entries = targets.map((n, j) => ({ id: n.id, expectedText: originalFullTexts[j], finalText: finalTexts[j] }));
  const appliedCount = useOutlineStore.getState().applySuggestedIcons(entries);
  if (!appliedCount) return { ok: false, message: 'No suitable icons found.' };
  return { ok: true, message: `${appliedCount} icon${appliedCount === 1 ? '' : 's'} suggested.` };
}

/** Single-node entry point: combines the same free tiers with several AI-suggested alternatives.
 * Matches legacy's real `suggestIconChoiceForNode` (index.html:29268-29298) — if there's only one
 * distinct candidate there's no real decision to make, so it applies directly; otherwise it
 * returns the candidates for the caller to show a picker for (see `IconChoiceOutcome`'s own
 * header). A missing AI key, or the AI options call itself failing, doesn't fail the whole
 * operation as long as the free tiers found at least one candidate — matching legacy's own
 * try/catch there (`aiErr` is only surfaced when `candidates` ends up empty). */
export async function suggestIconChoiceForNode(nodeId: number): Promise<IconChoiceOutcome> {
  const nodes = useOutlineStore.getState().nodes;
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { ok: false, message: 'Node not found.' };
  const bare = splitLeadingIconCore(node.text || '').rest;
  if (!bare.trim()) return { ok: false, message: 'Add some text to the node first.' };

  const candidates: string[] = [];
  const kw = lookupIconForTextCore(bare);
  if (kw) candidates.push(kw);
  const hist = buildHistoricalIconIndex().get(bare.trim().toLowerCase());
  if (hist && !candidates.includes(hist)) candidates.push(hist);

  let aiErr: unknown = null;
  const ctx = resolveCallContext();
  if (ctx) {
    try {
      const aiOpts = await callAiIconOptions(bare, ctx);
      aiOpts.forEach((o) => {
        if (!candidates.includes(o)) candidates.push(o);
      });
    } catch (err) {
      aiErr = err;
    }
  } else {
    aiErr = new Error(NO_KEY_MESSAGE);
  }

  if (!candidates.length) {
    return { ok: false, message: aiErr instanceof Error ? aiErr.message : 'No suitable icons found.' };
  }

  const limited = candidates.slice(0, 5);
  if (limited.length === 1) {
    const applied = useOutlineStore.getState().applyIconChoice(nodeId, limited[0]);
    return applied ? { ok: true, message: 'Icon applied.' } : { ok: false, message: 'Node no longer exists.' };
  }
  return { ok: true, message: 'Choose an icon.', candidates: limited, nodeId };
}

/** Applies a picker choice (or re-applies a single auto-picked candidate) — a thin wrapper over
 * `outlineStore.ts`'s own `applyIconChoice`, kept here so every icon-apply call site goes through
 * this module rather than reaching into the store directly. */
export function applyIconChoice(nodeId: number, icon: string): AiActionResult {
  const applied = useOutlineStore.getState().applyIconChoice(nodeId, icon);
  return applied ? { ok: true, message: 'Icon applied.' } : { ok: false, message: 'Node no longer exists.' };
}

/** Selection-only entry point — matches legacy's real `suggestIconForSelection`
 * (index.html:29304-29308) exactly: used by both the toolbar button and the context-menu
 * "Suggest icon" item. A deliberate multi-selection (`selectedIds.length > 1`) scopes to those
 * nodes and always auto-applies; otherwise it's just the current node via the picker-capable
 * single-node path. */
export async function suggestIconForSelection(selectedIds: number[]): Promise<IconChoiceOutcome> {
  if (selectedIds.length > 1) return suggestIconsForNodeIds(selectedIds);
  if (selectedIds.length === 1) return suggestIconChoiceForNode(selectedIds[0]);
  return { ok: false, message: 'Select a node first.' };
}

/** Explicit whole-document action — matches legacy's real `suggestIconsForAllNodes`
 * (index.html:29312-29315). Always auto-applies via the batch path (never a picker), same as
 * legacy — a picker per node across a whole document would mean dismissing one for every node. */
export function suggestIconsForAllDocumentNodes(): Promise<AiActionResult> {
  const allIds = useOutlineStore.getState().nodes.map((n) => n.id);
  if (!allIds.length) return Promise.resolve({ ok: false, message: 'No nodes to suggest icons for.' });
  return suggestIconsForNodeIds(allIds);
}
