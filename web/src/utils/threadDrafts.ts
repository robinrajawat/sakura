/**
 * Unsent text — thread replies, the "Add a task" box, the feedback message — kept like Slack or
 * Gmail keep a draft: saved on the device as you type,
 * synced to the account, restored when you come back, and removed only when it is sent or you
 * close it. See docs/data-safety-audit.md ("Standard: what a person types is never lost").
 *
 * Drafts live in one map, synced as the `threadDrafts` meta key (its name predates the other
 * fields). A reply's key is document and row (`threadDraftKey`); any other field's is
 * `fieldDraftKey(name)`, and holds plain text rather than HTML. Two
 * devices' changes are merged here rather than by the generic merge3, because merge3 lets one
 * side win when both edited the same entry, and a draft is text someone typed: when both devices
 * changed the same draft, both texts are kept (the newer first).
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `threadDrafts` block.
 */

export type ThreadDraft = {
  html: string;
  at: number;
  kind?: 'question' | 'decision';
  answerTo?: string;
  /** Who it's written as (the reply box's author), kept with the text (owner 2026-11-20: an unsent
   * entry by Raja showed as the owner's after a reload). */
  person?: string;
};
export type ThreadDraftMap = Record<string, ThreadDraft>;

/** Drafts untouched this long are dropped (as Slack and Gmail eventually do). */
export const THREAD_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Keys of drafts that aren't thread replies; their text is plain, not HTML. */
export const FIELD_DRAFT_PREFIX = 'field|';
export function fieldDraftKey(name: string): string {
  return FIELD_DRAFT_PREFIX + name;
}

export function threadDraftKey(docId: unknown, nodeId: unknown): string {
  return String(docId ?? '') + '|' + String(nodeId);
}

function isThreadDraft(v: unknown): v is ThreadDraft {
  return !!v && typeof v === 'object' && typeof (v as ThreadDraft).html === 'string' && Number.isFinite((v as ThreadDraft).at);
}
function asThreadDraftMap(v: unknown): ThreadDraftMap {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as ThreadDraftMap) : {};
}

/** The drafts of one document, as [row id, draft]. Row ids that look like numbers come back as numbers. */
export function draftsForDoc(map: unknown, docId: unknown): Array<[string | number, ThreadDraft]> {
  const prefix = String(docId ?? '') + '|';
  const out: Array<[string | number, ThreadDraft]> = [];
  for (const [k, d] of Object.entries(asThreadDraftMap(map))) {
    if (!k.startsWith(prefix) || !isThreadDraft(d)) continue;
    const id = k.slice(prefix.length);
    out.push([/^\d+$/.test(id) ? Number(id) : id, d]);
  }
  return out;
}

/** Drops anything malformed and drafts older than maxAgeMs. */
export function pruneDrafts(map: unknown, now: number, maxAgeMs: number = THREAD_DRAFT_MAX_AGE_MS): ThreadDraftMap {
  const out: ThreadDraftMap = {};
  for (const [k, d] of Object.entries(asThreadDraftMap(map))) {
    if (isThreadDraft(d) && now - d.at <= maxAgeMs) out[k] = d;
  }
  return out;
}

function threadDraftText(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function sameThreadDraft(a: unknown, b: unknown): boolean {
  // Key order doesn't count: the account hands drafts back with their keys in its own order.
  const json = (v: unknown) => JSON.stringify(v, (_k, x) =>
    x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x);
  return json(a) === json(b);
}

/**
 * Three-way merge of two devices' drafts. `base` is what both last agreed on (undefined on a
 * device's first sync: then everything either side has is kept).
 * - Changed on one side only: that side's.
 * - Removed on one side (sent or closed) and unchanged on the other: removed.
 * - Removed on one side but changed on the other: the change is kept (new text is never dropped).
 * - Changed on both: one draft holding both texts, the newer first, unless the newer already
 *   contains the older's text.
 */
export function mergeDrafts(base: unknown, local: unknown, cloud: unknown): ThreadDraftMap {
  const b = asThreadDraftMap(base), l = asThreadDraftMap(local), c = asThreadDraftMap(cloud);
  const out: ThreadDraftMap = {};
  const keys = new Set([...Object.keys(c), ...Object.keys(l)]);
  for (const k of keys) {
    const ld = isThreadDraft(l[k]) ? l[k] : undefined;
    const cd = isThreadDraft(c[k]) ? c[k] : undefined;
    const bd = isThreadDraft(b[k]) ? b[k] : undefined;
    if (ld && cd) {
      if (sameThreadDraft(ld, cd) || sameThreadDraft(ld, bd)) out[k] = cd;
      else if (sameThreadDraft(cd, bd)) out[k] = ld;
      else if (ld.html === cd.html) out[k] = ld.at >= cd.at ? ld : cd;
      else {
        const [newer, older] = ld.at >= cd.at ? [ld, cd] : [cd, ld];
        const olderText = threadDraftText(older.html);
        const join = k.startsWith(FIELD_DRAFT_PREFIX) ? '\n' : '<br>';
        const html = !olderText || threadDraftText(newer.html).includes(olderText) ? newer.html : newer.html + join + older.html;
        out[k] = { ...newer, html };
      }
    } else if (ld) {
      if (!bd || !sameThreadDraft(ld, bd)) out[k] = ld;
    } else if (cd) {
      if (!bd || !sameThreadDraft(cd, bd)) out[k] = cd;
    }
  }
  return out;
}
