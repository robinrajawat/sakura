import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeMeetingActionItem,
  normalizeMeetingNote,
  loadMeetingsCore,
  saveMeetingsCore,
  initHubMeetingsState,
  type HubMeetingsDeps
} from './hubMeetings';

interface LocalStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function makeFakeLocalStorage(): LocalStorageLike & { store: Record<string, string> } {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
    removeItem: (k) => {
      delete store[k];
    }
  };
}

describe('normalizeMeetingActionItem (pure)', () => {
  let idCounter: number;

  function makeDeps(overrides: Partial<HubMeetingsDeps> = {}): HubMeetingsDeps {
    return {
      idbGet: async () => null,
      idbSet: async () => true,
      bumpSyncTimestamp: () => {},
      pushMetaToCloud: () => {},
      now: () => 1_000_000,
      generateMeetingId: () => 'm' + ++idCounter,
      generateActionItemId: () => 'a' + ++idCounter,
      ...overrides
    };
  }

  beforeEach(() => {
    idCounter = 0;
    initHubMeetingsState(makeDeps());
  });

  it('fills in every documented default for an empty item', () => {
    expect(normalizeMeetingActionItem(null)).toEqual({ id: 'a1', text: '', done: false, promotedTodoId: null });
  });

  it('preserves valid fields, coerces malformed ones independently', () => {
    expect(normalizeMeetingActionItem({ id: 'x', text: 'Follow up', done: true, promotedTodoId: 'todo1' })).toEqual({
      id: 'x',
      text: 'Follow up',
      done: true,
      promotedTodoId: 'todo1'
    });
    expect(normalizeMeetingActionItem({ id: 42 as unknown as string, text: 'ok' })).toEqual({
      id: 'a1',
      text: 'ok',
      done: false,
      promotedTodoId: null
    });
  });
});

describe('normalizeMeetingNote (pure)', () => {
  let idCounter: number;

  function makeDeps(overrides: Partial<HubMeetingsDeps> = {}): HubMeetingsDeps {
    return {
      idbGet: async () => null,
      idbSet: async () => true,
      bumpSyncTimestamp: () => {},
      pushMetaToCloud: () => {},
      now: () => 1_000_000,
      generateMeetingId: () => 'm' + ++idCounter,
      generateActionItemId: () => 'a' + ++idCounter,
      ...overrides
    };
  }

  beforeEach(() => {
    idCounter = 0;
    initHubMeetingsState(makeDeps());
  });

  it('fills in every documented default for an empty note', () => {
    expect(normalizeMeetingNote(null)).toEqual({
      id: 'm1',
      title: '',
      date: '',
      time: '',
      attendees: [],
      agenda: '',
      body: '',
      actionItems: [],
      createdAt: 1_000_000,
      modifiedAt: 1_000_000
    });
  });

  it('validates time against HH:MM (00-23:59), falling back to empty on anything else', () => {
    expect(normalizeMeetingNote({ time: '09:30' }).time).toBe('09:30');
    expect(normalizeMeetingNote({ time: '23:59' }).time).toBe('23:59');
    expect(normalizeMeetingNote({ time: '24:00' }).time).toBe('');
    expect(normalizeMeetingNote({ time: 'not a time' }).time).toBe('');
    expect(normalizeMeetingNote({ time: 5 as unknown as string }).time).toBe('');
  });

  it('filters and trims attendees, dropping empty/non-string entries', () => {
    expect(normalizeMeetingNote({ attendees: [' Alice ', '', 'Bob', 42 as unknown as string, '   '] }).attendees).toEqual([
      'Alice',
      'Bob'
    ]);
  });

  it('normalizes every action item via normalizeMeetingActionItem', () => {
    const note = normalizeMeetingNote({ actionItems: [{ text: 'Do the thing' }] });
    expect(note.actionItems).toEqual([{ id: 'a2', text: 'Do the thing', done: false, promotedTodoId: null }]);
  });

  it('preserves valid createdAt/modifiedAt, falling back to now() independently', () => {
    const note = normalizeMeetingNote({ createdAt: 500, modifiedAt: undefined });
    expect(note.createdAt).toBe(500);
    expect(note.modifiedAt).toBe(1_000_000);
  });
});

describe('loadMeetingsCore / saveMeetingsCore', () => {
  let idCounter: number;
  let idb: Record<string, unknown>;
  let ls: ReturnType<typeof makeFakeLocalStorage>;

  beforeEach(() => {
    idCounter = 0;
    idb = {};
    ls = makeFakeLocalStorage();
    (globalThis as unknown as { localStorage: LocalStorageLike }).localStorage = ls;
    initHubMeetingsState({
      idbGet: async (key) => idb[key] ?? null,
      idbSet: async (key, value) => {
        idb[key] = value;
        return true;
      },
      bumpSyncTimestamp: () => {},
      pushMetaToCloud: () => {},
      now: () => 1_000_000,
      generateMeetingId: () => 'm' + ++idCounter,
      generateActionItemId: () => 'a' + ++idCounter
    });
  });

  it('returns an empty list when nothing is stored anywhere', async () => {
    expect(await loadMeetingsCore()).toEqual([]);
  });

  it('round-trips through saveMeetingsCore/loadMeetingsCore via IndexedDB', async () => {
    const note = normalizeMeetingNote({ title: 'Kickoff' });
    await saveMeetingsCore([note]);
    const loaded = await loadMeetingsCore();
    expect(loaded).toEqual([note]);
  });

  it('migrates a legacy localStorage copy into IndexedDB and clears the old key', async () => {
    const note = normalizeMeetingNote({ title: 'Legacy meeting' });
    ls.setItem('sakura_meetings_v1', JSON.stringify([note]));
    const loaded = await loadMeetingsCore();
    expect(loaded).toEqual([note]);
    expect(idb['sakura_meetings_v1']).toEqual([note]);
    expect(ls.getItem('sakura_meetings_v1')).toBeNull();
  });
});
