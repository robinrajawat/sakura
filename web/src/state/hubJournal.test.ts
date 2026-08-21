import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeJournalEntryCore,
  initHubJournalState,
  loadJournalLocalCore,
  saveJournalEntriesCore,
  type HubJournalDeps,
  type JournalEntry
} from './hubJournal';

const MOODS = ['great', 'good', 'neutral', 'low', 'rough'];

describe('normalizeJournalEntryCore (pure, given injected deps)', () => {
  let fakeNow: number;
  let fakeToday: string;
  let idCounter: number;

  function makeDeps(overrides: Partial<HubJournalDeps> = {}): HubJournalDeps {
    return {
      idbGet: async () => null,
      idbSet: async () => true,
      bumpSyncTimestamp: () => {},
      pushMetaToCloud: () => {},
      now: () => fakeNow,
      today: () => fakeToday,
      generateJournalId: () => 'jn' + ++idCounter,
      ...overrides
    };
  }

  beforeEach(() => {
    fakeNow = 1_000_000;
    fakeToday = '2026-08-21';
    idCounter = 0;
    initHubJournalState(makeDeps());
  });

  it('fills in every default for a completely empty/null input', () => {
    expect(normalizeJournalEntryCore(null, MOODS)).toEqual({
      id: 'jn1',
      date: '2026-08-21',
      mood: '',
      tags: [],
      body: '',
      createdAt: 1_000_000,
      modifiedAt: 1_000_000
    });
    expect(normalizeJournalEntryCore(undefined, MOODS)).toEqual({
      id: 'jn2',
      date: '2026-08-21',
      mood: '',
      tags: [],
      body: '',
      createdAt: 1_000_000,
      modifiedAt: 1_000_000
    });
  });

  it('preserves a valid existing id, does not generate a new one', () => {
    const result = normalizeJournalEntryCore({ id: 'existing-id' }, MOODS);
    expect(result.id).toBe('existing-id');
  });

  it('generates a fresh id when the existing one is not a string', () => {
    const result = normalizeJournalEntryCore({ id: 123 as unknown as string }, MOODS);
    expect(result.id).toBe('jn1');
  });

  it('preserves a valid YYYY-MM-DD date', () => {
    expect(normalizeJournalEntryCore({ date: '2020-01-15' }, MOODS).date).toBe('2020-01-15');
  });

  it('falls back to today for a malformed date', () => {
    expect(normalizeJournalEntryCore({ date: 'not-a-date' }, MOODS).date).toBe('2026-08-21');
    expect(normalizeJournalEntryCore({ date: '2020-1-5' }, MOODS).date).toBe('2026-08-21');
  });

  it('preserves a mood that is in the valid list', () => {
    expect(normalizeJournalEntryCore({ mood: 'great' }, MOODS).mood).toBe('great');
  });

  it('falls back to empty string (NOT a default mood) for an invalid mood', () => {
    expect(normalizeJournalEntryCore({ mood: 'ecstatic' }, MOODS).mood).toBe('');
    expect(normalizeJournalEntryCore({ mood: '' }, MOODS).mood).toBe('');
  });

  it('filters tags to non-empty trimmed strings only', () => {
    const result = normalizeJournalEntryCore({ tags: ['  work  ', '', '   ', 42 as unknown as string, 'health'] }, MOODS);
    expect(result.tags).toEqual(['work', 'health']);
  });

  it('caps tags at 20', () => {
    const manyTags = Array.from({ length: 30 }, (_, i) => 'tag' + i);
    const result = normalizeJournalEntryCore({ tags: manyTags }, MOODS);
    expect(result.tags).toHaveLength(20);
  });

  it('defaults tags to [] when not an array', () => {
    expect(normalizeJournalEntryCore({ tags: 'not-an-array' as unknown as string[] }, MOODS).tags).toEqual([]);
  });

  it('preserves a valid body string, defaults to "" otherwise', () => {
    expect(normalizeJournalEntryCore({ body: 'hello' }, MOODS).body).toBe('hello');
    expect(normalizeJournalEntryCore({ body: 42 as unknown as string }, MOODS).body).toBe('');
  });

  it('preserves a finite createdAt/modifiedAt, falls back to "now" independently when missing', () => {
    const result = normalizeJournalEntryCore({ createdAt: 500, modifiedAt: undefined }, MOODS);
    expect(result.createdAt).toBe(500);
    expect(result.modifiedAt).toBe(1_000_000);
  });

  it('matches the original\'s coercive isFinite check: a numeric string survives, unlike Number.isFinite', () => {
    // Oracle: hub.html's original uses global `isFinite(j.createdAt)`, which type-coerces —
    // isFinite("500") is true, unlike Number.isFinite("500") which is false. Preserved exactly.
    const result = normalizeJournalEntryCore({ createdAt: '500' as unknown as number }, MOODS);
    expect(result.createdAt).toBe('500');
  });

  it('falls back to now for a non-finite createdAt (NaN, Infinity, non-numeric string)', () => {
    expect(normalizeJournalEntryCore({ createdAt: NaN }, MOODS).createdAt).toBe(1_000_000);
    expect(normalizeJournalEntryCore({ createdAt: Infinity }, MOODS).createdAt).toBe(1_000_000);
    expect(normalizeJournalEntryCore({ createdAt: 'not-a-number' as unknown as number }, MOODS).createdAt).toBe(1_000_000);
  });
});

