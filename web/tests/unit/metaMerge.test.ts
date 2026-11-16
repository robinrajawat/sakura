import { describe, it, expect } from 'vitest';
import { merge3, stableJson } from '../../src/state/metaMerge';

describe('merge3', () => {
  it('takes the side that changed', () => {
    expect(merge3({ a: 1 }, { a: 1 }, { a: 2 }, 'local')).toEqual({ a: 2 });
    expect(merge3({ a: 1 }, { a: 3 }, { a: 1 }, 'cloud')).toEqual({ a: 3 });
  });

  it('keeps both devices’ moves in a folder map', () => {
    const base = { d1: 'f1', d2: 'f1' };
    expect(merge3(base, { d1: 'f2', d2: 'f1' }, { d1: 'f1', d2: 'f3' }, 'cloud')).toEqual({ d1: 'f2', d2: 'f3' });
  });

  it('the same key changed on both sides: the preferred side wins', () => {
    const base = { theme: 'light' };
    expect(merge3(base, { theme: 'dark' }, { theme: 'system' }, 'cloud')).toEqual({ theme: 'system' });
    expect(merge3(base, { theme: 'dark' }, { theme: 'system' }, 'local')).toEqual({ theme: 'dark' });
  });

  it('a key added on one side and one removed on the other both happen', () => {
    expect(merge3({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 }, { a: 1 }, 'cloud')).toEqual({ a: 1, c: 3 });
  });

  it('lists with ids merge item by item and field by field', () => {
    const base = [{ id: 'f1', name: 'Work' }, { id: 'f2', name: 'Home' }];
    const local = [{ id: 'f1', name: 'Work stuff' }, { id: 'f2', name: 'Home' }, { id: 'f3', name: 'New here' }];
    const cloud = [{ id: 'f1', name: 'Work' }, { id: 'f2', name: 'Home', parentId: 'f1' }, { id: 'f4', name: 'New there' }];
    expect(merge3(base, local, cloud, 'cloud')).toEqual([
      { id: 'f1', name: 'Work stuff' },
      { id: 'f2', name: 'Home', parentId: 'f1' },
      { id: 'f4', name: 'New there' },
      { id: 'f3', name: 'New here' }
    ]);
  });

  it('an item removed on one side goes, unless the other side changed it', () => {
    const base = [{ id: 1, t: 'a' }, { id: 2, t: 'b' }];
    expect(merge3(base, [{ id: 2, t: 'b' }], [{ id: 1, t: 'a' }, { id: 2, t: 'b' }, { id: 3, t: 'c' }], 'cloud')).toEqual([{ id: 2, t: 'b' }, { id: 3, t: 'c' }]);
    expect(merge3(base, [{ id: 2, t: 'b' }], [{ id: 1, t: 'edited' }, { id: 2, t: 'b' }], 'cloud')).toEqual([{ id: 1, t: 'edited' }, { id: 2, t: 'b' }]);
  });

  it('values that cannot be merged come whole from the preferred side', () => {
    expect(merge3(['a'], ['a', 'b'], ['c'], 'cloud')).toEqual(['c']);
    expect(merge3(1, 2, 3, 'local')).toBe(2);
  });
});

// The account hands values back with their keys in its own order (owner 2026-11-16: "Saving…" and
// "updated on another device" on just opening a document on the iPhone). Key order is not a change.
describe('key order', () => {
  it('stableJson ignores key order, at every depth, but not array order', () => {
    expect(stableJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: 3 } })).toBe(stableJson({ a: { c: 3, d: [2, { x: 2, y: 1 }] }, b: 1 }));
    expect(stableJson([1, 2])).not.toBe(stableJson([2, 1]));
  });
  it('a To-Do deleted on another device stays deleted when this device only holds it in another key order', () => {
    const base = [{ id: 't1', text: 'Keep', done: false }, { id: 't2', text: 'Gone', done: false }]; // as the account sent it
    const local = [{ text: 'Keep', id: 't1', done: false }, { done: false, text: 'Gone', id: 't2' }, { id: 't3', text: 'New here', done: false }];
    const cloud = [{ id: 't1', text: 'Keep', done: false }]; // t2 deleted on the other device
    expect(merge3(base, local, cloud, 'cloud')).toEqual([{ id: 't1', text: 'Keep', done: false }, { id: 't3', text: 'New here', done: false }]);
  });
});
