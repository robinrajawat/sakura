/**
 * The To-Do data model (owner, 2026-10-21: "think from outside in"): a task is its title, a due
 * date, repeat, subtasks, a pin, who it's waiting for, a link and whether it's done. Everything
 * a first-time user would have to learn (priority, In progress / Needs review / Blocked, a single
 * Now task, who raised it) is gone; older lists are migrated on load by `normalizeTodo`.
 *
 * Shared by the desktop To-Dos panel (index.html) and the mobile Hub (hub.html) so both read and
 * write the same shape. Pure: no storage, DOM or clock of its own.
 */

import { normalizeRowMarks, type RowMark } from './rowMarks';

export type TodoRepeat = 'daily' | 'weekdays' | 'weekly';

export interface TodoSubtask {
  id: string;
  text: string;
  done: boolean;
}

export interface TodoNodeRef {
  docId: string;
  nodeId: number | null;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  completedAt: number | null;
  dueDate: string | null;
  repeat: TodoRepeat | null;
  subtasks: TodoSubtask[];
  /** Pinned tasks sit on top of the list. Any number can be pinned. */
  pinned?: boolean;
  /** Present when the task is waiting: free text naming who or what ("Karsten", "vendor quote"), or '' when not said. */
  waitingFor?: string;
  /** When the task started waiting (ms), if known. */
  waitingSince?: number;
  /** A web link (with an optional label) or a document/row reference; never both. */
  link: string | null;
  linkLabel: string | null;
  nodeRef: TodoNodeRef | null;
  /** The thread entry a follow-up task was added from, so its link opens that entry. */
  remarkId?: string;
  /** Formatting on the title's words, the same as a row's (src/utils/rowMarks.ts): `marks` were
   * made for `marksText`; a title changed elsewhere (the Hub's text box) moves them on read. */
  marks?: RowMark[];
  marksText?: string;
}

export type TodoSection = 'pinned' | 'today' | 'upcoming' | 'anytime' | 'waiting' | 'done';

export const TODO_SECTIONS: { key: Exclude<TodoSection, 'done'>; label: string }[] = [
  { key: 'pinned', label: 'Pinned' },
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'anytime', label: 'Anytime' },
  { key: 'waiting', label: 'Waiting' }
];

const OLD_WAITING_STATUSES = ['waiting', 'blocked', 'review'];

function cleanString(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/** The first @mention in a task's text, without the @ ("Ask @Karsten" → "Karsten"), or ''. */
export function firstMention(text: string): string {
  const re = /(^|\s)@([A-Za-z][\w.-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || '')))) {
    const name = m[2].replace(/[.-]+$/, '');
    // Date and status words typed as @today / @waiting are not people.
    if (!/^(today|tomorrow|yesterday|mon|tue|wed|thu|fri|sat|sun|waiting|blocked|done|review)$/i.test(name)) return name;
  }
  return '';
}

/**
 * Reads one stored task into the current shape, migrating older ones: a focus (Now) or In
 * progress task becomes pinned; Waiting, Needs review and Blocked become waiting, for the
 * first person @mentioned in the title. Priority, status, who raised it and fold state are
 * dropped. Returns null for something that isn't a task.
 */
export function normalizeTodo(raw: unknown, now: number): TodoItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, any>;
  if (typeof t.id !== 'string' || !t.id || typeof t.text !== 'string') return null;
  const nr = t.nodeRef;
  const nodeRef: TodoNodeRef | null =
    nr && typeof nr === 'object' && typeof nr.docId === 'string' && nr.docId && (nr.nodeId === null || nr.nodeId === undefined || Number.isFinite(nr.nodeId))
      ? { docId: nr.docId, nodeId: nr.nodeId == null ? null : nr.nodeId }
      : null;
  const out: TodoItem = {
    id: t.id,
    text: t.text,
    done: !!t.done,
    createdAt: Number.isFinite(t.createdAt) ? t.createdAt : now,
    completedAt: Number.isFinite(t.completedAt) ? t.completedAt : null,
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || '') ? t.dueDate : null,
    repeat: ['daily', 'weekdays', 'weekly'].includes(t.repeat) ? t.repeat : null,
    subtasks: Array.isArray(t.subtasks)
      ? t.subtasks
          .filter((s: any) => s && typeof s.id === 'string' && typeof s.text === 'string')
          .map((s: any) => ({ id: s.id, text: String(s.text).slice(0, 300), done: !!s.done }))
      : [],
    link: nodeRef ? null : cleanString(t.link, 2000),
    linkLabel: nodeRef ? null : cleanString(t.linkLabel, 80),
    nodeRef
  };
  if (t.pinned || t.focus || t.status === 'progress') out.pinned = true;
  if (typeof t.waitingFor === 'string') out.waitingFor = t.waitingFor.trim().slice(0, 200);
  else if (OLD_WAITING_STATUSES.includes(t.status)) out.waitingFor = firstMention(t.text);
  if (out.waitingFor !== undefined && Number.isFinite(t.waitingSince)) out.waitingSince = t.waitingSince;
  if (typeof t.remarkId === 'string' && t.remarkId) out.remarkId = t.remarkId;
  if (typeof t.marksText === 'string') {
    const marks = normalizeRowMarks(t.marks, t.marksText.length);
    if (marks.length) {
      out.marks = marks;
      out.marksText = t.marksText;
    }
  }
  return out;
}

export function isWaiting(t: TodoItem): boolean {
  return typeof t.waitingFor === 'string';
}

/**
 * Where a task shows: done tasks in Done; then Pinned; then Waiting; then by due date — Today
 * (due today or overdue), Upcoming (later) or Anytime (no date). `todayIso` is today's
 * YYYY-MM-DD in the user's time zone.
 */
export function todoSection(t: TodoItem, todayIso: string): TodoSection {
  if (t.done) return 'done';
  if (t.pinned) return 'pinned';
  if (isWaiting(t)) return 'waiting';
  if (!t.dueDate) return 'anytime';
  return t.dueDate <= todayIso ? 'today' : 'upcoming';
}

/** Open tasks grouped into sections, in list order within each; empty sections are left out. */
export function groupTodos(todos: TodoItem[], todayIso: string): { key: TodoSection; label: string; items: TodoItem[] }[] {
  return TODO_SECTIONS.map(s => ({ ...s, items: todos.filter(t => todoSection(t, todayIso) === s.key) })).filter(s => s.items.length);
}

/** "Waiting for Karsten", or just "Waiting" when nobody is named. */
export function waitingLabel(t: TodoItem): string {
  return t.waitingFor ? 'Waiting for ' + t.waitingFor : 'Waiting';
}

/** Names suggested while typing "Waiting for": everyone @mentioned, plus short earlier waiting texts
 *  (three words at most, so a long note is not offered back), most used first. */
export function waitingCandidates(todos: TodoItem[]): string[] {
  const counts = new Map<string, number>();
  const add = (n: string) => {
    if (!n) return;
    const key = [...counts.keys()].find(k => k.toLowerCase() === n.toLowerCase()) || n;
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  todos.forEach(t => {
    if (t.waitingFor && t.waitingFor.split(/\s+/).length <= 3) add(t.waitingFor);
    const re = /(^|\s)@([A-Za-z][\w.-]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t.text))) add(firstMention('@' + m[2]));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
}
