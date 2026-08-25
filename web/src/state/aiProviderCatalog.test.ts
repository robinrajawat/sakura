import { describe, it, expect } from 'vitest';
import { AI_BUILTIN_PROVIDERS, AI_CURATED_MODELS, getAllAiProviders, getAiProviderById, defaultModelForProvider, extraHeadersForProvider } from './aiProviderCatalog';

describe('AI provider catalog', () => {
  it('has exactly the seven built-in providers, matching legacy exactly', () => {
    expect(AI_BUILTIN_PROVIDERS.map((p) => p.id)).toEqual(['gemini', 'groq', 'claude', 'openai', 'seed_openrouter', 'seed_cerebras', 'seed_github_models']);
  });

  it('every provider has a non-empty curated model list', () => {
    for (const p of AI_BUILTIN_PROVIDERS) {
      expect(AI_CURATED_MODELS[p.id]?.length).toBeGreaterThan(0);
    }
  });

  it('getAllAiProviders returns the full built-in list', () => {
    expect(getAllAiProviders()).toBe(AI_BUILTIN_PROVIDERS);
  });

  it('getAiProviderById finds an existing provider', () => {
    expect(getAiProviderById('claude').label).toBe('Claude API');
  });

  it('getAiProviderById falls back to the first provider (gemini) for an unknown id, matching legacy', () => {
    expect(getAiProviderById('nonexistent').id).toBe('gemini');
  });

  it('defaultModelForProvider returns the first curated model for a known provider', () => {
    expect(defaultModelForProvider('gemini')).toBe('gemini-3.5-flash');
    expect(defaultModelForProvider('seed_cerebras')).toBe('gpt-oss-120b');
  });

  it('defaultModelForProvider returns "" for an unknown provider', () => {
    expect(defaultModelForProvider('nonexistent')).toBe('');
  });

  it('shapes are one of the four real request/response formats', () => {
    const shapes = new Set(AI_BUILTIN_PROVIDERS.map((p) => p.shape));
    for (const s of shapes) {
      expect(['gemini', 'openai', 'anthropic', 'cerebras']).toContain(s);
    }
    expect(AI_BUILTIN_PROVIDERS.filter((p) => p.shape === 'openai').map((p) => p.id)).toEqual(['groq', 'openai', 'seed_openrouter', 'seed_github_models']);
  });
});

describe('extraHeadersForProvider', () => {
  it('is undefined for every provider needing no extra headers', () => {
    for (const id of ['gemini', 'groq', 'claude', 'openai', 'seed_cerebras']) {
      expect(extraHeadersForProvider(id)).toBeUndefined();
    }
  });

  it('adds HTTP-Referer/X-Title for OpenRouter', () => {
    const headers = extraHeadersForProvider('seed_openrouter');
    expect(headers?.['X-Title']).toBe('Sakura');
    expect(headers).toHaveProperty('HTTP-Referer');
  });

  it('adds Accept/X-GitHub-Api-Version for GitHub Models', () => {
    expect(extraHeadersForProvider('seed_github_models')).toEqual({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    });
  });
});
