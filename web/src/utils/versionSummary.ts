/**
 * What Version history says about each version, so the right one can be picked without restoring
 * blind (owner 2026-11-21: "are we adding enough information in the version history to make a
 * useful decision from it?" — every entry read "Auto · 28 rows").
 *
 * - `summarizeVersionChange` compares two copies of a document: rows added, removed, edited and
 *   moved (by row id; words, formatting, heading, note, tables, pictures, tags, status, kind and
 *   tick count as content; a row is moved when its indent or its place among the other rows
 *   changed), thread entries added and removed, diagrams added, removed and changed, and whether
 *   the title, status or link changed (owner 2026-11-25: a version that differed only in
 *   formatting or a diagram said "No changes").
 * - `versionRowExtras` names what a row holds besides its words, for the version preview.
 * - `formatVersionSummary` turns that into one line ("3 rows added · 2 edited · title changed").
 * - `describeDevice` names the device a version was made on ("iPhone app", "Safari on Mac").
 * - `formatVersionTime` gives "Today, 12:47" / "Yesterday, 16:55" / "16 Nov, 18:11".
 *
 * Pure. Wired into index.html via scripts/generate-index-blocks.mjs's `versionSummary` block.
 */

export type VersionRow = { id?: unknown; text?: unknown; note?: unknown; tables?: unknown; images?: unknown; isCheckbox?: unknown; checked?: unknown; depth?: unknown; [k: string]: unknown };
export type VersionDiagram = { id?: unknown; title?: unknown; xml?: unknown; anchorNodeId?: unknown; note?: unknown };
export type VersionCopy = { nodes?: VersionRow[] | null; remarks?: Array<{ id?: unknown }> | null; diagrams?: VersionDiagram[] | null; title?: unknown; docStatus?: unknown; docLinkedUrl?: unknown };

export type VersionChange = {
  rowsAdded: number;
  rowsRemoved: number;
  rowsEdited: number;
  rowsMoved: number;
  threadAdded: number;
  threadRemoved: number;
  diagramsAdded: number;
  diagramsRemoved: number;
  diagramsEdited: number;
  titleChanged: boolean;
  statusChanged: boolean;
  linkChanged: boolean;
};

const STYLE_KEYS = ['heading', 'bold', 'italic', 'underline', 'strike', 'color', 'highlight'];
/** Only the styles that are set, in a fixed order: copies from different places list them differently. */
function setStyles(st: unknown): unknown[] {
  const o = st && typeof st === 'object' ? (st as Record<string, unknown>) : {};
  return STYLE_KEYS.map((k) => (o[k] ? [k, o[k]] : null)).filter(Boolean);
}
/** A row's content, for telling whether it was edited. Position is compared separately. */
export function versionRowContentKey(r: VersionRow): string {
  return JSON.stringify([
    r.text ?? '', r.note ?? '', r.tables ?? [], r.images ?? [], !!r.isCheckbox, !!r.checked,
    Array.isArray(r.marks) && r.marks.length ? r.marks : [], setStyles(r.styles),
    Array.isArray(r.tags) ? r.tags : [], r.marker || ''
  ]);
}

/** Indexes (into `seq`) of a longest increasing run, not necessarily contiguous. */
function longestIncreasing(seq: number[]): Set<number> {
  const tails: number[] = [], prev: number[] = new Array(seq.length).fill(-1);
  for (let i = 0; i < seq.length; i++) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (seq[tails[mid]] < seq[i]) lo = mid + 1; else hi = mid; }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
  }
  const keep = new Set<number>();
  for (let i = tails.length ? tails[tails.length - 1] : -1; i >= 0; i = prev[i]) keep.add(i);
  return keep;
}

function diagramKey(d: VersionDiagram): string {
  return JSON.stringify([d.title ?? '', d.xml ?? '', d.anchorNodeId ?? null, d.note ?? '']);
}

