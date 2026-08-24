import { create } from 'zustand';
import {
  normalizeMeetingNote,
  normalizeMeetingActionItem,
  loadMeetingsCore,
  saveMeetingsCore,
  initHubMeetingsState,
  type MeetingNote,
  type MeetingActionItem
} from '../state/hubMeetings';
import { useHubTodosStore } from './hubTodosStore';
import { generateId } from '../utils/generateId';

// Real dependencies for the ported hubMeetings.ts core. idbGet/idbSet are the same
// localStorage-backed Promise shim hubJournalStore.ts uses (no real IndexedDB exists in web/
// yet -- see that file's own header). Cloud sync hooks are no-ops, same "no backend exists
// yet" reasoning as hubTodosStore.ts/hubJournalStore.ts.
initHubMeetingsState({
  idbGet: (key) =>
    Promise.resolve().then(() => {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : null;
    }),
  idbSet: (key, value) =>
    Promise.resolve()
      .then(() => {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(value));
        return true;
      })
      .catch(() => false),
  bumpSyncTimestamp: () => {},
  pushMetaToCloud: () => {},
  now: () => Date.now(),
  generateMeetingId: () => generateId('meeting'),
  generateActionItemId: () => generateId('meeting-action')
});

interface HubMeetingsState {
  meetings: MeetingNote[];
  loaded: boolean;
  /** Loads the persisted list once at startup -- call site is `HubMeetingsPanel.tsx`'s own
   * mount effect, same pattern `useHubJournalStore` uses for its own async load. */
  loadMeetings: () => Promise<void>;

  /** Matches legacy's real `createMeetingNote` (legacy/index.html:47451-47470): a fresh note
   * defaulting to today's date, everything else blank. `templateKey` is accepted for parity
   * with the original's signature and its "New from template" menu, but is currently always a
   * no-op beyond creating a blank note -- see this project's own scoping note in
   * `docs/phase6-full-parity-plan.md` §6.5 for why: legacy itself ships zero prebuilt template
   * content (`MEETING_TEMPLATES=[]`, a deliberate documented removal, not an oversight), so
   * there is no real template content anywhere to port. */
  createMeeting: (templateKey?: string) => void;
  deleteMeeting: (id: string) => void;
  updateMeetingField: (id: string, patch: Partial<Pick<MeetingNote, 'title' | 'date' | 'time' | 'agenda' | 'body'>>) => void;
  addAttendee: (id: string, name: string) => void;
  removeAttendee: (id: string, name: string) => void;

  addActionItem: (id: string, text: string) => void;
  toggleActionItem: (id: string, itemId: string) => void;
  updateActionItemText: (id: string, itemId: string, text: string) => void;
  removeActionItem: (id: string, itemId: string) => void;
  /** Matches legacy's real promote-button handler (legacy/index.html:47963-47973): a no-op if
   * already promoted (`promotedTodoId` already set) or if the item's text is empty. Calls
   * `hubTodosStore`'s `addTodoFromMeeting` directly -- the real `window.addTodoFromMeeting`
   * lazy-export legacy uses (legacy/index.html:46733) exists there to bridge two otherwise-
   * separate script scopes; this project's stores can just import each other directly. */
  promoteActionItem: (id: string, itemId: string) => void;
}

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md): Hub Meeting Notes, replacing the Phase 4
 * in-memory-only placeholder with the real thing -- persistence, richer fields (time/attendees/
 * agenda/body/action items, matching `hubMeetings.ts`'s own `normalizeMeetingNote`), and
 * Promote-to-To-Do. See `hubMeetings.ts`'s own header for the full scoping, including why
 * `links`/`outlookEventId`/`icsUid` and rich-text agenda/body stay out of scope, and why "New
 * from template" is a real menu concept with no real template content to select (legacy itself
 * ships none).
 */
export const useHubMeetingsStore = create<HubMeetingsState>((set, get) => ({
  meetings: [],
  loaded: false,

  loadMeetings: async () => {
    if (get().loaded) return;
    const meetings = await loadMeetingsCore();
    set({ meetings, loaded: true });
  },

  createMeeting: (_templateKey) => {
    const note = normalizeMeetingNote({ date: new Date().toISOString().slice(0, 10) });
    const meetings = [...get().meetings, note];
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  deleteMeeting: (id) => {
    const meetings = get().meetings.filter((m) => m.id !== id);
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  updateMeetingField: (id, patch) => {
    const meetings = get().meetings.map((m) => (m.id === id ? { ...m, ...patch, modifiedAt: Date.now() } : m));
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  addAttendee: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const meetings = get().meetings.map((m) =>
      m.id === id && !m.attendees.includes(trimmed) ? { ...m, attendees: [...m.attendees, trimmed], modifiedAt: Date.now() } : m
    );
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  removeAttendee: (id, name) => {
    const meetings = get().meetings.map((m) =>
      m.id === id ? { ...m, attendees: m.attendees.filter((a) => a !== name), modifiedAt: Date.now() } : m
    );
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  addActionItem: (id, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const item = normalizeMeetingActionItem({ text: trimmed });
    const meetings = get().meetings.map((m) =>
      m.id === id ? { ...m, actionItems: [...m.actionItems, item], modifiedAt: Date.now() } : m
    );
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  toggleActionItem: (id, itemId) => {
    const meetings = get().meetings.map((m) =>
      m.id === id
        ? {
            ...m,
            actionItems: m.actionItems.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)),
            modifiedAt: Date.now()
          }
        : m
    );
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  updateActionItemText: (id, itemId, text) => {
    const trimmed = text.trim();
    const meetings = get().meetings.map((m) =>
      m.id === id
        ? {
            ...m,
            actionItems: m.actionItems.map((it) => (it.id === itemId ? { ...it, text: trimmed } : it)),
            modifiedAt: Date.now()
          }
        : m
    );
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  removeActionItem: (id, itemId) => {
    const meetings = get().meetings.map((m) =>
      m.id === id ? { ...m, actionItems: m.actionItems.filter((it) => it.id !== itemId), modifiedAt: Date.now() } : m
    );
    saveMeetingsCore(meetings);
    set({ meetings });
  },

  promoteActionItem: (id, itemId) => {
    const meeting = get().meetings.find((m) => m.id === id);
    if (!meeting) return;
    const item = meeting.actionItems.find((it: MeetingActionItem) => it.id === itemId);
    if (!item || item.promotedTodoId) return;
    const todoText = item.text.trim();
    if (!todoText) return;
    const newId = useHubTodosStore
      .getState()
      .addTodoFromMeeting(todoText, { meetingId: meeting.id, title: meeting.title || 'Untitled meeting', date: meeting.date || null });
    if (!newId) return;
    const meetings = get().meetings.map((m) =>
      m.id === id
        ? {
            ...m,
            actionItems: m.actionItems.map((it) => (it.id === itemId ? { ...it, promotedTodoId: newId } : it)),
            modifiedAt: Date.now()
          }
        : m
    );
    saveMeetingsCore(meetings);
    set({ meetings });
  }
}));
