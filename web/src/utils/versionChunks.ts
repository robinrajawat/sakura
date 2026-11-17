/**
 * How a document version is stored in the account (users/{uid}/docs/{docId}/versions). A version
 * is one record `{ts, reason, json}` when it fits in one Firestore record (1 MiB); a bigger one
 * (usually a document with large diagrams) is split: a head record `{ts, reason, parts}` and part
 * records `{ts, part, json}` with ids `<ts>~<i>`, joined again when read. Before this, a version
 * over the limit stayed on the device that made it, and was lost with that device (owner
 * 2026-11-17, data-safety standard in docs/data-safety-audit.md).
 *
 * Older copies of the app read only `{json}` records: a split version's head and parts fail to
 * parse there and are skipped, as the too-big version was before.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `versionChunks` block.
 */

/** Room for the record's other fields under Firestore's 1 MiB. */
export const VERSION_RECORD_MAX_BYTES = 900000;
/** A part holds at most this many UTF-16 units: 3 bytes each at most in UTF-8, so under the limit. */
export const VERSION_PART_MAX_UNITS = 290000;
/** A version past this many parts (about 17 MB of text at worst) stays on the device. */
export const VERSION_MAX_PARTS = 60;

export type VersionRecord = { id: string; data: Record<string, unknown> };
type Version = { ts: number; reason?: string } & Record<string, unknown>;

function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } // a pair: one 4-byte character
    else n += 3;
  }
  return n;
}

/** Splits text into parts of at most `max` units, never between the two halves of an emoji. */
export function splitText(s: string, max: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    let end = Math.min(i + max, s.length);
    const last = s.charCodeAt(end - 1);
    if (end < s.length && last >= 0xd800 && last <= 0xdbff) end--;
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}

/** The records that store this version, or null when it's too big even split. */
export function versionCloudRecords(rev: Version): VersionRecord[] | null {
  const json = JSON.stringify(rev);
  const ts = rev.ts, reason = rev.reason || 'Auto';
  if (utf8Bytes(json) <= VERSION_RECORD_MAX_BYTES) return [{ id: String(ts), data: { ts, reason, json } }];
  const parts = splitText(json, VERSION_PART_MAX_UNITS);
  if (parts.length > VERSION_MAX_PARTS) return null;
  return [
    { id: String(ts), data: { ts, reason, parts: parts.length } },
    ...parts.map((p, i) => ({ id: ts + '~' + i, data: { ts, part: i, json: p } })),
  ];
}

/** The versions held in a set of records; a split one only when all its parts are there. */
export function versionsFromCloudRecords(records: VersionRecord[]): Version[] {
  const parts = new Map<string, string>();
  for (const r of records) if (r.id.includes('~') && typeof r.data.json === 'string') parts.set(r.id, r.data.json);
  const out: Version[] = [];
  for (const r of records) {
    if (r.id.includes('~')) continue;
    let json: string | null = null;
    if (typeof r.data.json === 'string') json = r.data.json;
    else if (Number.isInteger(r.data.parts) && (r.data.parts as number) > 0) {
      const all: string[] = [];
      for (let i = 0; i < (r.data.parts as number); i++) {
        const p = parts.get(r.id + '~' + i);
        if (p === undefined) { all.length = 0; break; }
        all.push(p);
      }
      if (all.length) json = all.join('');
    }
    if (json === null) continue;
    try {
      const v = JSON.parse(json);
      if (v && Number.isFinite(v.ts) && Array.isArray(v.nodes)) out.push(v);
    } catch { /* a damaged record is skipped */ }
  }
  return out;
}
