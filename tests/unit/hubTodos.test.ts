import { describe, it, expect, beforeEach } from 'vitest';
import { createTodo, initHubTodosState, loadTodosLocalCore, saveTodosCore, type HubTodosDeps, type Todo } from '../../src/state/hubTodos';

interface LocalStorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

describe('createTodo (pure)', () => {
  let fakeNow: number;
  let idCounter: number;

  function makeDeps(overrides: Partial<HubTodosDeps> = {}): HubTodosDeps {
    return {
      getLocalStorage: () => null,
      bumpSyncTimestamp: () => {},
      pushMetaToCloud: () => {},
      now: () => fakeNow,
      generateTodoId: () => 't' + ++idCounter,
      ...overrides
    };
  }

  beforeEach(() => {
    fakeNow = 1_000_000;
    idCounter = 0;
    initHubTodosState(makeDeps());
  });

  it('creates a todo with the given text and all documented defaults', () => {
    const todo = createTodo('Buy milk');
    expect(todo).toEqual({
      id: 't1',
      text: 'Buy milk',
      done: false,
      createdAt: 1_000_000,
      completedAt: null,
      priority: 'none',
      status: 'none',
      dueDate: null,
      link: null,
      linkLabel: null,
      nodeRef: null,
      meetingRef: null,
      repeat: null,
      subtasks: [],
      subtasksOpen: true
    });
  });

  it('uses the injected id generator, not a hardcoded scheme', () => {
    initHubTodosState(makeDeps({ generateTodoId: () => 'custom-id-123' }));
    expect(createTodo('x').id).toBe('custom-id-123');
  });

  it('uses the injected clock, not a live Date.now()', () => {
    initHubTodosState(makeDeps({ now: () => 42 }));
    expect(createTodo('x').createdAt).toBe(42);
  });

  it('generates a fresh id per call', () => {
    const a = createTodo('a');
    const b = createTodo('b');
    expect(a.id).not.toBe(b.id);
  });
});

describe('stateful todos storage (initHubTodosState + load/save)', () => {
  let storageData: Record<string, string>;
  let bumpSyncTimestampCalls: string[];
  let pushMetaToCloudCalls: { metaKey: string; value: unknown }[];
  let fakeNow: number;

  const fakeStorage: LocalStorageLike = {
    getItem: (key) => (key in storageData ? storageData[key] : null),
    setItem: (key, value) => {
      storageData[key] = value;
    }
  };

  function makeDeps(overrides: Partial<HubTodosDeps> = {}): HubTodosDeps {
    return {
      getLocalStorage: () => fakeStorage as unknown as Storage,
      bumpSyncTimestamp: (metaKey) => {
        bumpSyncTimestampCalls.push(metaKey);
      },
      pushMetaToCloud: (metaKey, value) => {
        pushMetaToCloudCalls.push({ metaKey, value });
      },
      now: () => fakeNow,
      generateTodoId: () => 'gen-id',
      ...overrides
    };
  }

  beforeEach(() => {
    storageData = {};
    bumpSyncTimestampCalls = [];
    pushMetaToCloudCalls = [];
    fakeNow = 1_000_000;
    initHubTodosState(makeDeps());
  });

  it('loadTodosLocalCore returns [] when nothing is stored yet', () => {
    expect(loadTodosLocalCore()).toEqual([]);
  });

  it('loadTodosLocalCore returns [] for corrupt JSON or a non-array value, never throws', () => {
    storageData['sakura_todos_v1'] = '{not valid json';
    expect(loadTodosLocalCore()).toEqual([]);
    storageData['sakura_todos_v1'] = JSON.stringify({ not: 'an array' });
    expect(loadTodosLocalCore()).toEqual([]);
  });

  it('loadTodosLocalCore returns [] when getLocalStorage() itself returns null (e.g. private browsing)', () => {
    initHubTodosState(makeDeps({ getLocalStorage: () => null }));
    expect(loadTodosLocalCore()).toEqual([]);
  });

  it('loadTodosLocalCore returns [] and never throws when getLocalStorage() itself throws', () => {
    initHubTodosState(
      makeDeps({
        getLocalStorage: () => {
          throw new Error('boom');
        }
      })
    );
    expect(() => loadTodosLocalCore()).not.toThrow();
    expect(loadTodosLocalCore()).toEqual([]);
  });

  it('loadTodosLocalCore round-trips a real list', () => {
    const list: Todo[] = [{ id: 't1', text: 'One' } as Todo];
    storageData['sakura_todos_v1'] = JSON.stringify(list);
    expect(loadTodosLocalCore()).toEqual(list);
  });

  it('saveTodosCore persists the list and fires both real side effects, returning true', () => {
    const list: Todo[] = [{ id: 't1', text: 'One' } as Todo];
    const result = saveTodosCore(list);
    expect(result).toBe(true);
    expect(JSON.parse(storageData['sakura_todos_v1'])).toEqual(list);
    expect(bumpSyncTimestampCalls).toEqual(['todos']);
    expect(pushMetaToCloudCalls).toEqual([{ metaKey: 'todos', value: list }]);
  });

  it('saveTodosCore returns false and skips sync side effects on a storage write failure', () => {
    const throwingStorage: LocalStorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    initHubTodosState(makeDeps({ getLocalStorage: () => throwingStorage as unknown as Storage }));
    const result = saveTodosCore([{ id: 't1' } as Todo]);
    expect(result).toBe(false);
    expect(bumpSyncTimestampCalls).toEqual([]);
    expect(pushMetaToCloudCalls).toEqual([]);
  });

  it('saveTodosCore silently no-ops (returns false) when getLocalStorage() itself throws', () => {
    initHubTodosState(
      makeDeps({
        getLocalStorage: () => {
          throw new Error('boom');
        }
      })
    );
    expect(() => saveTodosCore([])).not.toThrow();
    expect(saveTodosCore([])).toBe(false);
  });
});
