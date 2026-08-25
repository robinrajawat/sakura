/**
 * AI provider catalog — the fixed list of seven built-in providers and their curated models.
 *
 * §6.9 slice (docs/phase6-full-parity-plan.md): direct port of legacy's real
 * `AI_BUILTIN_PROVIDERS`/`AI_CURATED_MODELS`/`getAllAiProviders`/`getAiProviderById`/
 * `defaultModelForProvider` (legacy/index.html:8859-8994). Those stay hand-written ambient
 * globals in legacy (trivial one-line lookups over a top-level `const`, per `aiProviders.ts`'s
 * own header) — `web/` has no equivalent ambient script scope for them to live in unextracted,
 * so this module gives them a real, explicit home instead.
 *
 * Deliberately a closed, hardcoded list, matching legacy exactly — not a gap. The comment
 * directly above legacy's own `AI_BUILTIN_PROVIDERS` (index.html:8850-8858) is explicit: custom/
 * self-hosted providers (Ollama, LM Studio, arbitrary endpoints) were a real feature, removed on
 * purpose, because a fixed provider list is what lets the CSP `connect-src` allowlist mean
 * anything. `AI_CUSTOM_PROVIDERS_KEY` in legacy is dead storage kept only so old browsers with
 * stale data under that key don't crash on read — never consulted for provider construction, and
 * there is no "add custom provider" UI anywhere in legacy's real DOM (confirmed by grep). Do not
 * build one here either.
 *
 * `shape` drives which request/response format `aiCall.ts`'s `callAiByShape` builds — four
 * distinct shapes across the seven providers (`gemini`, `openai` — shared by groq/openai/
 * seed_openrouter/seed_github_models — `cerebras`, `anthropic`).
 */

export type AiProviderShape = 'gemini' | 'openai' | 'anthropic' | 'cerebras';

export interface AiProviderDef {
  id: string;
  label: string;
  shape: AiProviderShape;
  baseUrl: string;
  /** Short "where to get a key" hint shown next to the API key field in Settings — matches
   * legacy's real per-provider `#ai-key-hint` text (index.html's AI settings section) exactly,
   * including the GitHub Models vendor-prefix note. */
  keyHint: string;
}

export const AI_BUILTIN_PROVIDERS: AiProviderDef[] = [
  {
    id: 'gemini',
    label: 'Gemini (free)',
    shape: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    keyHint: 'Get a free key at aistudio.google.com'
  },
  {
    id: 'groq',
    label: 'Groq (free, fast)',
    shape: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    keyHint: 'Get a free key at console.groq.com'
  },
  {
    id: 'claude',
    label: 'Claude API',
    shape: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    keyHint: 'Get a key at console.anthropic.com'
  },
  {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    shape: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    keyHint: 'Get a key at platform.openai.com'
  },
  {
    id: 'seed_openrouter',
    label: 'OpenRouter (free models)',
    shape: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    keyHint: 'Get a free key at openrouter.ai'
  },
  {
    id: 'seed_cerebras',
    label: 'Cerebras (free tier)',
    shape: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1/chat/completions',
    keyHint: 'Get a free key at cloud.cerebras.ai'
  },
  {
    id: 'seed_github_models',
    label: 'GitHub Models (free, your GitHub account)',
    shape: 'openai',
    baseUrl: 'https://models.github.ai/inference/chat/completions',
    keyHint: 'Get a token at github.com/settings/tokens — model ids need a vendor prefix, e.g. openai/gpt-4o-mini'
  }
];

export interface AiCuratedModel {
  v: string;
  l: string;
}

/** Matches legacy's real `AI_CURATED_MODELS` (index.html:8986-8994) exactly. The first entry
 * per provider is that provider's default model (see `defaultModelForProvider` below). */
export const AI_CURATED_MODELS: Record<string, AiCuratedModel[]> = {
  gemini: [
    { v: 'gemini-3.5-flash', l: 'Gemini 3.5 Flash (recommended)' },
    { v: 'gemini-2.5-flash-lite', l: 'Gemini 2.5 Flash Lite (fastest)' },
    { v: 'gemini-3.1-flash-lite', l: 'Gemini 3.1 Flash Lite' }
  ],
  groq: [
    { v: 'openai/gpt-oss-20b', l: 'GPT-OSS 20B (fastest)' },
    { v: 'openai/gpt-oss-120b', l: 'GPT-OSS 120B (quality)' }
  ],
  claude: [
    { v: 'claude-haiku-4-5-20251001', l: 'Claude Haiku (fast)' },
    { v: 'claude-sonnet-4-6', l: 'Claude Sonnet (quality)' }
  ],
  openai: [
    { v: 'gpt-5.4-mini', l: 'GPT-5.4 mini (fast)' },
    { v: 'gpt-5.5', l: 'GPT-5.5 (quality)' }
  ],
  seed_openrouter: [
    { v: 'openai/gpt-oss-20b:free', l: 'GPT-OSS 20B (fast)' },
    { v: 'openai/gpt-oss-120b:free', l: 'GPT-OSS 120B' },
    { v: 'nvidia/nemotron-3-super-120b-a12b:free', l: 'Nemotron 120B' },
    { v: 'openrouter/free', l: 'Auto (free router, slower)' }
  ],
  seed_cerebras: [{ v: 'gpt-oss-120b', l: 'GPT-OSS 120B' }],
  seed_github_models: [
    { v: 'openai/gpt-4o-mini', l: 'GPT-4o mini (fast)' },
    { v: 'openai/gpt-4.1-mini', l: 'GPT-4.1 mini' },
    { v: 'openai/gpt-4o', l: 'GPT-4o' },
    { v: 'openai/gpt-4.1', l: 'GPT-4.1' }
  ]
};

export function getAllAiProviders(): AiProviderDef[] {
  return AI_BUILTIN_PROVIDERS;
}

export function getAiProviderById(id: string): AiProviderDef {
  return AI_BUILTIN_PROVIDERS.find((p) => p.id === id) || AI_BUILTIN_PROVIDERS[0];
}

/** Matches legacy's real `defaultModelForProvider` — the first curated model for that provider,
 * falling back to an empty string for an unknown provider id (there is always at least one
 * curated model per built-in provider, so this only matters defensively). */
export function defaultModelForProvider(providerId: string): string {
  return AI_CURATED_MODELS[providerId]?.[0]?.v ?? '';
}

/** The extra per-provider headers `aiCall.ts`'s `callAiByShape` needs beyond its shape's own
 * auth header — real for exactly the two providers that need them (OpenRouter, GitHub Models),
 * both sharing the plain `openai` shape with every other OpenAI-compatible provider so this can't
 * be inferred from `shape` alone. `undefined` (not `{}`) for every provider that needs nothing
 * extra, so callers can spread it straight into a headers object without a null check. */
export function extraHeadersForProvider(providerId: string): Record<string, string> | undefined {
  if (providerId === 'seed_openrouter') {
    return { 'HTTP-Referer': typeof location !== 'undefined' ? location.origin : '', 'X-Title': 'Sakura' };
  }
  if (providerId === 'seed_github_models') {
    return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }
  return undefined;
}
