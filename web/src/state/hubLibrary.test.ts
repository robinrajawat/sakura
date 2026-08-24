import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeLibraryItemCore,
  initHubLibraryState,
  loadLibraryLocalCore,
  saveLibraryItemsCore,
  sortLibraryItemsCore,
  librarySearchMatchCore,
  libraryUrlHref,
  type HubLibraryDeps,
  type LibraryItem
} from './hubLibrary';

describe('normalizeLibraryItemCore (pure, given injected deps)', () => {
  let fakeNow: number;
  let idCounter: number;

  function makeDeps(overrides: Partial<HubLibraryDeps> = {}): HubLibraryDeps {
    return {
      idbGet: async () => null,
      idbSet: async () => true,
      bumpSyncTimestamp: () => {},
      pushMetaToCloud: () => {},
      now: () => fakeNow,
      generateLibraryId: () => 'lib' + ++idCounter,
      ...overrides
    };
  }

  beforeEach(() => {
    fakeNow = 1_000_000;
    idCounter = 0;
    initHubLibraryState(makeDeps());
  });

  it('fills in every default for a completely empty/null input', () => {
    expect(normalizeLibraryItemCore(null)).toEqual({
      id: 'lib1',
      title: '',
      url: '',
      urlLabel: '',
      body: '',
      tags: [],
      favorite: false,
      createdAt: 1_000_000,
      modifiedAt: 1_000_000
    });
    expect(normalizeLibraryItemCore(undefined)).toEqual({
      id: 'lib2',
      title: '',
      url: '',
      urlLabel: '',
      body: '',
      tags: [],
      favorite: false,
      createdAt: 1_000_000,
      modifiedAt: 1_000_000
    });
  });

  it('preserves a valid existing id, does not generate a new one', () => {
    expect(normalizeLibraryItemCore({ id: 'existing-id' }).id).toBe('existing-id');
  });

  it('generates a fresh id when the existing one is not a string', () => {
    expect(normalizeLibraryItemCore({ id: 123 as unknown as string }).id).toBe('lib1');
  });

  it('filters tags to non-empty trimmed strings only', () => {
    const result = normalizeLibraryItemCore({ tags: ['  work  ', '', '   ', 42 as unknown as string, 'ref'] });
    expect(result.tags).toEqual(['work', 'ref']);
  });

  it('defaults tags to [] when not an array', () => {
    expect(normalizeLibraryItemCore({ tags: 'not-an-array' as unknown as string[] }).tags).toEqual([]);
  });

  it('coerces favorite to a real boolean', () => {
    expect(normalizeLibraryItemCore({ favorite: 1 as unknown as boolean }).favorite).toBe(true);
    expect(normalizeLibraryItemCore({ favorite: undefined }).favorite).toBe(false);
  });

  it('preserves a finite createdAt/modifiedAt, falls back to "now" independently when missing', () => {
    const result = normalizeLibraryItemCore({ createdAt: 500, modifiedAt: undefined });
    expect(result.createdAt).toBe(500);
    expect(result.modifiedAt).toBe(1_000_000);
  });

  it('uses the strict Number.isFinite check, unlike Journal\'s coercive isFinite: a numeric string does NOT survive', () => {
    // Oracle: index.html's normalizeLibraryItem uses Number.isFinite(it.createdAt), a real,
    // deliberate difference from hub.html's Journal normalizer (global isFinite). Preserved
    // exactly rather than unified with Journal's behavior.
    const result = normalizeLibraryItemCore({ createdAt: '500' as unknown as number });
    expect(result.createdAt).toBe(1_000_000);
  });

  it('falls back to now for a non-finite createdAt (NaN, Infinity)', () => {
    expect(normalizeLibraryItemCore({ createdAt: NaN }).createdAt).toBe(1_000_000);
    expect(normalizeLibraryItemCore({ createdAt: Infinity }).createdAt).toBe(1_000_000);
  });
});

