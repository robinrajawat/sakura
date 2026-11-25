import { describe, it, expect } from 'vitest';
import { noteUsed, lastUsed, forgetUsed, lastUsedKey } from '../src/lastUsed';

function kv() {
  const store = new Map<string, { v: string; ttl?: number }>();
  let writes = 0;
  return {
    store, get writes() { return writes; },
    async get(k: string) { return store.get(k)?.v ?? null; },
    async put(k: string, v: string, o?: { expirationTtl?: number }) { writes++; store.set(k, { v, ttl: o?.expirationTtl }); },
    async delete(k: string) { store.delete(k); }
  };
}

describe('last used', () => {
  it('records a use at most once an hour per connection, expiring after 31 days', async () => {
    const k = kv();
    await noteUsed(k, 'u', 'claude', 1_000_000);
    await noteUsed(k, 'u', 'claude', 1_000_000 + 30 * 60_000);
    expect(k.writes).toBe(1);
    expect(k.store.get(lastUsedKey('u', 'claude'))?.ttl).toBe(31 * 24 * 3600);
    await noteUsed(k, 'u', 'claude', 1_000_000 + 61 * 60_000);
    expect(k.writes).toBe(2);
    await noteUsed(k, 'u', 'other', 1_000_000);
    expect(k.writes).toBe(3);
    expect(await lastUsed(k, 'u', 'claude')).toBe(1_000_000 + 61 * 60_000);
  });
  it('none yet reads as null; disconnecting forgets it', async () => {
    const k = kv();
    expect(await lastUsed(k, 'u2', 'c')).toBeNull();
    await noteUsed(k, 'u2', 'c', 5);
    await forgetUsed(k, 'u2', 'c');
    expect(await lastUsed(k, 'u2', 'c')).toBeNull();
  });
});