/** What a row holds besides its words, for the version preview: "note · 2 tables · picture · diagram". */
export function versionRowExtras(r: VersionRow, diagrams?: VersionDiagram[] | null): string {
  const parts: string[] = [];
  if (typeof r.note === 'string' && r.note.replace(/<[^>]*>|&nbsp;|\s/g, '')) parts.push('note');
  const t = Array.isArray(r.tables) ? r.tables.length : 0;
  if (t) parts.push(t === 1 ? 'table' : t + ' tables');
  const i = Array.isArray(r.images) ? r.images.length : 0;
  if (i) parts.push(i === 1 ? 'picture' : i + ' pictures');
  const d = (Array.isArray(diagrams) ? diagrams : []).filter((g) => g && g.anchorNodeId != null && String(g.anchorNodeId) === String(r.id)).length;
  if (d) parts.push(d === 1 ? 'diagram' : d + ' diagrams');
  return parts.join(' \u00b7 ');
}

function versionRowsById(copy: VersionCopy | null | undefined): Map<string, VersionRow> {
  const m = new Map<string, VersionRow>();
  for (const r of Array.isArray(copy?.nodes) ? copy!.nodes! : []) if (r && r.id != null) m.set(String(r.id), r);
  return m;
}
function versionEntryIds(copy: VersionCopy | null | undefined): Set<string> {
  const s = new Set<string>();
  for (const e of Array.isArray(copy?.remarks) ? copy!.remarks! : []) if (e && e.id != null) s.add(String(e.id));
  return s;
}

/** What changed going from `older` to `newer`. */
export function summarizeVersionChange(older: VersionCopy | null | undefined, newer: VersionCopy | null | undefined): VersionChange {
  const a = versionRowsById(older), b = versionRowsById(newer);
  let rowsAdded = 0, rowsRemoved = 0, rowsEdited = 0, rowsMoved = 0;
  // Rows in both, in the newer order, by their place in the older copy: those outside the longest
  // run that keeps its order are the ones that moved (dragging one row moves one row, not its neighbours).
  const olderPos = new Map([...a.keys()].map((id, i) => [id, i]));
  const shared = [...b.keys()].filter((id) => olderPos.has(id));
  const inOrder = longestIncreasing(shared.map((id) => olderPos.get(id) as number));
  const reordered = new Set(shared.filter((_, i) => !inOrder.has(i)));
  for (const [id, r] of b) {
    const o = a.get(id);
    if (!o) rowsAdded++;
    else if (versionRowContentKey(o) !== versionRowContentKey(r)) rowsEdited++;
    else if ((Number(o.depth) || 0) !== (Number(r.depth) || 0) || reordered.has(id)) rowsMoved++;
  }
  for (const id of a.keys()) if (!b.has(id)) rowsRemoved++;
  const da = new Map((Array.isArray(older?.diagrams) ? older!.diagrams! : []).filter((d) => d && d.id != null).map((d) => [String(d.id), d]));
  const db = new Map((Array.isArray(newer?.diagrams) ? newer!.diagrams! : []).filter((d) => d && d.id != null).map((d) => [String(d.id), d]));
  let diagramsAdded = 0, diagramsRemoved = 0, diagramsEdited = 0;
  for (const [id, d] of db) { const o = da.get(id); if (!o) diagramsAdded++; else if (diagramKey(o) !== diagramKey(d)) diagramsEdited++; }
  for (const id of da.keys()) if (!db.has(id)) diagramsRemoved++;
  const ea = versionEntryIds(older), eb = versionEntryIds(newer);
  let threadAdded = 0, threadRemoved = 0;
  for (const id of eb) if (!ea.has(id)) threadAdded++;
  for (const id of ea) if (!eb.has(id)) threadRemoved++;
  return {
    rowsAdded, rowsRemoved, rowsEdited, rowsMoved, threadAdded, threadRemoved,
    diagramsAdded, diagramsRemoved, diagramsEdited,
    titleChanged: String(older?.title ?? '') !== String(newer?.title ?? ''),
    statusChanged: String(older?.docStatus ?? '') !== String(newer?.docStatus ?? ''),
    linkChanged: String(older?.docLinkedUrl ?? '') !== String(newer?.docLinkedUrl ?? '')
  };
}

const versionPlural = (n: number, one: string, many: string) => n + ' ' + (n === 1 ? one : many);

