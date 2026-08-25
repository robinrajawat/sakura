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

  it('createDecision creates a blank decision, unanchored when no candidate node is given, and returns its id', () => {
    const id = usePadStore.getState().createDecision(null);
    const decisions = usePadStore.getState().decisions;
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      id,
      anchorNodeId: null,
      context: '',
      decision: '',
      rationale: '',
      alternatives: '',
      impact: '',
      status: 'proposed',
      author: ''
    });
    // Matches legacy's own real id format: 'dl' + a base36 timestamp + a random suffix.
    expect(id).toMatch(/^dl[a-z0-9]+$/);
  });

  it('createDecision auto-anchors to the candidate node when it\'s free', () => {
    const id = usePadStore.getState().createDecision(7);
    expect(usePadStore.getState().decisions.find((d) => d.id === id)?.anchorNodeId).toBe(7);
  });

  it('createDecision leaves the new decision unanchored when the candidate node already has one (the real one-per-node rule)', () => {
    usePadStore.getState().createDecision(7);
    const secondId = usePadStore.getState().createDecision(7);
    expect(usePadStore.getState().decisions.find((d) => d.id === secondId)?.anchorNodeId).toBeNull();
  });

  it('removeDecision removes by id', () => {
    const id = usePadStore.getState().createDecision(null);
    usePadStore.getState().removeDecision(id);
    expect(usePadStore.getState().decisions).toEqual([]);
  });

  it('setDecisionStatus updates a decision\'s status', () => {
    const id = usePadStore.getState().createDecision(null);
    usePadStore.getState().setDecisionStatus(id, 'approved');
    expect(usePadStore.getState().decisions[0].status).toBe('approved');
  });

  it('setDecisionField updates one of the 5 rich-text fields without touching the others', () => {
    const id = usePadStore.getState().createDecision(null);
    usePadStore.getState().setDecisionField(id, 'context', 'We needed a rewrite');
    usePadStore.getState().setDecisionField(id, 'decision', 'Use React');
    const d = usePadStore.getState().decisions[0];
    expect(d.context).toBe('We needed a rewrite');
    expect(d.decision).toBe('Use React');
    expect(d.rationale).toBe('');
  });

  it('setDecisionAuthor updates the author', () => {
    const id = usePadStore.getState().createDecision(null);
    usePadStore.getState().setDecisionAuthor(id, 'Ajay');
    expect(usePadStore.getState().decisions[0].author).toBe('Ajay');
  });

  it('setDecisionAnchor re-anchors to a free node and returns true', () => {
    const id = usePadStore.getState().createDecision(null);
    const ok = usePadStore.getState().setDecisionAnchor(id, 3);
    expect(ok).toBe(true);
    expect(usePadStore.getState().decisions[0].anchorNodeId).toBe(3);
  });

  it('setDecisionAnchor refuses to re-anchor onto a node another decision already occupies', () => {
    usePadStore.getState().createDecision(3);
    const secondId = usePadStore.getState().createDecision(null);
    const ok = usePadStore.getState().setDecisionAnchor(secondId, 3);
    expect(ok).toBe(false);
    expect(usePadStore.getState().decisions.find((d) => d.id === secondId)?.anchorNodeId).toBeNull();
  });

  it('setDecisionAnchor can unlink a decision by passing null', () => {
    const id = usePadStore.getState().createDecision(3);
    expect(usePadStore.getState().setDecisionAnchor(id, null)).toBe(true);
    expect(usePadStore.getState().decisions[0].anchorNodeId).toBeNull();
  });

  it('reorderDecision moves a decision to sit next to another', () => {
    const a = usePadStore.getState().createDecision(null);
    const b = usePadStore.getState().createDecision(null);
    const c = usePadStore.getState().createDecision(null);
    usePadStore.getState().reorderDecision(a, c);
    expect(usePadStore.getState().decisions.map((d) => d.id)).toEqual([b, c, a]);
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

  it('addFile stores real upload fields (size, dataUrl, mimeType, addedAt) and removeFile removes by id', () => {
    const before = Date.now();
    usePadStore.getState().addFile('spec.pdf', 12345, 'data:application/pdf;base64,AAAA', 'application/pdf');
    const files = usePadStore.getState().files;
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      id: 1,
      name: 'spec.pdf',
      size: 12345,
      dataUrl: 'data:application/pdf;base64,AAAA',
      mimeType: 'application/pdf'
    });
    expect(files[0].addedAt).toBeGreaterThanOrEqual(before);
    usePadStore.getState().removeFile(1);
    expect(usePadStore.getState().files).toEqual([]);
  });

  it('nextId increments across every list type that still uses it (decisions no longer do -- they get their own real, string-shaped ids, see padStore.ts\'s own header)', () => {
    usePadStore.getState().addRemark('c', 'd');
    usePadStore.getState().addQaItem('e', 'f');
    const { remarks, qaItems } = usePadStore.getState();
    expect(remarks[0].id).toBe(1);
    expect(qaItems[0].id).toBe(2);
  });
});
