/**
 * Storage for the admin-configured provider fallback chain (docs/ai-hosted-vault-design.md).
 * Each provider's API key is encrypted at rest via vault.ts before it ever reaches KV; nothing
 * in this module ever handles or returns a plaintext key except saveProvider's own input and
 * getProviderKey's own (deliberately narrow) output.
 */

import { encryptWithKek, decryptWithKek } from './vault';

export interface ProviderConfig {
  id: string;
  baseUrl: string;
  /** Request/response shape adapter to use — matches legacy/index.html's AI_BUILTIN_PROVIDERS
   * convention ('openai' | 'gemini' | 'anthropic' | 'cerebras'), kept as a plain string here
   * since the adapters themselves are a separate, later slice. */
  shape: string;
  model: string;
  /** Fallback order — lower tries first. */
  order: number;
}

export interface StoredProviderConfig extends ProviderConfig {
  encryptedApiKey: string;
}

/** Minimal subset of Cloudflare's KVNamespace this module needs — real KVNamespace satisfies
 * this structurally, and a plain in-memory object satisfies it in tests. */
export interface ProvidersKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: { name: string }[] }>;
}

const PROVIDER_KEY_PREFIX = 'provider:';

function providerKey(id: string): string {
  return PROVIDER_KEY_PREFIX + id;
}

export async function saveProvider(
  kv: ProvidersKV,
  kek: CryptoKey,
  config: ProviderConfig,
  apiKey: string
): Promise<void> {
  const encryptedApiKey = await encryptWithKek(apiKey, kek);
  const stored: StoredProviderConfig = { ...config, encryptedApiKey };
  await kv.put(providerKey(config.id), JSON.stringify(stored));
}

/** Every configured provider, in fallback order. Skips (rather than throws on) a corrupt
 * entry — one bad record shouldn't take the whole chain down. */
export async function listProviders(kv: ProvidersKV): Promise<StoredProviderConfig[]> {
  const { keys } = await kv.list({ prefix: PROVIDER_KEY_PREFIX });
  const configs: StoredProviderConfig[] = [];
  for (const k of keys) {
    const raw = await kv.get(k.name);
    if (!raw) continue;
    try {
      configs.push(JSON.parse(raw) as StoredProviderConfig);
    } catch {
      continue;
    }
  }
  return configs.sort((a, b) => a.order - b.order);
}

export async function deleteProvider(kv: ProvidersKV, id: string): Promise<void> {
  await kv.delete(providerKey(id));
}

/** Decrypts one provider's API key — the one place a plaintext key exists outside
 * saveProvider's own input, and only for the duration of the caller's own use of it
 * (the eventual /ai/complete handler, forwarding a request to that provider). */
export async function getProviderKey(kek: CryptoKey, stored: StoredProviderConfig): Promise<string> {
  return decryptWithKek(stored.encryptedApiKey, kek);
}
