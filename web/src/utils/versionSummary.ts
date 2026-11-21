/**
 * What Version history says about each version, so the right one can be picked without restoring
 * blind (owner 2026-11-21: "are we adding enough information in the version history to make a
 * useful decision from it?" — every entry read "Auto · 28 rows").
 *
 * - `summarizeVersionChange` compares two copies of a document: rows added, removed and edited
 *   (by row id; text, note, tables, pictures, kind and tick count as content), thread entries
 *   added and removed, and whether the title or status changed.
 * - `formatVersionSummary` turns that into one line ("3 rows added · 2 edited · title changed").
 * - `describeDevice` names the device a version was made on ("iPhone app", "Safari on Mac").
 * - `formatVersionTime` gives "Today, 12:47" / "Yesterday, 16:55" / "16 Nov, 18:11".
 *
 * Pure. Wired into index.html via scripts/generate-index-blocks.mjs's `versionSummary` block.
 */

export type VersionRow = { id?: unknown; text?: unknown; note?: unknown; tables?: unknown; images?: unknown; isCheckbox?: unknown; checked?: unknown; depth?: unknown; [k: string]: unknown };
export type VersionCopy = { nodes?: VersionRow[] | null; remarks?: Array<{ id?: unknown }> | null; title?: unknown; docStatus?: unknown };

export type VersionChange = {
  rowsAdded: number;
  rowsRemoved: number;
  rowsEdited: number;
  rowsMoved: number;
  threadAdded: number;
  threadRemoved: number;
  titleChanged: boolean;
  statusChanged: boolean;
};

/** A row's content, for telling whether it was edited. Position (depth) is compared separately. */
export function versionRowContentKey(r: VersionRow): string {
  return JSON.stringify([r.text ?? '', r.note ?? '', r.tables ?? [], r.images ?? [], !!r.isCheckbox, !!r.checked]);
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
  for (const [id, r] of b) {
    const o = a.get(id);
    if (!o) rowsAdded++;
    else if (versionRowContentKey(o) !== versionRowContentKey(r)) rowsEdited++;
    else if ((Number(o.depth) || 0) !== (Number(r.depth) || 0)) rowsMoved++;
  }
  for (const id of a.keys()) if (!b.has(id)) rowsRemoved++;
  const ea = versionEntryIds(older), eb = versionEntryIds(newer);
  let threadAdded = 0, threadRemoved = 0;
  for (const id of eb) if (!ea.has(id)) threadAdded++;
  for (const id of ea) if (!eb.has(id)) threadRemoved++;
  return {
    rowsAdded, rowsRemoved, rowsEdited, rowsMoved, threadAdded, threadRemoved,
    titleChanged: String(older?.title ?? '') !== String(newer?.title ?? ''),
    statusChanged: String(older?.docStatus ?? '') !== String(newer?.docStatus ?? '')
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
  if (c.titleChanged) parts.push('title changed');
  if (c.statusChanged) parts.push('status changed');
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
