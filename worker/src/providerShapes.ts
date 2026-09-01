/**
 * Per-provider request/response shape adapters — mirrors legacy/index.html's own
 * callAiByShape (~line 28313) exactly, since that logic is already proven against real
 * provider APIs. Kept as pure functions (no fetch here) so they're fully testable without
 * network access; the actual HTTP call is the /ai/complete handler's own job (a later slice),
 * same core-vs-orchestration split as every other module in this Worker.
 *
 * One deliberate adaptation from the client-side version: the OpenRouter HTTP-Referer header
 * uses location.href/location.protocol there, which doesn't exist server-side — this uses a
 * fixed https://sakura-notes.com instead.
 */

export type AiShape = 'gemini' | 'openai' | 'cerebras' | 'anthropic';

export interface AiRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export function buildAiRequest(
  shape: AiShape,
  baseUrl: string,
  key: string,
  model: string,
  systemPrompt: string,
  userContent: string,
  maxTokens: number
): AiRequest {
  if (shape === 'gemini') {
    const url =
      baseUrl.replace('{model}', encodeURIComponent(model)) +
      (baseUrl.includes('?') ? '&' : '?') +
      'key=' +
      encodeURIComponent(key);
    return {
      url,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: (systemPrompt ? systemPrompt + '\n\n' : '') + userContent }] }],
        generationConfig: { maxOutputTokens: maxTokens }
      })
    };
  }

  if (shape === 'openai') {
    const isOpenRouter = baseUrl.includes('openrouter.ai');
    const isGitHubModels = baseUrl.includes('models.github.ai');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + key
    };
    if (isOpenRouter) {
      headers['HTTP-Referer'] = 'https://sakura-notes.com';
      headers['X-Title'] = 'Sakura';
    }
    if (isGitHubModels) {
      headers['Accept'] = 'application/vnd.github+json';
      headers['X-GitHub-Api-Version'] = '2022-11-28';
    }
    return {
      url: baseUrl,
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt || '' },
          { role: 'user', content: userContent }
        ]
      })
    };
  }

  if (shape === 'cerebras') {
    return {
      url: baseUrl,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt || '' },
          { role: 'user', content: userContent }
        ]
      })
    };
  }

  // anthropic
  return {
    url: baseUrl,
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: (systemPrompt ? systemPrompt + '\n\n' : '') + userContent }]
    })
  };
}

/** Extracts the completion text from a successful (2xx) response body. */
export function parseAiResponse(shape: AiShape, data: unknown): string {
  const d = data as Record<string, unknown> | null | undefined;
  if (shape === 'gemini') {
    const candidates = d?.candidates as Array<Record<string, unknown>> | undefined;
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined;
    const parts = content?.parts as Array<Record<string, unknown>> | undefined;
    return String(parts?.[0]?.text ?? '').trim();
  }
  if (shape === 'anthropic') {
    const content = d?.content as Array<Record<string, unknown>> | undefined;
    return String(content?.[0]?.text ?? '').trim();
  }
  // openai and cerebras share the same choices[0].message.content shape
  const choices = d?.choices as Array<Record<string, unknown>> | undefined;
  const message = choices?.[0]?.message as Record<string, unknown> | undefined;
  return String(message?.content ?? '').trim();
}

/** Extracts a human-readable error message from a non-2xx response body. */
export function parseAiErrorMessage(shape: AiShape, status: number, data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  const err = d.error as Record<string, unknown> | undefined;
  if (shape === 'gemini') return String(err?.message ?? 'Gemini error ' + status);
  if (shape === 'anthropic') return String(err?.message ?? 'Claude API error ' + status);
  if (shape === 'cerebras') return String(d.message ?? err?.message ?? 'Cerebras error ' + status);
  const metadata = err?.metadata as Record<string, unknown> | undefined;
  return String(metadata?.raw ?? err?.message ?? d.message ?? 'API error ' + status);
}
