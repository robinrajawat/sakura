import { create } from 'zustand';

export interface MeetingNote {
  id: number;
  title: string;
  date: string;
  attendees: string;
  notes: string;
}

interface HubMeetingsState {
  meetings: MeetingNote[];
  nextId: number;
  addMeeting: (title: string, date: string, attendees: string, notes: string) => void;
  removeMeeting: (id: number) => void;
}

/**
 * Phase 4 slice (docs/framework-migration-plan.md): Hub Meeting Notes. Fresh, minimal CRUD
 * list -- no ported core logic exists for this tab (unlike To-Dos/Journal, which wrap
 * hubTodos.ts/hubJournal.ts from Phase 1), so this is written directly rather than "ported",
 * same category as Pad's Decision Log/Q&A/Remarks in Phase 3. No persistence layer yet
 * (in-memory only for this first pass) -- To-Dos/Journal persist via localStorage/a localStorage
 * shim; extending that same pattern here is a real, separately-scoped follow-up rather than
 * something to absorb into this slice.
 */
export const useHubMeetingsStore = create<HubMeetingsState>((set, get) => ({
  meetings: [],
  nextId: 1,

  addMeeting: (title, date, attendees, notes) => {
    const { meetings, nextId } = get();
    set({ meetings: [...meetings, { id: nextId, title, date, attendees, notes }], nextId: nextId + 1 });
  },

  removeMeeting: (id) => set({ meetings: get().meetings.filter((m) => m.id !== id) })
}));
