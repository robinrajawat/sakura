/**
 * Hub's Meeting Notes storage — entry normalization/validation, plus the IndexedDB-backed
 * load/save layer behind index.html's real Meetings panel (`meetingNotes` array,
 * `normalizeMeetingNote`/`normalizeMeetingActionItem`/`loadMeetingNotes`/`saveMeetingNotes`,
 * legacy/index.html:47057-47122).
 *
 * §6.5 slice (docs/phase6-full-parity-plan.md). "Meeting Notes" in this project's Hub grouping
 * corresponds to legacy's desktop-only `#meetings-panel` in index.html, NOT anything in
 * hub.html -- hub.html's own header (legacy/hub.html:38) explicitly scopes the mobile
 * companion page to "To-Dos and Journal only", with Meeting Notes named as one of the
 * desktop-only features it deliberately excludes. Same span source as Library/Recap.
 *
 * Same field/id scheme as legacy's own `normalizeMeetingNote`, with three real omissions,
 * each a separately-scoped follow-up rather than silently dropped:
 * - `links` (cross-document node references, legacy/index.html:48024+) -- substantial
 *   node-linking UI infrastructure of its own, same category as Files/Diagrams/Mind Map's
 *   own deferred node-linking in §6.3.
 * - `outlookEventId`/`icsUid` -- calendar-sync identity fields with no real sync mechanism
 *   built anywhere in this project yet to populate them meaningfully.
 * - `agenda`/`body` stay plain text here rather than legacy's real rich-text HTML (edited via
 *   `contenteditable`, sanitized through `sakuraSanitizeRichHtml`) -- no rich-text editing
 *   infrastructure exists for Hub panels in this project (unlike the Note panel, which got its
 *   own real rich-text editor in §6.3); plain text is an honest, self-consistent
 *   simplification rather than a partial rich-text port.
 *
 * `actionItems`' `promotedTodoId` field is preserved exactly (legacy/index.html:47058) --
 * `null` until a "Promote to To-Do" click creates a real todo and stores its id back here,
 * disabling re-promotion (legacy/index.html:47963-47973). AI rewrite
 * (`rewriteMeetingActionItem`, legacy/index.html:47989-48011) is out of scope -- §6.9 (AI
 * Features) hasn't started.
 *
 * Deliberately NOT extracted here, same reasoning as every prior slice: `renderMeetingsList`/
 * `renderMeetingActionItems`/DOM construction (stays hand-written), the floating-panel chrome
 * (maximize/toolbar/search/date-time popovers, legacy/index.html:4002-4023) -- this project's
 * Meeting Notes render inline in the Hub grid, same "honest first pass, simpler chrome"
 * convention every other Pad/Hub slice uses -- and ICS/PDF export/Sakura-JSON import
 * (legacy/index.html:47127-47184, 47388-47420), deferred to §6.6 where that cross-cutting
 * export infrastructure is being built once for every surface.
 */

export interface MeetingActionItem {
  id: string;
  text: string;
  done: boolean;
  promotedTodoId: string | null;
}

export interface MeetingNote {
  id: string;
  title: string;
  date: string;
  time: string;
  attendees: string[];
  agenda: string;
  body: string;
  actionItems: MeetingActionItem[];
  createdAt: number;
  modifiedAt: number;
}

export interface HubMeetingsDeps {
  idbGet: (key: string) => Promise<unknown>;
  idbSet: (key: string, value: unknown) => Promise<boolean>;
  bumpSyncTimestamp: (metaKey: string) => void;
  pushMetaToCloud: (metaKey: string, value: unknown) => void;
  now: () => number;
  generateMeetingId: () => string;
  generateActionItemId: () => string;
}

// Private to this module (deliberately NOT the same name as index.html's own top-level
// MEETINGS_KEY — same reasoning hubTodos.ts/hubJournal.ts give for their own storage keys).
const _MEETINGS_STORAGE_KEY = 'sakura_meetings_v1';

let hubMeetingsDeps: HubMeetingsDeps | null = null;

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initHubMeetingsState(injected: HubMeetingsDeps): void {
  hubMeetingsDeps = injected;
}

function requireHubMeetingsDeps(): HubMeetingsDeps {
  if (!hubMeetingsDeps) throw new Error('hubMeetings state used before initHubMeetingsState() was called');
  return hubMeetingsDeps;
}