describe('stateful journal storage (initHubJournalState + load/save)', () => {
  let storageData: Record<string, unknown>;
  let bumpSyncTimestampCalls: string[];
  let pushMetaToCloudCalls: { metaKey: string; value: unknown }[];
  let fakeNow: number;
  let idCounter: number;

  function makeDeps(overrides: Partial<HubJournalDeps> = {}): HubJournalDeps {
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
      today: () => '2026-08-21',
      generateJournalId: () => 'jn' + ++idCounter,
      ...overrides
    };
  }

  beforeEach(() => {
    storageData = {};
    bumpSyncTimestampCalls = [];
    pushMetaToCloudCalls = [];
    fakeNow = 1_000_000;
    idCounter = 0;
    initHubJournalState(makeDeps());
  });

  it('loadJournalLocalCore resolves to [] when nothing is stored yet', async () => {
    expect(await loadJournalLocalCore(MOODS)).toEqual([]);
  });

  it('loadJournalLocalCore resolves to [] for a non-array stored value', async () => {
    storageData['sakura_journal_v1'] = { not: 'an array' };
    expect(await loadJournalLocalCore(MOODS)).toEqual([]);
  });

  it('loadJournalLocalCore resolves to [] (never rejects) when idbGet itself rejects', async () => {
    initHubJournalState(
      makeDeps({
        idbGet: async () => {
          throw new Error('IndexedDB unavailable');
        }
      })
    );
    await expect(loadJournalLocalCore(MOODS)).resolves.toEqual([]);
  });

  it('loadJournalLocalCore normalizes every stored entry', async () => {
    storageData['sakura_journal_v1'] = [{ id: 'a', date: '2020-01-01', mood: 'good', body: 'x' }, { mood: 'invalid-mood' }];
    const result = await loadJournalLocalCore(MOODS);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 'a', date: '2020-01-01', mood: 'good', tags: [], body: 'x', createdAt: 1_000_000, modifiedAt: 1_000_000 });
    expect(result[1].mood).toBe('');
    expect(result[1].date).toBe('2026-08-21');
  });

  it('saveJournalEntriesCore persists via idbSet and fires both sync side effects', async () => {
    const entries: JournalEntry[] = [{ id: 'a', date: '2026-08-21', mood: '', tags: [], body: '', createdAt: 1, modifiedAt: 1 }];
    const result = await saveJournalEntriesCore(entries);
    expect(result).toBe(true);
    expect(storageData['sakura_journal_v1']).toEqual(entries);
    expect(bumpSyncTimestampCalls).toEqual(['journal']);
    expect(pushMetaToCloudCalls).toEqual([{ metaKey: 'journal', value: entries }]);
  });

  it('saveJournalEntriesCore fires bumpSyncTimestamp/pushMetaToCloud synchronously, NOT gated on idbSet resolving', () => {
    // Oracle: the original fires these two calls unconditionally right after calling idbSet,
    // without awaiting it — preserved here by checking they've already happened before the
    // returned promise is even awaited/resolved.
    let idbSetResolve: (v: boolean) => void = () => {};
    initHubJournalState(
      makeDeps({
        idbSet: () => new Promise((resolve) => { idbSetResolve = resolve; })
      })
    );
    const promise = saveJournalEntriesCore([]);
    expect(bumpSyncTimestampCalls).toEqual(['journal']);
    expect(pushMetaToCloudCalls).toEqual([{ metaKey: 'journal', value: [] }]);
    idbSetResolve(true);
    return promise;
  });

  it('saveJournalEntriesCore returns the idbSet promise, letting the caller observe a rejection', async () => {
    initHubJournalState(
      makeDeps({
        idbSet: async () => {
          throw new Error('quota exceeded');
        }
      })
    );
    await expect(saveJournalEntriesCore([])).rejects.toThrow('quota exceeded');
    // The sync side effects still fired even though the save itself will reject.
    expect(bumpSyncTimestampCalls).toEqual(['journal']);
  });
});