/** One line for a change; "No changes to the content" when nothing that counts changed. */
export function formatVersionSummary(c: VersionChange): string {
  const parts: string[] = [];
  if (c.rowsAdded) parts.push(versionPlural(c.rowsAdded, 'row added', 'rows added'));
  if (c.rowsRemoved) parts.push(versionPlural(c.rowsRemoved, 'row removed', 'rows removed'));
  if (c.rowsEdited) parts.push(versionPlural(c.rowsEdited, 'row edited', 'rows edited'));
  if (c.rowsMoved) parts.push(versionPlural(c.rowsMoved, 'row moved', 'rows moved'));
  if (c.threadAdded) parts.push(versionPlural(c.threadAdded, 'thread entry added', 'thread entries added'));
  if (c.threadRemoved) parts.push(versionPlural(c.threadRemoved, 'thread entry removed', 'thread entries removed'));
  if (c.diagramsAdded) parts.push(versionPlural(c.diagramsAdded, 'diagram added', 'diagrams added'));
  if (c.diagramsRemoved) parts.push(versionPlural(c.diagramsRemoved, 'diagram removed', 'diagrams removed'));
  if (c.diagramsEdited) parts.push(versionPlural(c.diagramsEdited, 'diagram changed', 'diagrams changed'));
  if (c.titleChanged) parts.push('title changed');
  if (c.statusChanged) parts.push('status changed');
  if (c.linkChanged) parts.push('link changed');
  return parts.length ? parts.join(' · ') : 'No changes to the content';
}

/**
 * The device a version was made on, from the browser's user agent and whether it runs as an
 * installed app. Short and human: "iPhone app", "Safari on iPhone", "Chrome on Mac".
 */
export function describeDevice(ua: string, installed: boolean): string {
  const u = String(ua || '');
  const isIPad = /iPad/.test(u) || (/Macintosh/.test(u) && /Mobile\//.test(u));
  const isIPhone = /iPhone|iPod/.test(u);
  const os = isIPhone ? 'iPhone' : isIPad ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac OS X|Macintosh/.test(u) ? 'Mac' : /CrOS/.test(u) ? 'Chromebook' : /Linux/.test(u) ? 'Linux' : '';
  if (installed) return os ? os + ' app' : 'Installed app';
  const browser = /Edg\//.test(u) ? 'Edge' : /Firefox\/|FxiOS/.test(u) ? 'Firefox' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser';
  return os ? browser + ' on ' + os : browser;
}

/** "Today, 12:47", "Yesterday, 16:55", "16 Nov, 18:11", or with the year when not this year. */
export function formatVersionTime(ts: number, now: number, locale?: string): string {
  const d = new Date(ts), n = new Date(now);
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((day(n) - day(d)) / 86400000);
  if (diffDays === 0) return 'Today, ' + time;
  if (diffDays === 1) return 'Yesterday, ' + time;
  const date = d.toLocaleDateString(locale, d.getFullYear() === n.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  return date + ', ' + time;
}

export type WordDiffPart = { t: 'same' | 'add' | 'del'; s: string };

/**
 * Word-level difference from `from` to `to` (owner 2026-11-21: show what changed inside a row, as
 * Google Docs does): `add` is in `to` only, `del` in `from` only. Whitespace stays with its word.
 * Longest-common-subsequence on words; long texts (over 400 words a side) fall back to one
 * del + one add, which is still correct, just coarser.
 */
export function diffWords(from: string, to: string): WordDiffPart[] {
  const a = String(from ?? '').match(/\S+\s*|\s+/g) || [];
  const b = String(to ?? '').match(/\S+\s*|\s+/g) || [];
  const out: WordDiffPart[] = [];
  const push = (t: WordDiffPart['t'], s: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += s; else out.push({ t, s });
  };
  if (a.length > 400 || b.length > 400) {
    if (a.length) push('del', a.join(''));
    if (b.length) push('add', b.join(''));
    return out;
  }
  const key = (w: string) => w.trim();
  const n = a.length, m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = key(a[i]) === key(b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) { push('same', b[j]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { push('del', a[i]); i++; }
    else { push('add', b[j]); j++; }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('add', b[j++]);
  return out;
}
