import { describe, it, expect } from 'vitest';
import { quotaKeyFor, evaluateQuota, consumeQuota, type QuotaKV } from '../src/quota';

function fakeKv(initial: Record<string, string> = {}): QuotaKV & { store: Record<string, string> } {
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

describe('quotaKeyFor', () => {
  it('formats as quota:{uid}:{yyyy-mm-dd} in UTC', () => {
    const now = new Date('2026-09-01T23:59:59.999Z');
    expect(quotaKeyFor('user123', now)).toBe('quota:user123:2026-09-01');
  });

  it('different uids get different keys for the same day', () => {
    const now = new Date('2026-09-01T12:00:00Z');
    expect(quotaKeyFor('alice', now)).not.toBe(quotaKeyFor('bob', now));
  });

  it('different days get different keys for the same uid', () => {
    expect(quotaKeyFor('user123', new Date('2026-09-01T00:00:00Z'))).not.toBe(
      quotaKeyFor('user123', new Date('2026-09-02T00:00:00Z'))
    );
  });
});

describe('evaluateQuota (pure)', () => {
  it('allows a request under the limit', () => {
    expect(evaluateQuota(5, 20)).toEqual({ allowed: true, count: 6, remaining: 14 });
  });

  it('allows the exact request that reaches the limit', () => {
    expect(evaluateQuota(19, 20)).toEqual({ allowed: true, count: 20, remaining: 0 });
  });

  it('denies a request once the limit is already reached', () => {
    expect(evaluateQuota(20, 20)).toEqual({ allowed: false, count: 20, remaining: 0 });
  });

  it('denies a request over the limit', () => {
    expect(evaluateQuota(25, 20)).toEqual({ allowed: false, count: 25, remaining: 0 });
  });

  it('a limit of 0 denies immediately', () => {
    expect(evaluateQuota(0, 0)).toEqual({ allowed: false, count: 0, remaining: 0 });
  });
});

describe('consumeQuota (KV-touching)', () => {
  it('starts at 0 and allows the first request of the day', async () => {
    const kv = fakeKv();
    const result = await consumeQuota(kv, 'user123', 3, new Date('2026-09-01T00:00:00Z'));
    expect(result).toEqual({ allowed: true, count: 1, remaining: 2 });
    expect(kv.store['quota:user123:2026-09-01']).toBe('1');
  });

  it('increments across successive calls on the same day', async () => {
    const kv = fakeKv();
    const now = new Date('2026-09-01T00:00:00Z');
    await consumeQuota(kv, 'user123', 3, now);
    await consumeQuota(kv, 'user123', 3, now);
    const third = await consumeQuota(kv, 'user123', 3, now);
    expect(third).toEqual({ allowed: true, count: 3, remaining: 0 });
  });

  it('denies once the limit is reached and does not increment further', async () => {
    const kv = fakeKv({ 'quota:user123:2026-09-01': '3' });
    const now = new Date('2026-09-01T00:00:00Z');
    const result = await consumeQuota(kv, 'user123', 3, now);
    expect(result).toEqual({ allowed: false, count: 3, remaining: 0 });
    expect(kv.store['quota:user123:2026-09-01']).toBe('3'); // unchanged
  });

  it('sets an expirationTtl on every successful increment', async () => {
    let capturedTtl: number | undefined;
    const kv: QuotaKV = {
      async get() {
        return null;
      },
      async put(_key, _value, options) {
        capturedTtl = options?.expirationTtl;
      }
    };
    await consumeQuota(kv, 'user123', 5, new Date('2026-09-01T00:00:00Z'));
    expect(capturedTtl).toBe(172800);
  });

  it('a fresh day for the same uid gets its own independent count', async () => {
    const kv = fakeKv({ 'quota:user123:2026-09-01': '3' });
    const nextDay = new Date('2026-09-02T00:00:00Z');
    const result = await consumeQuota(kv, 'user123', 3, nextDay);
    expect(result).toEqual({ allowed: true, count: 1, remaining: 2 });
  });

  it('different uids never share a counter', async () => {
    const kv = fakeKv({ 'quota:alice:2026-09-01': '3' });
    const now = new Date('2026-09-01T00:00:00Z');
    const result = await consumeQuota(kv, 'bob', 3, now);
    expect(result).toEqual({ allowed: true, count: 1, remaining: 2 });
  });

  it('tolerates a corrupt/non-numeric stored value by treating it as 0', async () => {
    const kv = fakeKv({ 'quota:user123:2026-09-01': 'not-a-number' });
    const result = await consumeQuota(kv, 'user123', 3, new Date('2026-09-01T00:00:00Z'));
    expect(result).toEqual({ allowed: true, count: 1, remaining: 2 });
  });
});
