import { describe, it, expect, vi } from 'vitest';
import { callAiByShape, isRateLimitStatus, RateLimitError, FallbackableError } from './aiCall';

function jsonResponse(status: number, body: unknown, statusText = ''): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body)
  } as unknown as Response;
}

describe('isRateLimitStatus (pure)', () => {
  it('treats 429 as a rate limit regardless of message', () => {
    expect(isRateLimitStatus(429, '')).toBe(true);
  });
  it.each(['Rate limit exceeded', 'Quota exceeded', 'Too Many Requests', 'Resource exhausted', 'rate_limit_error'])(
    'treats %s as a rate limit by message even on a non-429 status',
    (msg) => {
      expect(isRateLimitStatus(500, msg)).toBe(true);
    }
  );
  it('is false for an unrelated error on a non-429 status', () => {
    expect(isRateLimitStatus(500, 'internal server error')).toBe(false);
  });
});

describe('callAiByShape — gemini', () => {
  it('builds the URL with {model} substituted and key= appended, sends generationConfig.maxOutputTokens, parses candidates[0].content.parts[0].text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { candidates: [{ content: { parts: [{ text: '  Hello there  ' }] } }] })
    );
    const result = await callAiByShape({
      shape: 'gemini',
      baseUrl: 'https://example.com/models/{model}:generateContent',
      apiKey: 'sekret',
      model: 'gemini-3.5-flash',
      systemPrompt: 'Be terse.',
      userContent: 'hi',
      maxTokens: 100,
      fetchImpl
    });
    expect(result).toBe('Hello there');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.com/models/gemini-3.5-flash:generateContent?key=sekret');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.contents[0].parts[0].text).toBe('Be terse.\n\nhi');
    expect(body.generationConfig.maxOutputTokens).toBe(100);
  });

  it('omits the system-prompt prefix entirely when systemPrompt is empty', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'x' }] } }] }));
    await callAiByShape({ shape: 'gemini', baseUrl: 'https://example.com/{model}', apiKey: 'k', model: 'm', systemPrompt: '', userContent: 'hi', maxTokens: 10, fetchImpl });
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.contents[0].parts[0].text).toBe('hi');
  });

  it('appends key= with & when baseUrl already has a query string', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { candidates: [{ content: { parts: [{ text: 'x' }] } }] }));
    await callAiByShape({ shape: 'gemini', baseUrl: 'https://example.com/{model}?alt=json', apiKey: 'k', model: 'm', systemPrompt: '', userContent: 'hi', maxTokens: 10, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://example.com/m?alt=json&key=k');
  });

  it('returns an empty string when the response has no candidates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    const result = await callAiByShape({ shape: 'gemini', baseUrl: 'https://example.com/{model}', apiKey: 'k', model: 'm', systemPrompt: '', userContent: 'hi', maxTokens: 10, fetchImpl });
    expect(result).toBe('');
  });
});

describe('callAiByShape — openai (shared by groq/openai/openrouter/github models)', () => {
  it('sends Authorization: Bearer, system+user messages, max_tokens, and parses choices[0].message.content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: ' hi ' } }] }));
    const result = await callAiByShape({
      shape: 'openai',
      baseUrl: 'https://api.example.com/v1/chat/completions',
      apiKey: 'sk-123',
      model: 'gpt-x',
      systemPrompt: 'sys',
      userContent: 'usr',
      maxTokens: 50,
      fetchImpl
    });
    expect(result).toBe('hi');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe('Bearer sk-123');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('gpt-x');
    expect(body.max_tokens).toBe(50);
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' }
    ]);
  });

  it('merges provider-specific extraHeaders (e.g. OpenRouter/GitHub Models) alongside Authorization', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }));
    await callAiByShape({
      shape: 'openai',
      baseUrl: 'https://api.example.com',
      apiKey: 'k',
      model: 'm',
      systemPrompt: '',
      userContent: 'u',
      maxTokens: 10,
      extraHeaders: { 'X-Title': 'Sakura' },
      fetchImpl
    });
    const headers = (fetchImpl.mock.calls[0][1] as RequestInit & { headers: Record<string, string> }).headers;
    expect(headers['X-Title']).toBe('Sakura');
    expect(headers.Authorization).toBe('Bearer k');
  });
});

describe('callAiByShape — cerebras (openai-shaped, max_completion_tokens)', () => {
  it('uses max_completion_tokens instead of max_tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }));
    await callAiByShape({ shape: 'cerebras', baseUrl: 'https://api.cerebras.ai/v1/chat/completions', apiKey: 'k', model: 'm', systemPrompt: '', userContent: 'u', maxTokens: 33, fetchImpl });
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_completion_tokens).toBe(33);
    expect(body.max_tokens).toBeUndefined();
  });
});

describe('callAiByShape — anthropic', () => {
  it('sends x-api-key + anthropic-version, concatenates systemPrompt into the single user message, parses content[0].text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { content: [{ text: ' answer ' }] }));
    const result = await callAiByShape({
      shape: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1/messages',
      apiKey: 'ak',
      model: 'claude-x',
      systemPrompt: 'You are terse.',
      userContent: 'hi',
      maxTokens: 200,
      fetchImpl
    });
    expect(result).toBe('answer');
    const [, init] = fetchImpl.mock.calls[0];
    const headers = (init as RequestInit & { headers: Record<string, string> }).headers;
    expect(headers['x-api-key']).toBe('ak');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.max_tokens).toBe(200);
    expect(body.messages).toEqual([{ role: 'user', content: 'You are terse.\n\nhi' }]);
  });
});

describe('callAiByShape — error classification', () => {
  it('throws a plain Error (not Rate-limit/Fallbackable) on 401', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(401, { error: { message: 'Invalid API key' } }));
    await expect(
      callAiByShape({ shape: 'openai', baseUrl: 'https://x', apiKey: 'bad', model: 'm', systemPrompt: '', userContent: 'u', maxTokens: 10, fetchImpl })
    ).rejects.toThrow('Invalid API key');
    try {
      await callAiByShape({ shape: 'openai', baseUrl: 'https://x', apiKey: 'bad', model: 'm', systemPrompt: '', userContent: 'u', maxTokens: 10, fetchImpl });
    } catch (e) {
      expect(e).not.toBeInstanceOf(RateLimitError);
      expect(e).not.toBeInstanceOf(FallbackableError);
    }
  });

  it('throws RateLimitError on 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(429, { error: { message: 'slow down' } }));
    await expect(
      callAiByShape({ shape: 'openai', baseUrl: 'https://x', apiKey: 'k', model: 'm', systemPrompt: '', userContent: 'u', maxTokens: 10, fetchImpl })
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('throws FallbackableError carrying the status on a generic 500', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, { error: { message: 'server exploded' } }, 'Internal Server Error'));
    await expect(
      callAiByShape({ shape: 'openai', baseUrl: 'https://x', apiKey: 'k', model: 'm', systemPrompt: '', userContent: 'u', maxTokens: 10, fetchImpl })
    ).rejects.toMatchObject({ message: 'server exploded', status: 500 });
  });

  it('falls back to statusText when the error body is not JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: () => Promise.reject(new Error('not json'))
    } as unknown as Response);
    await expect(
      callAiByShape({ shape: 'openai', baseUrl: 'https://x', apiKey: 'k', model: 'm', systemPrompt: '', userContent: 'u', maxTokens: 10, fetchImpl })
    ).rejects.toMatchObject({ message: 'Service Unavailable' });
  });
});
