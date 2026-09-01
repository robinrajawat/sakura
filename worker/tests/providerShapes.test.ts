import { describe, it, expect } from 'vitest';
import { buildAiRequest, parseAiResponse, parseAiErrorMessage } from '../src/providerShapes';

describe('buildAiRequest', () => {
  describe('gemini', () => {
    it('puts the model in the URL path and the key in the query string, not headers', () => {
      const req = buildAiRequest(
        'gemini',
        'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
        'my-key',
        'gemini-2.0-flash',
        'sys',
        'hello',
        512
      );
      expect(req.url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=my-key'
      );
      expect(req.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(req.headers.Authorization).toBeUndefined();
    });

    it('prepends the system prompt to the user content in one text part', () => {
      const req = buildAiRequest('gemini', 'https://x/{model}', 'k', 'm', 'SYS', 'USER', 100);
      const body = JSON.parse(req.body);
      expect(body.contents[0].parts[0].text).toBe('SYS\n\nUSER');
      expect(body.generationConfig.maxOutputTokens).toBe(100);
    });

    it('omits the system-prompt prefix entirely when there is no system prompt', () => {
      const req = buildAiRequest('gemini', 'https://x/{model}', 'k', 'm', '', 'USER', 100);
      const body = JSON.parse(req.body);
      expect(body.contents[0].parts[0].text).toBe('USER');
    });

    it('appends the key with & when the base URL already has a query string', () => {
      const req = buildAiRequest('gemini', 'https://x/{model}?alt=sse', 'k', 'm', '', 'u', 10);
      expect(req.url).toBe('https://x/m?alt=sse&key=k');
    });
  });

  describe('openai shape', () => {
    it('sends a Bearer token and system+user messages', () => {
      const req = buildAiRequest('openai', 'https://api.groq.com/openai/v1/chat/completions', 'sk-1', 'llama', 'SYS', 'USER', 256);
      expect(req.headers.Authorization).toBe('Bearer sk-1');
      const body = JSON.parse(req.body);
      expect(body.model).toBe('llama');
      expect(body.max_tokens).toBe(256);
      expect(body.messages).toEqual([
        { role: 'system', content: 'SYS' },
        { role: 'user', content: 'USER' }
      ]);
    });

    it('adds OpenRouter-specific headers only for an openrouter.ai base URL', () => {
      const req = buildAiRequest('openai', 'https://openrouter.ai/api/v1/chat/completions', 'k', 'm', '', 'u', 10);
      expect(req.headers['HTTP-Referer']).toBe('https://sakura-notes.com');
      expect(req.headers['X-Title']).toBe('Sakura');
    });

    it('adds GitHub Models-specific headers only for a models.github.ai base URL', () => {
      const req = buildAiRequest('openai', 'https://models.github.ai/inference/chat/completions', 'k', 'm', '', 'u', 10);
      expect(req.headers['Accept']).toBe('application/vnd.github+json');
      expect(req.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
    });

    it('adds neither special header set for a plain OpenAI-compatible endpoint', () => {
      const req = buildAiRequest('openai', 'https://api.groq.com/openai/v1/chat/completions', 'k', 'm', '', 'u', 10);
      expect(req.headers['HTTP-Referer']).toBeUndefined();
      expect(req.headers['Accept']).toBeUndefined();
    });
  });

  describe('cerebras', () => {
    it('uses max_completion_tokens, not max_tokens', () => {
      const req = buildAiRequest('cerebras', 'https://api.cerebras.ai/v1/chat/completions', 'k', 'm', 'SYS', 'USER', 300);
      const body = JSON.parse(req.body);
      expect(body.max_completion_tokens).toBe(300);
      expect(body.max_tokens).toBeUndefined();
      expect(req.headers.Authorization).toBe('Bearer k');
    });
  });

  describe('anthropic', () => {
    it('uses x-api-key and anthropic-version headers, not Authorization', () => {
      const req = buildAiRequest('anthropic', 'https://api.anthropic.com/v1/messages', 'k', 'm', 'SYS', 'USER', 400);
      expect(req.headers['x-api-key']).toBe('k');
      expect(req.headers['anthropic-version']).toBe('2023-06-01');
      expect(req.headers.Authorization).toBeUndefined();
    });

    it('prepends the system prompt into the single user message (no separate system role)', () => {
      const req = buildAiRequest('anthropic', 'https://api.anthropic.com/v1/messages', 'k', 'm', 'SYS', 'USER', 10);
      const body = JSON.parse(req.body);
      expect(body.messages).toEqual([{ role: 'user', content: 'SYS\n\nUSER' }]);
    });
  });
});

describe('parseAiResponse', () => {
  it('gemini: reads candidates[0].content.parts[0].text', () => {
    const data = { candidates: [{ content: { parts: [{ text: '  hello  ' }] } }] };
    expect(parseAiResponse('gemini', data)).toBe('hello');
  });

  it('gemini: empty string when the shape is missing', () => {
    expect(parseAiResponse('gemini', {})).toBe('');
  });

  it('anthropic: reads content[0].text', () => {
    expect(parseAiResponse('anthropic', { content: [{ text: 'hi there' }] })).toBe('hi there');
  });

  it('openai: reads choices[0].message.content', () => {
    expect(parseAiResponse('openai', { choices: [{ message: { content: 'reply' } }] })).toBe('reply');
  });

  it('cerebras: same choices[0].message.content shape as openai', () => {
    expect(parseAiResponse('cerebras', { choices: [{ message: { content: 'reply2' } }] })).toBe('reply2');
  });
});

describe('parseAiErrorMessage', () => {
  it('gemini: reads error.message, falls back to a status-coded default', () => {
    expect(parseAiErrorMessage('gemini', 429, { error: { message: 'quota exceeded' } })).toBe('quota exceeded');
    expect(parseAiErrorMessage('gemini', 500, {})).toBe('Gemini error 500');
  });

  it('anthropic: reads error.message, falls back to a status-coded default', () => {
    expect(parseAiErrorMessage('anthropic', 401, { error: { message: 'bad key' } })).toBe('bad key');
    expect(parseAiErrorMessage('anthropic', 500, {})).toBe('Claude API error 500');
  });

  it('cerebras: reads top-level message before error.message', () => {
    expect(parseAiErrorMessage('cerebras', 400, { message: 'top-level' })).toBe('top-level');
    expect(parseAiErrorMessage('cerebras', 400, { error: { message: 'nested' } })).toBe('nested');
    expect(parseAiErrorMessage('cerebras', 500, {})).toBe('Cerebras error 500');
  });

  it('openai: prefers error.metadata.raw, then error.message, then top-level message', () => {
    expect(parseAiErrorMessage('openai', 400, { error: { metadata: { raw: 'raw detail' }, message: 'msg' } })).toBe(
      'raw detail'
    );
    expect(parseAiErrorMessage('openai', 400, { error: { message: 'msg' } })).toBe('msg');
    expect(parseAiErrorMessage('openai', 400, { message: 'top' })).toBe('top');
    expect(parseAiErrorMessage('openai', 500, {})).toBe('API error 500');
  });
});