describe('stateful library storage (initHubLibraryState + load/save)', () => {
  let storageData: Record<string, unknown>;
  let bumpSyncTimestampCalls: string[];
  let pushMetaToCloudCalls: { metaKey: string; value: unknown }[];
  let fakeNow: number;
  let idCounter: number;

  function makeDeps(overrides: Partial<HubLibraryDeps> = {}): HubLibraryDeps {
    return {
      idbGet: async (key) => (key in storageData ? storageData[key] : null),
      idbSet: async (key, value) => {
        storageData[key] = value;
        return true;
      },
      bumpSyncTimestamp: (metaKey) => {
        bumpSyncTimestampCalls.push(metaKey);
      },
      pushMetaToCloud: (metaKey, value) => {
        pushMetaToCloudCalls.push({ metaKey, value });
      },
      now: () => fakeNow,
      generateLibraryId: () => 'lib' + ++idCounter,
      ...overrides
    };
  }

  beforeEach(() => {
    storageData = {};
    bumpSyncTimestampCalls = [];
    pushMetaToCloudCalls = [];
    fakeNow = 1_000_000;
    idCounter = 0;
    initHubLibraryState(makeDeps());
  });

  it('loadLibraryLocalCore resolves to [] when nothing is stored yet', async () => {
    expect(await loadLibraryLocalCore()).toEqual([]);
  });

  it('loadLibraryLocalCore resolves to [] for a non-array stored value', async () => {
    storageData['sakura_library_v1'] = { not: 'an array' };
    expect(await loadLibraryLocalCore()).toEqual([]);
  });

  it('loadLibraryLocalCore resolves to [] (never rejects) when idbGet itself rejects', async () => {
    initHubLibraryState(
      makeDeps({
        idbGet: async () => {
          throw new Error('IndexedDB unavailable');
        }
      })
    );
    await expect(loadLibraryLocalCore()).resolves.toEqual([]);
  });

  it('loadLibraryLocalCore normalizes every stored entry', async () => {
    storageData['sakura_library_v1'] = [{ id: 'a', title: 'React docs', url: 'https://react.dev' }, { favorite: 'yes' }];
    const result = await loadLibraryLocalCore();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 'a',
      title: 'React docs',
      url: 'https://react.dev',
      urlLabel: '',
      body: '',
      tags: [],
      favorite: false,
      createdAt: 1_000_000,
      modifiedAt: 1_000_000
    });
    expect(result[1].favorite).toBe(true);
  });

  it('saveLibraryItemsCore persists via idbSet and fires both sync side effects', async () => {
    const items: LibraryItem[] = [
      { id: 'a', title: 't', url: '', urlLabel: '', body: '', tags: [], favorite: false, createdAt: 1, modifiedAt: 1 }
    ];
    const result = await saveLibraryItemsCore(items);
    expect(result).toBe(true);
    expect(storageData['sakura_library_v1']).toEqual(items);
    expect(bumpSyncTimestampCalls).toEqual(['library']);
    expect(pushMetaToCloudCalls).toEqual([{ metaKey: 'library', value: items }]);
  });

  it('saveLibraryItemsCore fires bumpSyncTimestamp/pushMetaToCloud synchronously, NOT gated on idbSet resolving', () => {
    let idbSetResolve: (v: boolean) => void = () => {};
    initHubLibraryState(
      makeDeps({
        idbSet: () => new Promise((resolve) => { idbSetResolve = resolve; })
      })
    );
    const promise = saveLibraryItemsCore([]);
    expect(bumpSyncTimestampCalls).toEqual(['library']);
    expect(pushMetaToCloudCalls).toEqual([{ metaKey: 'library', value: [] }]);
    idbSetResolve(true);
    return promise;
  });
});

describe('sortLibraryItemsCore', () => {
  it('sorts favorites first, then most-recently-modified first within each group', () => {
    const items = [
      { id: 'a', favorite: false, modifiedAt: 100 },
      { id: 'b', favorite: true, modifiedAt: 50 },
      { id: 'c', favorite: false, modifiedAt: 200 },
      { id: 'd', favorite: true, modifiedAt: 150 }
    ];
    expect(sortLibraryItemsCore(items).map((i) => i.id)).toEqual(['d', 'b', 'c', 'a']);
  });

  it('does not mutate the input array', () => {
    const items = [{ id: 'a', favorite: false, modifiedAt: 1 }];
    const result = sortLibraryItemsCore(items);
    expect(result).not.toBe(items);
  });
});

describe('librarySearchMatchCore', () => {
  const item = { title: 'React docs', url: 'https://react.dev', urlLabel: 'Official', tags: ['frontend', 'reference'] };

  it('an empty/whitespace-only query always matches', () => {
    expect(librarySearchMatchCore(item, '', '')).toBe(true);
    expect(librarySearchMatchCore(item, '', '   ')).toBe(true);
  });

  it('matches case-insensitively against title/url/urlLabel/tags/body text', () => {
    expect(librarySearchMatchCore(item, '', 'REACT')).toBe(true);
    expect(librarySearchMatchCore(item, '', 'official')).toBe(true);
    expect(librarySearchMatchCore(item, '', 'frontend')).toBe(true);
    expect(librarySearchMatchCore(item, 'hooks guide', 'hooks')).toBe(true);
  });

  it('does not match an unrelated query', () => {
    expect(librarySearchMatchCore(item, '', 'vue')).toBe(false);
  });
});

describe('libraryUrlHref', () => {
  it('returns an empty string for an empty url', () => {
    expect(libraryUrlHref('')).toBe('');
  });

  it('prepends https:// to a scheme-less url', () => {
    expect(libraryUrlHref('example.com')).toBe('https://example.com');
  });

  it('leaves a url with an existing scheme untouched', () => {
    expect(libraryUrlHref('http://example.com')).toBe('http://example.com');
    expect(libraryUrlHref('https://example.com')).toBe('https://example.com');
  });
});
