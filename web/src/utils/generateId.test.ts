import { describe, it, expect } from 'vitest';
import { generateId } from './generateId';

// Pinned local oracles — literal copies of the three functions currently live in index.html,
// kept here only to assert structural (not value-for-value, since these are randomized)
// equivalence: same prefix handling, same overall format, same suffix length per call site.
function originalGenDocId(): string {
  return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function originalGenTemplateId(): string {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function originalMnUid(): string {
  return 'mn' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

describe('generateId', () => {
  it('matches genDocId format: "d" + base36 timestamp + 5-char random suffix', () => {
    const id = generateId('d');
    const oracle = originalGenDocId();
    // Same prefix, same overall structure/length (timestamp portion length varies only with
    // Date.now()'s own value, which is effectively identical between these two calls made
    // microseconds apart in the same test).
    expect(id[0]).toBe('d');
    expect(id.length).toBe(oracle.length);
    expect(id).toMatch(/^d[0-9a-z]+$/);
  });

  it('matches genTemplateId format: "t" + base36 timestamp + 5-char random suffix', () => {
    const id = generateId('t');
    const oracle = originalGenTemplateId();
    expect(id[0]).toBe('t');
    expect(id.length).toBe(oracle.length);
    expect(id).toMatch(/^t[0-9a-z]+$/);
  });

  it('matches mnUid format: "mn" + base36 timestamp + 6-char random suffix', () => {
    const id = generateId('mn', 6);
    const oracle = originalMnUid();
    expect(id.slice(0, 2)).toBe('mn');
    expect(id.length).toBe(oracle.length);
    expect(id).toMatch(/^mn[0-9a-z]+$/);
  });

  it('defaults to a 5-character random suffix when not specified', () => {
    const id = generateId('x');
    // prefix (1) + timestamp (base36 Date.now(), length varies with the current time but is
    // stable within this test run) + 5-char suffix. Isolate the suffix by comparing against
    // a known timestamp portion computed the same way.
    const timestampPart = Date.now().toString(36);
    expect(id.length).toBeGreaterThanOrEqual(1 + timestampPart.length + 5 - 1); // -1 slack for a timestamp tick during the test
    expect(id.length).toBeLessThanOrEqual(1 + timestampPart.length + 5 + 1); // +1 slack, same reason
  });

  it('respects an explicit random suffix length', () => {
    const id10 = generateId('z', 10);
    const timestampPart = Date.now().toString(36);
    // prefix(1) + timestamp + suffix(10), with the same small timing slack as above.
    expect(id10.length).toBeGreaterThanOrEqual(1 + timestampPart.length + 10 - 1);
    expect(id10.length).toBeLessThanOrEqual(1 + timestampPart.length + 10 + 1);
  });

  it('never collides across a large batch of calls (same collision resistance as the original scheme)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      ids.add(generateId('d'));
    }
    expect(ids.size).toBe(5000);
  });

  it('produces only lowercase base36-safe characters after the prefix', () => {
    const id = generateId('mn', 6);
    const suffix = id.slice(2);
    expect(suffix).toMatch(/^[0-9a-z]+$/);
  });

  it('handles an empty prefix (structural edge case, not used by any real call site today)', () => {
    const id = generateId('');
    expect(id).toMatch(/^[0-9a-z]+$/);
  });
});
