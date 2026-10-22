import { describe, it, expect } from 'vitest';
import {
  normalizeTodo, todoSection, groupTodos, firstMention, waitingLabel, waitingCandidates, isWaiting, type TodoItem
} from '../../src/utils/todoModel';

const base = { id: 't1', text: 'Task', done: false, createdAt: 1, completedAt: null };
const norm = (extra: Record<string, unknown>) => normalizeTodo({ ...base, ...extra }, 99) as TodoItem;

describe('normalizeTodo', () => {
  it('rejects things that are not tasks', () => {
    expect(normalizeTodo(null, 1)).toBeNull();
    expect(normalizeTodo({ id: 'x' }, 1)).toBeNull();
    expect(normalizeTodo({ text: 'x' }, 1)).toBeNull();
  });
  it('keeps the current fields and drops the removed ones', () => {
    const t = norm({ dueDate: '2026-10-22', repeat: 'weekly', priority: 'high', status: 'none', from: 'Ana', subtasksOpen: false, unfolded: true, subtasks: [{ id: 's', text: 'a', done: 1 }] });
    expect(t).toEqual({ ...base, dueDate: '2026-10-22', repeat: 'weekly', subtasks: [{ id: 's', text: 'a', done: true }], link: null, linkLabel: null, nodeRef: null });
  });
  it('turns the old Now task and In progress tasks into pinned ones', () => {
    expect(norm({ focus: true }).pinned).toBe(true);
    expect(norm({ status: 'progress' }).pinned).toBe(true);
    expect(norm({ pinned: true }).pinned).toBe(true);
    expect(norm({}).pinned).toBeUndefined();
  });
  it('turns Waiting, Needs review and Blocked into waiting, for the first person mentioned', () => {
    expect(norm({ status: 'waiting', text: 'Confirm slots with @Karsten and @Ana' }).waitingFor).toBe('Karsten');
    expect(norm({ status: 'blocked' }).waitingFor).toBe('');
    expect(norm({ status: 'review', text: 'Review @today' }).waitingFor).toBe('');
    expect(norm({ waitingFor: ' Ana ', waitingSince: 5 })).toMatchObject({ waitingFor: 'Ana', waitingSince: 5 });
    expect(isWaiting(norm({}))).toBe(false);
  });
  it('keeps a row link and its thread entry, and never a web link next to it', () => {
    const t = norm({ nodeRef: { docId: 'd', nodeId: 4 }, link: 'https://x', remarkId: 'r1' });
    expect(t.nodeRef).toEqual({ docId: 'd', nodeId: 4 });
    expect(t.link).toBeNull();
    expect(t.remarkId).toBe('r1');
    expect(norm({ nodeRef: { docId: 'd' } }).nodeRef).toEqual({ docId: 'd', nodeId: null });
  });
});

describe('todoSection / groupTodos', () => {
  const today = '2026-10-22';
  it('puts done, pinned and waiting first, then sorts by due date', () => {
    expect(todoSection(norm({ done: true, pinned: true }), today)).toBe('done');
    expect(todoSection(norm({ pinned: true, waitingFor: '' }), today)).toBe('pinned');
    expect(todoSection(norm({ waitingFor: 'Ana', dueDate: today }), today)).toBe('waiting');
    expect(todoSection(norm({ dueDate: '2026-10-01' }), today)).toBe('today');
    expect(todoSection(norm({ dueDate: today }), today)).toBe('today');
    expect(todoSection(norm({ dueDate: '2026-10-23' }), today)).toBe('upcoming');
    expect(todoSection(norm({}), today)).toBe('anytime');
  });
  it('groups in section order, keeping list order and leaving out empty sections', () => {
    const list = [norm({ id: 'a' }), norm({ id: 'b', pinned: true }), norm({ id: 'c' }), norm({ id: 'd', done: true })];
    expect(groupTodos(list, today).map(g => [g.key, g.items.map(t => t.id)])).toEqual([['pinned', ['b']], ['anytime', ['a', 'c']]]);
  });
});

describe('names', () => {
  it('reads the first @mention that is a person', () => {
    expect(firstMention('Ping @tomorrow then @Jo-Ann.')).toBe('Jo-Ann');
    expect(firstMention('mail a@b.com')).toBe('');
  });
  it('labels waiting with or without a name', () => {
    expect(waitingLabel(norm({ waitingFor: 'Ana' }))).toBe('Waiting for Ana');
    expect(waitingLabel(norm({ waitingFor: '' }))).toBe('Waiting');
  });
  it('offers everyone mentioned or waited on, most used first', () => {
    const list = [norm({ text: 'x @Ana @Bo' }), norm({ text: 'y', waitingFor: 'ana' }), norm({ text: '@Cy' })];
    expect(waitingCandidates(list)).toEqual(['Ana', 'Bo', 'Cy']);
  });
});
