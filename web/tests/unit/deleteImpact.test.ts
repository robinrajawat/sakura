import { describe, it, expect } from 'vitest';
import { emptyDeleteImpact, inlineObjectTotal, joinWithAnd, deleteImpactText } from '../../src/utils/deleteImpact';

const counts = (o: Partial<ReturnType<typeof emptyDeleteImpact>>) => ({ ...emptyDeleteImpact(), ...o });

describe('inlineObjectTotal', () => {
  it('counts every inline object but not to-dos', () => {
    expect(inlineObjectTotal(counts({ notes: 1, tables: 2, images: 3, questions: 1, remarks: 1, diagrams: 1, todos: 5 }))).toBe(9);
    expect(inlineObjectTotal(counts({ todos: 2 }))).toBe(0);
  });
});

describe('joinWithAnd', () => {
  it('joins naturally', () => {
    expect(joinWithAnd([])).toBe('');
    expect(joinWithAnd(['a'])).toBe('a');
    expect(joinWithAnd(['a', 'b'])).toBe('a and b');
    expect(joinWithAnd(['a', 'b', 'c'])).toBe('a, b and c');
  });
});

describe('deleteImpactText', () => {
  it('is empty with nothing attached', () => {
    expect(deleteImpactText(emptyDeleteImpact())).toEqual({ undoable: '', permanent: '', todos: '' });
  });
  it('lists undoable objects in a fixed order', () => {
    expect(deleteImpactText(counts({ remarks: 2, notes: 1, questions: 1 })).undoable)
      .toBe('This also deletes 1 note, 1 question and 2 remarks. Undo (Ctrl/Cmd+Z) brings them back.');
    expect(deleteImpactText(counts({ images: 1 })).undoable)
      .toBe('This also deletes 1 image. Undo (Ctrl/Cmd+Z) brings it back.');
  });
  it('warns separately about diagrams, which Undo cannot restore', () => {
    const t = deleteImpactText(counts({ diagrams: 1, remarks: 1 }));
    expect(t.undoable).toBe('This also deletes 1 remark. Undo (Ctrl/Cmd+Z) brings it back.');
    expect(t.permanent).toBe('1 diagram will be permanently deleted. Undo can’t bring it back.');
    expect(deleteImpactText(counts({ diagrams: 2 })).permanent).toBe('2 diagrams will be permanently deleted. Undo can’t bring them back.');
  });
  it('says to-dos stay', () => {
    expect(deleteImpactText(counts({ todos: 1 })).todos).toBe('1 to-do linked here stays in To-Dos, unlinked.');
    expect(deleteImpactText(counts({ todos: 3 })).todos).toBe('3 to-dos linked here stay in To-Dos, unlinked.');
  });
});