/** Matches legacy's own `normalizeMeetingActionItem` exactly (legacy/index.html:47057-47059):
 * every field defaults independently rather than the whole object being rejected if one field
 * is malformed, matching the original's field-by-field `typeof`/fallback checks. */
export function normalizeMeetingActionItem(it: Partial<MeetingActionItem> | null | undefined): MeetingActionItem {
  const d = requireHubMeetingsDeps();
  return {
    id: typeof it?.id === 'string' ? it.id : d.generateActionItemId(),
    text: typeof it?.text === 'string' ? it.text : '',
    done: !!it?.done,
    promotedTodoId: typeof it?.promotedTodoId === 'string' ? it.promotedTodoId : null
  };
}

/** Matches legacy's own `normalizeMeetingNote` exactly for every field this project keeps
 * (legacy/index.html:47064-47080) -- `links`/`outlookEventId`/`icsUid` deliberately omitted,
 * see this file's own header for why. `time` validates against the same `HH:MM` (00-23:59)
 * pattern as the original, falling back to an empty string on anything else (including a
 * malformed string, not just a missing one). */
export function normalizeMeetingNote(
  m: (Omit<Partial<MeetingNote>, 'actionItems'> & { actionItems?: unknown[] }) | null | undefined
): MeetingNote {
  const d = requireHubMeetingsDeps();
  const now = d.now();
  return {
    id: typeof m?.id === 'string' ? m.id : d.generateMeetingId(),
    title: typeof m?.title === 'string' ? m.title : '',
    date: typeof m?.date === 'string' ? m.date : '',
    time: typeof m?.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time) ? m.time : '',
    attendees: Array.isArray(m?.attendees)
      ? m.attendees.filter((a): a is string => typeof a === 'string' && a.trim().length > 0).map((a) => a.trim())
      : [],
    agenda: typeof m?.agenda === 'string' ? m.agenda : '',
    body: typeof m?.body === 'string' ? m.body : '',
    actionItems: Array.isArray(m?.actionItems)
      ? m.actionItems.map((it) => normalizeMeetingActionItem(it as Partial<MeetingActionItem> | null | undefined))
      : [],
    createdAt: typeof m?.createdAt === 'number' && Number.isFinite(m.createdAt) ? m.createdAt : now,
    modifiedAt: typeof m?.modifiedAt === 'number' && Number.isFinite(m.modifiedAt) ? m.modifiedAt : now
  };
}

/** Matches legacy's own real `loadMeetingNotes` (legacy/index.html:47089-47103): reads from
 * IndexedDB first, falling back to a legacy localStorage copy (and migrating it into IndexedDB
 * on success) if IndexedDB has nothing yet -- same one-time migration path Journal's own load
 * function uses. Never throws; any failure at any stage falls through to an empty list. */
export async function loadMeetingsCore(): Promise<MeetingNote[]> {
  const d = requireHubMeetingsDeps();
  try {
    const idbNotes = await d.idbGet(_MEETINGS_STORAGE_KEY);
    if (Array.isArray(idbNotes)) return idbNotes.map(normalizeMeetingNote);
  } catch {
    // fall through to the localStorage migration path below
  }
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(_MEETINGS_STORAGE_KEY) : null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const migrated = parsed.map(normalizeMeetingNote);
      try {
        await d.idbSet(_MEETINGS_STORAGE_KEY, migrated);
        localStorage.removeItem(_MEETINGS_STORAGE_KEY);
      } catch {
        // migration best-effort, matches legacy's own silent-swallow
      }
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

/** Matches legacy's own real `saveMeetingNotes` (legacy/index.html:47105-47122): writes the
 * full list to IndexedDB and fires the same two real sync side effects every other Hub save
 * does, both injected. Returns whether the write itself succeeded. Deliberately NOT ported:
 * `maybeAutoSnapshotMeetings` (Version History, §6.8, not built anywhere yet) and
 * `scheduleBackupWrite`/`markMetaChanged` beyond the two injected hooks (whole-app backup
 * infra, also §6.8). */
export async function saveMeetingsCore(meetings: MeetingNote[]): Promise<boolean> {
  const d = requireHubMeetingsDeps();
  try {
    const ok = await d.idbSet(_MEETINGS_STORAGE_KEY, meetings);
    d.bumpSyncTimestamp('meetings');
    d.pushMetaToCloud('meetings', meetings);
    return ok;
  } catch {
    return false;
  }
}
