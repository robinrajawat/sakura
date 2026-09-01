import { describe, it, expect, beforeAll } from 'vitest';
import { saveProvider, listProviders, deleteProvider, getProviderKey, type ProvidersKV } from '../src/providers';
import { importKek, b64FromBytes } from '../src/vault';

function fakeKv(): ProvidersKV & { store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    store,
    async get(key) {
      return key in store ? store[key] : null;
    },
    async put(key, value) {
      store[key] = value;
    },
    async delete(key) {
      delete store[key];
    },
    async list(options) {
      const prefix = options?.prefix ?? '';
      return { keys: Object.keys(store).filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
    }
  };
}

let kek: CryptoKey;

beforeAll(async () => {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  kek = await importKek(b64FromBytes(raw));
});

describe('saveProvider / listProviders / getProviderKey / deleteProvider', () => {
  it('stores a provider with its key encrypted, never in plaintext', async () => {
    const kv = fakeKv();
    await saveProvider(kv, kek, { id: 'groq', baseUrl: 'https://api.groq.com/x', shape: 'openai', model: 'llama-3.3', order: 0 }, 'sk-groq-secret');
    const raw = kv.store['provider:groq'];
    expect(raw).toBeDefined();
    expect(raw).not.toContain('sk-groq-secret');
  });

  it('round-trips the plaintext key through getProviderKey', async () => {
    const kv = fakeKv();
    await saveProvider(kv, kek, { id: 'groq', baseUrl: 'https://api.groq.com/x', shape: 'openai', model: 'llama-3.3', order: 0 }, 'sk-groq-secret');
    const [stored] = await listProviders(kv);
    expect(await getProviderKey(kek, stored)).toBe('sk-groq-secret');
  });

  it('lists providers in ascending order regardless of insertion order', async () => {
    const kv = fakeKv();
    await saveProvider(kv, kek, { id: 'cerebras', baseUrl: 'https://api.cerebras.ai/x', shape: 'cerebras', model: 'm2', order: 1 }, 'key-b');
    await saveProvider(kv, kek, { id: 'groq', baseUrl: 'https://api.groq.com/x', shape: 'openai', model: 'm1', order: 0 }, 'key-a');
    const list = await listProviders(kv);
    expect(list.map((p) => p.id)).toEqual(['groq', 'cerebras']);
  });

  it('saveProvider overwrites an existing provider with the same id', async () => {
    const kv = fakeKv();
    await saveProvider(kv, kek, { id: 'groq', baseUrl: 'https://old', shape: 'openai', model: 'old-model', order: 0 }, 'old-key');
    await saveProvider(kv, kek, { id: 'groq', baseUrl: 'https://new', shape: 'openai', model: 'new-model', order: 0 }, 'new-key');
    const list = await listProviders(kv);
    expect(list).toHaveLength(1);
    expect(list[0].baseUrl).toBe('https://new');
    expect(await getProviderKey(kek, list[0])).toBe('new-key');
  });

  it('deleteProvider removes it from the list', async () => {
    const kv = fakeKv();
    await saveProvider(kv, kek, { id: 'groq', baseUrl: 'https://api.groq.com/x', shape: 'openai', model: 'm', order: 0 }, 'key-a');
    await deleteProvider(kv, 'groq');
    expect(await listProviders(kv)).toEqual([]);
  });

  it('listProviders skips a corrupt entry rather than throwing', async () => {
    const kv = fakeKv();
    await saveProvider(kv, kek, { id: 'groq', baseUrl: 'https://api.groq.com/x', shape: 'openai', model: 'm', order: 0 }, 'key-a');
    kv.store['provider:broken'] = 'not valid json{{{';
    const list = await listProviders(kv);
    expect(list.map((p) => p.id)).toEqual(['groq']);
  });

  it('empty store returns an empty list', async () => {
    const kv = fakeKv();
    expect(await listProviders(kv)).toEqual([]);
  });
});
