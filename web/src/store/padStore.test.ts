import { describe, expect, it, beforeEach } from 'vitest';
import { usePadStore } from './padStore';

describe('padStore', () => {
  beforeEach(() => {
    usePadStore.setState({ notesText: '', decisions: [], qaItems: [], remarks: [], files: [], nextId: 1 });
  });

  it('setNotesText sets the document-level notepad text', () => {
    usePadStore.getState().setNotesText('hello');
    expect(usePadStore.getState().notesText).toBe('hello');
  });

  it('addDecision/removeDecision', () => {
    usePadStore.getState().addDecision('Use React', 'Chosen for the rewrite');
    expect(usePadStore.getState().decisions).toEqual([
      { id: 1, title: 'Use React', description: 'Chosen for the rewrite', status: 'proposed' }
    ]);
    usePadStore.getState().removeDecision(1);
    expect(usePadStore.getState().decisions).toEqual([]);
  });

  it('setDecisionStatus updates a decision\'s status', () => {
    usePadStore.getState().addDecision('Use React', 'Chosen for the rewrite');
    usePadStore.getState().setDecisionStatus(1, 'approved');
    expect(usePadStore.getState().decisions[0].status).toBe('approved');
  });

  it('addQaItem/removeQaItem', () => {
    usePadStore.getState().addQaItem('Why Zustand?', 'Simple and small');
    expect(usePadStore.getState().qaItems).toEqual([{ id: 1, question: 'Why Zustand?', answer: 'Simple and small' }]);
    usePadStore.getState().removeQaItem(1);
    expect(usePadStore.getState().qaItems).toEqual([]);
  });

  it('addRemark/removeRemark', () => {
    usePadStore.getState().addRemark('Ajay', 'Looks good');
    const remarks = usePadStore.getState().remarks;
    expect(remarks).toHaveLength(1);
    expect(remarks[0]).toMatchObject({ id: 1, person: 'Ajay', text: 'Looks good' });
    expect(remarks[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    usePadStore.getState().removeRemark(1);
    expect(usePadStore.getState().remarks).toEqual([]);
  });

  it('addFile/removeFile', () => {
    usePadStore.getState().addFile('spec.pdf');
    expect(usePadStore.getState().files).toEqual([{ id: 1, name: 'spec.pdf' }]);
    usePadStore.getState().removeFile(1);
    expect(usePadStore.getState().files).toEqual([]);
  });

  it('nextId increments across all list types, not per-list', () => {
    usePadStore.getState().addDecision('a', 'b');
    usePadStore.getState().addRemark('c', 'd');
    const { decisions, remarks } = usePadStore.getState();
    expect(decisions[0].id).toBe(1);
    expect(remarks[0].id).toBe(2);
  });
});
