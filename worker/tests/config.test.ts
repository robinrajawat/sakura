import { describe, it, expect } from 'vitest';
import { getDailyQuota, setDailyQuota, type ConfigKV } from '../src/config';

function fakeKv(initial: Record<string, string> = {}): ConfigKV & { store: Record<string, string> } {
  const store = { ...initial };
  return {
    store,
    async get(key: string) {
      return key in store ? store[key] : null;
    },
    async put(key: string, value: string) {
      store[key] = value;
    }
  };
}

describe('getDailyQuota', () => {
  it('returns the fallback when nothing is set in KV', async () => {
    expect(await getDailyQuota(fakeKv(), 20)).toBe(20);
  });

  it('returns the KV-stored value when set', async () => {
    const kv = fakeKv({ 'config:dailyAiQuota': '50' });
    expect(await getDailyQuota(kv, 20)).toBe(50);
  });

  it('falls back on a non-numeric stored value', async () => {
    const kv = fakeKv({ 'config:dailyAiQuota': 'not-a-number' });
    expect(await getDailyQuota(kv, 20)).toBe(20);
  });

  it('falls back on a zero or negative stored value', async () => {
    expect(await getDailyQuota(fakeKv({ 'config:dailyAiQuota': '0' }), 20)).toBe(20);
    expect(await getDailyQuota(fakeKv({ 'config:dailyAiQuota': '-5' }), 20)).toBe(20);
  });
});

describe('setDailyQuota', () => {
  it('round-trips through getDailyQuota', async () => {
    const kv = fakeKv();
    await setDailyQuota(kv, 75);
    expect(await getDailyQuota(kv, 20)).toBe(75);
  });

  it('overwrites a previously set value', async () => {
    const kv = fakeKv();
    await setDailyQuota(kv, 10);
    await setDailyQuota(kv, 30);
    expect(await getDailyQuota(kv, 20)).toBe(30);
  });
});
