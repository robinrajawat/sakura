/**
 * The single "make a real HTTP call to an AI provider" primitive — everything else in §6.9
 * (docs/phase6-full-parity-plan.md) wraps this. Direct port of legacy's real `callAiByShape`
 * (legacy/index.html:28230-28266) plus its two error classes and rate-limit classifier
 * (`RateLimitError`/`FallbackableError`, index.html:8979-8980; `isRateLimitStatus`,
 * index.html:28194-28198).
 *
 * Four request/response "shapes" cover all seven built-in providers (`aiProviderCatalog.ts`):
 * `gemini` (its own REST shape, no `system` role — the system prompt is string-concatenated in
 * front of the user content), `openai` (the OpenAI chat-completions shape, shared by groq/
 * openai/seed_openrouter/seed_github_models), `cerebras` (OpenAI-shaped but
 * `max_completion_tokens` instead of `max_tokens`), and `anthropic` (Claude's Messages API —
 * also no real `system` parameter used; same concatenation trick as gemini, matching legacy's
 * real behavior exactly rather than "fixing" it to use Anthropic's actual `system` field).
 *
 * `fetchImpl` is DI'd (defaults to the ambient `fetch`) purely for testability — matches the
 * project's existing convention (e.g. `wrapLineCount.ts`'s injected `measureTextWidth`) rather
 * than a new pattern.
 *
 * Deliberately NOT built here, left for later §6.9 slices: `callAiByShapeWithFallback` (usage
 * recording + the provider fallback chain), `callAiApi`/`callAiApiWithPrompt`/`callAiApiOutline`/
 * `callAiApiRestructure`/`callAiRaw` (the per-capability thin wrappers each feature slice — the
 * one exception is `testAiKey`'s own logic, which this module's `callAiByShape` alone is
 * sufficient for since legacy's real `testAiKey` deliberately bypasses both the fallback wrapper
 * and the usage counter, calling `callAiByShape` directly).
 */

import type { AiProviderShape } from './aiProviderCatalog';

export class RateLimitError extends Error {}

export class FallbackableError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Pure: matches legacy's real `isRateLimitStatus` (index.html:28194-28198) exactly. */
export function isRateLimitStatus(status: number, msg: string): boolean {
  if (status === 429) return true;
  if (typeof msg === 'string') {
    const m = msg.toLowerCase();
    if (m.includes('rate limit') || m.includes('quota') || m.includes('too many requests') || m.includes('resource exhausted') || m.includes('rate_limit')) {
      return true;
    }
  }
  return false;
}

async function extractErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } | string; message?: string };
    if (typeof data?.error === 'string') return data.error;
    if (data?.error && typeof data.error === 'object' && typeof data.error.message === 'string') return data.error.message;
    if (typeof data?.message === 'string') return data.message;
  } catch {
    // Non-JSON error body — fall through to statusText below.
  }
  return res.statusText || `HTTP ${res.status}`;
}

/** Classifies a failed response into the same three outcomes legacy's real per-shape branches
 * all funnel into: a 401 throws a plain `Error` (hard fail, no fallback — a bad key isn't
 * something switching providers fixes), a rate-limit/quota response throws `RateLimitError`,
 * anything else throws `FallbackableError` carrying the HTTP status. */
async function throwForFailedResponse(res: Response): Promise<never> {
  const msg = await extractErrorMessage(res);
  if (res.status === 401) throw new Error(msg);
  if (isRateLimitStatus(res.status, msg)) throw new RateLimitError(msg);
  throw new FallbackableError(msg, res.status);
}

export interface CallAiByShapeParams {
  shape: AiProviderShape;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userContent: string;
  maxTokens: number;
  /** Provider-specific headers beyond the shape's own auth header — e.g. OpenRouter's
   * `HTTP-Referer`/`X-Title`, GitHub Models' `Accept`/`X-GitHub-Api-Version`. Both share the
   * `openai` shape but need different extra headers, so this stays a caller-supplied param
   * rather than something `callAiByShape` infers from `baseUrl` itself. */
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

/** Matches legacy's real `callAiByShape` exactly: builds the shape-specific request, sends it,
 * and returns the trimmed response text — or throws one of the three classified errors above. */
export async function callAiByShape(params: CallAiByShapeParams): Promise<string> {
  const { shape, baseUrl, apiKey, model, systemPrompt, userContent, maxTokens, extraHeaders, fetchImpl } = params;
  const doFetch = fetchImpl ?? fetch;

  if (shape === 'gemini') {
    const url = baseUrl.replace('{model}', encodeURIComponent(model)) + (baseUrl.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(apiKey);
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify({
        contents: [{ parts: [{ text: (systemPrompt ? systemPrompt + '\n\n' : '') + userContent }] }],
        generationConfig: { maxOutputTokens: maxTokens }
      })
    });
    if (!res.ok) await throwForFailedResponse(res);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return (data?.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
  }

  if (shape === 'anthropic') {
    const res = await doFetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        ...extraHeaders
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: (systemPrompt ? systemPrompt + '\n\n' : '') + userContent }]
      })
    });
    if (!res.ok) await throwForFailedResponse(res);
    const data = (await res.json()) as { content?: { text?: string }[] };
    return (data?.content?.[0]?.text || '').trim();
  }

  // 'openai' and 'cerebras' — same message shape, only the max-tokens field name differs.
  const maxTokensField = shape === 'cerebras' ? 'max_completion_tokens' : 'max_tokens';
  const res = await doFetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: JSON.stringify({
      model,
      [maxTokensField]: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt || '' },
        { role: 'user', content: userContent }
      ]
    })
  });
  if (!res.ok) await throwForFailedResponse(res);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data?.choices?.[0]?.message?.content || '').trim();
}
