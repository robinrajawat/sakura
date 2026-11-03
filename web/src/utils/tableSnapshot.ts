/**
 * Tables on the phone look the same as on the computer (owner, 2026-11-03: "unified standard
 * behaviour across platforms; the only thing we need to avoid is corrupting the document").
 *
 * The computer draws each table (plain with its polish, or as cards, a chart, chips, progress
 * bars, a timeline, a status board, pros & cons or an API request) with its own code and sends
 * the result to a separate record, users/{uid}/docs/{id}/previews/tables, beside the diagram
 * pictures. The document itself is never touched. The phone finds a table's copy by a key made
 * from the table's stored HTML, so a table edited after the last copy simply has no copy yet and
 * the phone shows it plain.
 *
 * Wired into index.html (block `tableSnapshot`) and hub.html (block `hubTableSnapshot`).
 */

/** Copies above this size stay on the computer (one Firestore record holds about 1 MB). */
export const TABLE_SNAPSHOT_MAX_CHARS = 900000;

/** A short key for a table's stored HTML: its length plus two 32-bit hashes over every character. */
export function tableSnapshotKey(src: string): string {
  const s = String(src ?? '');
  let a = 5381;
  let b = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = (Math.imul(a, 33) ^ c) >>> 0;
    b = (Math.imul(b, 31) + c) >>> 0;
  }
  return 't' + s.length.toString(36) + '_' + a.toString(36) + '_' + b.toString(36);
}

export interface TableSnapshot {
  /** Extra classes for the figure (pv-table-chart-figure, pos-center). */
  cls: string;
  html: string;
}

/**
 * The copies that fit in one record, smallest first, so one huge chart never pushes out the rest.
 * Returns the kept items keyed as given.
 */
export function fitTableSnapshots(items: Record<string, TableSnapshot>, maxChars = TABLE_SNAPSHOT_MAX_CHARS): Record<string, TableSnapshot> {
  const out: Record<string, TableSnapshot> = {};
  let used = 0;
  Object.keys(items || {})
    .map((k) => ({ k, size: k.length + String(items[k].html || '').length + String(items[k].cls || '').length + 32 }))
    .sort((x, y) => x.size - y.size || (x.k < y.k ? -1 : 1))
    .forEach(({ k, size }) => {
      if (used + size > maxChars) return;
      used += size;
      out[k] = items[k];
    });
  return out;
}

/** Only the classes a copy may put on its figure. */
export function tableSnapshotClass(cls: unknown): string {
  return String(cls ?? '')
    .split(/\s+/)
    .filter((c) => c === 'pv-table-chart-figure' || c === 'pos-center')
    .join(' ');
}
