import { describe, it, expect } from 'vitest';
import { merge3 } from '../../src/state/metaMerge';

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
