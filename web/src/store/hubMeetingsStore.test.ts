import { describe, expect, it, beforeEach } from 'vitest';
import { useHubMeetingsStore } from './hubMeetingsStore';

describe('hubMeetingsStore', () => {
  beforeEach(() => {
    useHubMeetingsStore.setState({ meetings: [], nextId: 1 });
  });

  it('addMeeting appends a new meeting note', () => {
    useHubMeetingsStore.getState().addMeeting('Sprint planning', '2026-08-22', 'Ajay, Robin', 'Discussed scope');
    expect(useHubMeetingsStore.getState().meetings).toEqual([
      { id: 1, title: 'Sprint planning', date: '2026-08-22', attendees: 'Ajay, Robin', notes: 'Discussed scope' }
    ]);
  });

  it('removeMeeting removes the matching meeting note', () => {
    useHubMeetingsStore.getState().addMeeting('a', 'b', 'c', 'd');
    useHubMeetingsStore.getState().removeMeeting(1);
    expect(useHubMeetingsStore.getState().meetings).toEqual([]);
  });
});
