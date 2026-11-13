/**
 * Three-way merge for synced lists and settings (folders, the document list, document order,
 * folder membership, preferences, To-Dos) — how other synced apps keep two devices' changes
 * instead of the last save replacing the whole list (moving document A to a folder on one device
 * and document B on another keeps both moves).
 *
 * `base` is the value both copies last agreed on (this device's last sync), `local` this device's
 * copy, `cloud` the account's. Only what changed on each side since `base` is taken from that side.
 * When both sides changed the same entry, `prefer` decides (the newer side: the account's when
 * taking an incoming change, this device's when sending its own).
 *
 * - Plain objects merge key by key (recursively).
 * - Arrays whose items all have an `id` merge item by item: an item changed on one side takes that
 *   change (field by field when both changed different fields), an item added on either side is
 *   kept, an item removed on one side is removed unless the other side changed it (then the change
 *   wins, as with a document edited after it was deleted). The account's order comes first, then
 *   items only this device has, in its order.
 * - Anything else (numbers, strings, arrays without ids) is taken whole from the side that changed.
 */
export type Side = 'local' | 'cloud';

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
type IdItem = { id: string | number } & Record<string, unknown>;
function isIdArray(v: unknown): v is IdItem[] {
  return Array.isArray(v) && v.every((x) => isPlainObject(x) && (typeof x.id === 'string' || typeof x.id === 'number'));
}

export function merge3(base: unknown, local: unknown, cloud: unknown, prefer: Side): unknown {
  if (same(local, cloud)) return cloud;
  if (same(local, base)) return cloud; // only the account changed
  if (same(cloud, base)) return local; // only this device changed
  // Both changed.
  if (isPlainObject(local) && isPlainObject(cloud)) {
    const b = isPlainObject(base) ? base : {};
    const out: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(cloud), ...Object.keys(local), ...Object.keys(b)]);
    for (const k of keys) {
      const inL = k in local, inC = k in cloud, inB = k in b;
      if (inL && inC) out[k] = merge3(b[k], local[k], cloud[k], prefer);
      else if (inL && !inC) { if (!inB || !same(local[k], b[k])) out[k] = local[k]; } // removed in the account unless changed here
      else if (!inL && inC) { if (!inB || !same(cloud[k], b[k])) out[k] = cloud[k]; } // removed here unless changed in the account
    }
    return out;
  }
  if (isIdArray(local) && isIdArray(cloud) && (base === undefined || base === null || isIdArray(base))) {
    const key = (x: IdItem) => String(x.id);
    const bMap = new Map((Array.isArray(base) ? (base as IdItem[]) : []).map((x) => [key(x), x]));
    const lMap = new Map(local.map((x) => [key(x), x]));
    const cMap = new Map(cloud.map((x) => [key(x), x]));
    const out: IdItem[] = [];
    const pick = (id: string): IdItem | null => {
      const l = lMap.get(id), c = cMap.get(id), b = bMap.get(id);
      if (l && c) return merge3(b, l, c, prefer) as IdItem;
      if (l && !c) return !b || !same(l, b) ? l : null;
      if (c && !l) return !b || !same(c, b) ? c : null;
      return null;
    };
    for (const x of cloud) { const m = pick(key(x)); if (m) out.push(m); }
    for (const x of local) { if (!cMap.has(key(x))) { const m = pick(key(x)); if (m) out.push(m); } }
    return out;
  }
  return prefer === 'local' ? local : cloud;
}
