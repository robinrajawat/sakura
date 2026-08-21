import { describe, it, expect, beforeAll } from 'vitest';
import { toggleSubtaskCore, removeSubtaskCore, addSubtaskCore, Subtask, SubtaskHost } from '../../src/state/hubSubtasks';
import { generateId } from '../../src/utils/generateId';

// hubSubtasks.ts references subUid as an ambient global (a `declare function`, erased at
// compile time — see the module's own header comment for why). In the real app this global is
// provided by the hubGenerateId block sharing hub.html's own script scope; in this Node test
// environment there is no such shared scope, so it's wired up explicitly here from the real
// generateId implementation (matching hub.html's actual `function subUid(){return
// generateId('sub',6);}` wrapper) — not a mock, the real tested function.
beforeAll(() => {
  const g = globalThis as unknown as { subUid: () => string };
  g.subUid = () => generateId('sub', 6);
});

function host(subtasks: Subtask[] = [], repeat: unknown = null): SubtaskHost {
  return { subtasks, repeat };
}

describe('toggleSubtaskCore', () => {
  it('flips done from false to true', () => {
    const t = host([{ id: 'a', text: 'x', done: false }]);
    expect(toggleSubtaskCore(t, 'a')).toBe(true);
    expect(t.subtasks![0].done).toBe(true);
  });

  it('flips done from true to false', () => {
    const t = host([{ id: 'a', text: 'x', done: true }]);
    toggleSubtaskCore(t, 'a');
    expect(t.subtasks![0].done).toBe(false);
  });

  it('only toggles the matching subtask, leaving siblings untouched', () => {
    const t = host([
      { id: 'a', text: 'x', done: false },
      { id: 'b', text: 'y', done: false },
    ]);
    toggleSubtaskCore(t, 'b');
    expect(t.subtasks![0].done).toBe(false);
    expect(t.subtasks![1].done).toBe(true);
  });

  it('returns false and mutates nothing for an unknown id', () => {
    const t = host([{ id: 'a', text: 'x', done: false }]);
    expect(toggleSubtaskCore(t, 'nope')).toBe(false);
    expect(t.subtasks![0].done).toBe(false);
  });

  it('returns false for a task with no subtasks array', () => {
    const t: SubtaskHost = {};
    expect(toggleSubtaskCore(t, 'a')).toBe(false);
  });
});

describe('removeSubtaskCore', () => {
  it('removes the matching subtask', () => {
    const t = host([
      { id: 'a', text: 'x', done: false },
      { id: 'b', text: 'y', done: false },
    ]);
    expect(removeSubtaskCore(t, 'a')).toBe(true);
    expect(t.subtasks).toEqual([{ id: 'b', text: 'y', done: false }]);
  });

  it('returns false and leaves the array unchanged for an unknown id', () => {
    const t = host([{ id: 'a', text: 'x', done: false }]);
    expect(removeSubtaskCore(t, 'nope')).toBe(false);
    expect(t.subtasks).toEqual([{ id: 'a', text: 'x', done: false }]);
  });

  it('handles a task with no subtasks array without throwing', () => {
    const t: SubtaskHost = {};
    expect(removeSubtaskCore(t, 'a')).toBe(false);
    expect(t.subtasks).toEqual([]);
  });
});

describe('addSubtaskCore', () => {
  it('appends a new subtask with the trimmed text and done=false', () => {
    const t = host([]);
    const sub = addSubtaskCore(t, '  Buy milk  ');
    expect(sub).not.toBeNull();
    expect(sub!.text).toBe('Buy milk');
    expect(sub!.done).toBe(false);
    expect(t.subtasks).toHaveLength(1);
    expect(t.subtasks![0]).toBe(sub);
  });

  it('returns null and mutates nothing for empty/whitespace-only input', () => {
    const t = host([{ id: 'a', text: 'existing', done: false }], 'daily');
    expect(addSubtaskCore(t, '   ')).toBeNull();
    expect(addSubtaskCore(t, '')).toBeNull();
    expect(t.subtasks).toHaveLength(1);
    // repeat must NOT be cleared when nothing was actually added — matches the original's
    // `if(!val)return;` running before the repeat=null line is ever reached.
    expect(t.repeat).toBe('daily');
  });

  it('truncates to 300 characters', () => {
    const t = host([]);
    const long = 'x'.repeat(400);
    const sub = addSubtaskCore(t, long);
    expect(sub!.text).toHaveLength(300);
    expect(sub!.text).toBe('x'.repeat(300));
  });

  it('clears the task repeat on every successful add', () => {
    const t = host([], 'weekly');
    addSubtaskCore(t, 'New subtask');
    expect(t.repeat).toBeNull();
  });

  it('initializes subtasks array when the task has none yet', () => {
    const t: SubtaskHost = {};
    addSubtaskCore(t, 'First');
    expect(t.subtasks).toHaveLength(1);
  });

  it('generates a fresh, unique id per subtask via the ambient subUid', () => {
    const t = host([]);
    const s1 = addSubtaskCore(t, 'One');
    const s2 = addSubtaskCore(t, 'Two');
    expect(s1!.id).not.toBe(s2!.id);
    expect(s1!.id).toMatch(/^sub/);
  });

  it('appends after existing subtasks, preserving order', () => {
    const t = host([{ id: 'a', text: 'first', done: true }]);
    addSubtaskCore(t, 'second');
    expect(t.subtasks!.map((s) => s.text)).toEqual(['first', 'second']);
  });
});
