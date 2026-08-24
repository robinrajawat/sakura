import { describe, expect, it, beforeEach } from 'vitest';
import { useHubMeetingsStore } from './hubMeetingsStore';
import { useHubTodosStore } from './hubTodosStore';

describe('hubMeetingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useHubMeetingsStore.setState({ meetings: [], loaded: false });
    useHubTodosStore.setState({ todos: [] });
  });

  it('createMeeting appends a fresh note defaulting to today, everything else blank', () => {
    useHubMeetingsStore.getState().createMeeting();
    const meetings = useHubMeetingsStore.getState().meetings;
    expect(meetings).toHaveLength(1);
    expect(meetings[0].title).toBe('');
    expect(meetings[0].date).toBe(new Date().toISOString().slice(0, 10));
    expect(meetings[0].actionItems).toEqual([]);
  });

  it('deleteMeeting removes the matching note', () => {
    useHubMeetingsStore.getState().createMeeting();
    const id = useHubMeetingsStore.getState().meetings[0].id;
    useHubMeetingsStore.getState().deleteMeeting(id);
    expect(useHubMeetingsStore.getState().meetings).toEqual([]);
  });

  it('updateMeetingField patches the given fields and bumps modifiedAt', () => {
    useHubMeetingsStore.getState().createMeeting();
    const id = useHubMeetingsStore.getState().meetings[0].id;
    const before = useHubMeetingsStore.getState().meetings[0].modifiedAt;
    useHubMeetingsStore.getState().updateMeetingField(id, { title: 'Sprint planning', time: '09:30' });
    const updated = useHubMeetingsStore.getState().meetings[0];
    expect(updated.title).toBe('Sprint planning');
    expect(updated.time).toBe('09:30');
    expect(updated.modifiedAt).toBeGreaterThanOrEqual(before);
  });

  it('addAttendee appends a trimmed name, skipping duplicates', () => {
    useHubMeetingsStore.getState().createMeeting();
    const id = useHubMeetingsStore.getState().meetings[0].id;
    useHubMeetingsStore.getState().addAttendee(id, '  Alice  ');
    useHubMeetingsStore.getState().addAttendee(id, 'Alice');
    expect(useHubMeetingsStore.getState().meetings[0].attendees).toEqual(['Alice']);
  });

  it('removeAttendee removes the matching name', () => {
    useHubMeetingsStore.getState().createMeeting();
    const id = useHubMeetingsStore.getState().meetings[0].id;
    useHubMeetingsStore.getState().addAttendee(id, 'Alice');
    useHubMeetingsStore.getState().removeAttendee(id, 'Alice');
    expect(useHubMeetingsStore.getState().meetings[0].attendees).toEqual([]);
  });

  it('addActionItem appends a normalized item, is a no-op for blank text', () => {
    useHubMeetingsStore.getState().createMeeting();
    const id = useHubMeetingsStore.getState().meetings[0].id;
    useHubMeetingsStore.getState().addActionItem(id, '  Follow up with vendor  ');
    useHubMeetingsStore.getState().addActionItem(id, '   ');
    const items = useHubMeetingsStore.getState().meetings[0].actionItems;
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('Follow up with vendor');
    expect(items[0].done).toBe(false);
    expect(items[0].promotedTodoId).toBeNull();
  });

  it('toggleActionItem flips done', () => {
    useHubMeetingsStore.getState().createMeeting();
    const id = useHubMeetingsStore.getState().meetings[0].id;
    useHubMeetingsStore.getState().addActionItem(id, 'Task');
    const itemId = useHubMeetingsStore.getState().meetings[0].actionItems[0].id;
    useHubMeetingsStore.getState().toggleActionItem(id, itemId);
    expect(useHubMeetingsStore.getState().meetings[0].actionItems[0].done).toBe(true);
    useHubMeetingsStore.getState().toggleActionItem(id, itemId);
    expect(useHubMeetingsStore.getState().meetings[0].actionItems[0].done).toBe(false);
  });

  it('updateActionItemText trims and replaces text', () => {
    useHubMeetingsStore.getState().createMeeting();
    const id = useHubMeetingsStore.getState().meetings[0].id;
    useHubMeetingsStore.getState().addActionItem(id, 'Task');
    const itemId = useHubMeetingsStore.getState().meetings[0].actionItems[0].id;
    useHubMeetingsStore.getState().updateActionItemText(id, itemId, '  Revised task  ');
    expect(useHubMeetingsStore.getState().meetings[0].actionItems[0].text).toBe('Revised task');
  });

  it('removeActionItem removes the matching item', () => {
    useHubMeetingsStore.getState().createMeeting();
    const id = useHubMeetingsStore.getState().meetings[0].id;
    useHubMeetingsStore.getState().addActionItem(id, 'Task');
    const itemId = useHubMeetingsStore.getState().meetings[0].actionItems[0].id;
    useHubMeetingsStore.getState().removeActionItem(id, itemId);
    expect(useHubMeetingsStore.getState().meetings[0].actionItems).toEqual([]);
  });

  describe('promoteActionItem', () => {
    it('creates a real todo, wires its id back onto the action item, and is a no-op on a second click', () => {
      useHubMeetingsStore.getState().createMeeting();
      const id = useHubMeetingsStore.getState().meetings[0].id;
      useHubMeetingsStore.getState().updateMeetingField(id, { title: 'Kickoff', date: '2026-09-01' });
      useHubMeetingsStore.getState().addActionItem(id, 'Send the deck');
      const itemId = useHubMeetingsStore.getState().meetings[0].actionItems[0].id;

      useHubMeetingsStore.getState().promoteActionItem(id, itemId);

      const item = useHubMeetingsStore.getState().meetings[0].actionItems[0];
      expect(item.promotedTodoId).not.toBeNull();

      const todos = useHubTodosStore.getState().todos;
      expect(todos).toHaveLength(1);
      expect(todos[0].text).toBe('Send the deck');
      expect(todos[0].dueDate).toBe('2026-09-01');
      expect(todos[0].meetingRef).toEqual({ meetingId: id, title: 'Kickoff' });

      // Second click: already promoted, no new todo, promotedTodoId unchanged.
      useHubMeetingsStore.getState().promoteActionItem(id, itemId);
      expect(useHubTodosStore.getState().todos).toHaveLength(1);
      expect(useHubMeetingsStore.getState().meetings[0].actionItems[0].promotedTodoId).toBe(item.promotedTodoId);
    });

    it('is a no-op when the action item text is empty', () => {
      useHubMeetingsStore.getState().createMeeting();
      const id = useHubMeetingsStore.getState().meetings[0].id;
      useHubMeetingsStore.setState({
        meetings: [
          {
            ...useHubMeetingsStore.getState().meetings[0],
            actionItems: [{ id: 'a1', text: '', done: false, promotedTodoId: null }]
          }
        ]
      });
      useHubMeetingsStore.getState().promoteActionItem(id, 'a1');
      expect(useHubTodosStore.getState().todos).toEqual([]);
      expect(useHubMeetingsStore.getState().meetings[0].actionItems[0].promotedTodoId).toBeNull();
    });
  });

  describe('focusMeetingId (Recap click-to-jump)', () => {
    it('setFocusMeetingId sets it, clearFocusMeetingId resets it to null', () => {
      expect(useHubMeetingsStore.getState().focusMeetingId).toBeNull();
      useHubMeetingsStore.getState().setFocusMeetingId('m1');
      expect(useHubMeetingsStore.getState().focusMeetingId).toBe('m1');
      useHubMeetingsStore.getState().clearFocusMeetingId();
      expect(useHubMeetingsStore.getState().focusMeetingId).toBeNull();
    });
  });
});
