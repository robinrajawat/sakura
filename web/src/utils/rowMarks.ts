/**
 * Formatting on part of a row's text (owner, 2026-10-22: rows become rich text — bold, italic,
 * underline, strikethrough, highlight and text colour on a selection).
 *
 * The row's words stay a plain string in `node.text`; the formatting lives beside it in
 * `node.marks` as character ranges: `{s, e, k, v?}` covers `text.slice(s, e)` with kind `k`
 * (`b` bold, `i` italic, `u` underline, `s` strikethrough, `hl` highlight, `c` text colour, `a`
 * web link) and, for `hl`/`c`, the palette name `v`, for `a` the address `v`. Keeping the words plain means everything that reads them
 * (search, sorting, Enter/Backspace split and merge, backlinks, exports) keeps working untouched,
 * and a formatting bug can only misplace formatting, never lose words.
 *
 * Every operation goes through a per-character format list (rows are short), which keeps the
 * range arithmetic in one place: `toCharFormats` expands ranges, `fromCharFormats` collapses
 * them back into sorted, merged, non-empty ranges.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `rowMarks` block.
 */

export type RowMarkKind = 'b' | 'i' | 'u' | 's' | 'hl' | 'c' | 'a';

export interface RowMark {
  s: number;
  e: number;
  k: RowMarkKind;
  v?: string;
}

/** One character's formatting: on/off kinds plus the highlight and colour names. */
export interface CharFormat {
  b?: true;
  i?: true;
  u?: true;
  s?: true;
  hl?: string;
  c?: string;
  a?: string;
}

const ROW_MARK_FLAGS: ReadonlyArray<'b' | 'i' | 'u' | 's'> = ['b', 'i', 'u', 's'];
const ROW_MARK_KINDS: ReadonlyArray<RowMarkKind> = ['b', 'i', 'u', 's', 'hl', 'c', 'a'];
const ROW_MARK_VALUE_RE = /^[a-z0-9-]{1,24}$/;
type ValuedKind = 'hl' | 'c' | 'a';

function isValuedKind(k: RowMarkKind): k is ValuedKind {
  return k === 'hl' || k === 'c' || k === 'a';
}

/** A web address a row link may hold: one line, not too long, and never a script/data URL. */
export function isRowLinkUrl(v: unknown): v is string {
  if (typeof v !== 'string' || !v.trim() || v.length > 2048) return false;
  for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) < 32) return false;
  return !/^\s*(javascript|data|vbscript):/i.test(v);
}

function isValidMarkValue(k: ValuedKind, v: unknown): v is string {
  return k === 'a' ? isRowLinkUrl(v) : typeof v === 'string' && ROW_MARK_VALUE_RE.test(v);
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function isRowMarkKind(k: unknown): k is RowMarkKind {
  return typeof k === 'string' && (ROW_MARK_KINDS as readonly string[]).includes(k);
}

function charFormatKey(f: CharFormat | undefined): string {
  if (!f) return '';
  let key = '';
  for (const k of ROW_MARK_FLAGS) if (f[k]) key += k + ';';
  if (f.hl) key += 'hl=' + f.hl + ';';
  if (f.c) key += 'c=' + f.c + ';';
  if (f.a) key += 'a=' + f.a + ';';
  return key;
}

function toCharFormats(marks: unknown, len: number): CharFormat[] {
  const out: CharFormat[] = [];
  for (let i = 0; i < len; i++) out.push({});
  if (!Array.isArray(marks)) return out;
  for (const m of marks) {
    if (!m || typeof m !== 'object') continue;
    const { s, e, k, v } = m as RowMark;
    if (!isRowMarkKind(k) || !Number.isFinite(s) || !Number.isFinite(e)) continue;
    const from = Math.max(0, Math.floor(s));
    const to = Math.min(len, Math.floor(e));
    if (to <= from) continue;
    if (isValuedKind(k)) {
      if (!isValidMarkValue(k, v)) continue;
      for (let i = from; i < to; i++) out[i][k] = v;
    } else {
      for (let i = from; i < to; i++) out[i][k] = true;
    }
  }
  return out;
}

function fromCharFormats(formats: CharFormat[]): RowMark[] {
  const marks: RowMark[] = [];
  for (const k of ROW_MARK_KINDS) {
    let start = -1;
    let cur: string | true | undefined;
    for (let i = 0; i <= formats.length; i++) {
      const val = i < formats.length ? formats[i][k] : undefined;
      if (val === cur) continue;
      if (cur !== undefined && start >= 0) {
        marks.push(isValuedKind(k) ? { s: start, e: i, k, v: cur as string } : { s: start, e: i, k });
      }
      cur = val;
      start = val !== undefined ? i : -1;
    }
  }
  return marks.sort((a, b) => a.s - b.s || a.e - b.e || ROW_MARK_KINDS.indexOf(a.k) - ROW_MARK_KINDS.indexOf(b.k));
}

/** Cleans stored marks for a text of length `len`: drops invalid or empty ranges, clamps to
 * the text, merges touching ranges of the same kind. Returns `[]` when there is nothing left. */
export function normalizeRowMarks(marks: unknown, len: number): RowMark[] {
  if (!Array.isArray(marks) || !marks.length || len <= 0) return [];
  return fromCharFormats(toCharFormats(marks, len));
}

/** The marks of `text.slice(start, end)`, re-based to start at 0 (Enter splitting a row). */
export function sliceRowMarks(marks: unknown, len: number, start: number, end: number): RowMark[] {
  return fromCharFormats(toCharFormats(marks, len).slice(Math.max(0, start), Math.max(0, end)));
}

/** The marks of `textA + textB` (Backspace/Delete merging two rows). */
export function concatRowMarks(marksA: unknown, lenA: number, marksB: unknown, lenB: number): RowMark[] {
  return fromCharFormats(toCharFormats(marksA, lenA).concat(toCharFormats(marksB, lenB)));
}

/** True when every character in [start, end) has kind `k` (any value for `hl`/`c`/`a`). */
export function rowMarkCovers(marks: unknown, len: number, start: number, end: number, k: RowMarkKind): boolean {
  const formats = toCharFormats(marks, len);
  const from = Math.max(0, start);
  const to = Math.min(len, end);
  if (to <= from) return false;
  for (let i = from; i < to; i++) if (!formats[i][k]) return false;
  return true;
}

/** Sets kind `k` on [start, end): `value` true (a palette name for `hl`/`c`, an address for
 * `a`) adds it, false removes it. A new highlight, colour or link replaces the old one there. */
export function setRowMark(
  marks: unknown,
  len: number,
  start: number,
  end: number,
  k: RowMarkKind,
  value: boolean | string
): RowMark[] {
  const formats = toCharFormats(marks, len);
  const from = Math.max(0, start);
  const to = Math.min(len, end);
  for (let i = from; i < to; i++) {
    if (isValuedKind(k)) {
      if (isValidMarkValue(k, value)) formats[i][k] = value;
      else delete formats[i][k];
    } else if (value) {
      formats[i][k] = true;
    } else {
      delete formats[i][k];
    }
  }
  return fromCharFormats(formats);
}

/** Keeps marks in step when a row's text is changed outside the editor (a backlink rename, a
 * find-and-replace): the common start and end of the two texts keep their formatting, and the
 * replaced middle takes the formatting of the first character it replaced (or of the character
 * before it, for a pure insertion) — the same thing typing there would do. */
export function adjustRowMarksForText(marks: unknown, oldText: string, newText: string): RowMark[] {
  const a = String(oldText || '');
  const b = String(newText || '');
  if (!Array.isArray(marks) || !marks.length || !b.length) return [];
  if (a === b) return normalizeRowMarks(marks, b.length);
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let q = 0;
  while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
  const formats = toCharFormats(marks, a.length);
  const inherit = p < a.length - q ? formats[p] : p > 0 ? formats[p - 1] : formats[p];
  const middle: CharFormat[] = [];
  for (let i = 0; i < b.length - p - q; i++) middle.push({ ...(inherit || {}) });
  return fromCharFormats(formats.slice(0, p).concat(middle, formats.slice(a.length - q)));
}

/** The row's text cut into runs of equal formatting. A `[[link]]` is never cut in two: it takes
 * the formatting of the first character of its name, so a link chip renders whole. */
export function rowMarkRuns(text: string, marks: unknown): Array<{ text: string; f: CharFormat }> {
  const src = String(text || '');
  const formats = toCharFormats(marks, src.length);
  const linkRe = /\[\[[\s\S]*?\]\](?!\])/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(src))) {
    const f = formats[Math.min(m.index + 2, m.index + m[0].length - 1)];
    for (let i = m.index; i < m.index + m[0].length; i++) formats[i] = f;
  }
  const runs: Array<{ text: string; f: CharFormat }> = [];
  let start = 0;
  for (let i = 1; i <= src.length; i++) {
    if (i < src.length && charFormatKey(formats[i]) === charFormatKey(formats[start])) continue;
    runs.push({ text: src.slice(start, i), f: formats[start] || {} });
    start = i;
  }
  return runs;
}

/** The app's own tags for one run's formatting (editor, rows, PDF): palette names resolve
 * through the `--fc-*` and `.hl-mark-*` styles, so dark mode keeps working. */
export function rowMarkTags(html: string, f: CharFormat): string {
  let out = html;
  if (f.b) out = '<b>' + out + '</b>';
  if (f.i) out = '<i>' + out + '</i>';
  if (f.u) out = '<u>' + out + '</u>';
  if (f.s) out = '<s>' + out + '</s>';
  if (f.c) out = `<span class="row-fc" data-c="${f.c}" style="color:var(--fc-${f.c})">` + out + '</span>';
  if (f.a) {
    const href = escapeAttr(f.a);
    out = `<a class="row-weblink" href="${href}" data-a="${href}" target="_blank" rel="noopener noreferrer">` + out + '</a>';
  }
  if (f.hl) out = `<mark class="row-hl hl-mark hl-mark-${f.hl}" data-hl="${f.hl}">` + out + '</mark>';
  return out;
}

/** Renders a row as HTML: each run goes through `renderText` (the row's usual parser, which
 * escapes it and draws links) and is wrapped by `wrap` for its formatting — the app's own tags
 * by default; rich copy passes one with fixed colours for other apps. */
export function rowMarksToHtml(
  text: string,
  marks: unknown,
  renderText: (s: string) => string,
  wrap: (html: string, f: CharFormat) => string = rowMarkTags
): string {
  if (!Array.isArray(marks) || !marks.length) return renderText(String(text || ''));
  return rowMarkRuns(text, marks)
    .map(({ text: t, f }) => wrap(renderText(t), f))
    .join('');
}

/** The minimal DOM shape `readRowMarksFromDom` walks (a real element in the app). */
export interface RowMarkDomNode {
  nodeType: number;
  nodeValue?: string | null;
  tagName?: string;
  childNodes?: ArrayLike<RowMarkDomNode>;
  getAttribute?: (name: string) => string | null;
}

/** Reads the editor's contenteditable back into `{text, marks}`. `text` is exactly the
 * element's textContent; formatting comes only from the tags this file writes (plus the
 * browser's own strong/em/strike/del), so pasted or stray markup can't add anything else. */
export function readRowMarksFromDom(root: RowMarkDomNode): { text: string; marks: RowMark[] } {
  const formats: CharFormat[] = [];
  let text = '';
  const walk = (n: RowMarkDomNode, f: CharFormat): void => {
    if (n.nodeType === 3) {
      const t = n.nodeValue || '';
      text += t;
      for (let i = 0; i < t.length; i++) formats.push({ ...f });
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = String(n.tagName || '').toLowerCase();
    const next: CharFormat = { ...f };
    if (tag === 'b' || tag === 'strong') next.b = true;
    else if (tag === 'i' || tag === 'em') next.i = true;
    else if (tag === 'u') next.u = true;
    else if (tag === 's' || tag === 'strike' || tag === 'del') next.s = true;
    const hl = n.getAttribute ? n.getAttribute('data-hl') : null;
    if (hl && ROW_MARK_VALUE_RE.test(hl)) next.hl = hl;
    const c = n.getAttribute ? n.getAttribute('data-c') : null;
    if (c && ROW_MARK_VALUE_RE.test(c)) next.c = c;
    const a = n.getAttribute ? n.getAttribute('data-a') : null;
    if (a && isRowLinkUrl(a)) next.a = a;
    const kids = n.childNodes;
    if (kids) for (let i = 0; i < kids.length; i++) walk(kids[i], next);
  };
  const kids = root.childNodes;
  if (kids) for (let i = 0; i < kids.length; i++) walk(kids[i], {});
  return { text, marks: fromCharFormats(formats) };
}

/** The row fields marks live in: `marks` covers `marksText`, the text they were made for. */
export interface RowMarksHolder {
  text?: string | null;
  marks?: RowMark[];
  marksText?: string;
}

/** A row's marks for its current text. Code that changes `node.text` without knowing about
 * marks (find-and-replace, a backlink rename, an AI rewrite, a sync) leaves `marksText` behind;
 * the first read afterwards moves the marks to the new text (`adjustRowMarksForText`) and
 * stores the result, so formatting follows the words wherever the text was changed. */
export function rowMarksOf(node: RowMarksHolder | null | undefined): RowMark[] {
  if (!node || !Array.isArray(node.marks) || !node.marks.length) return [];
  const text = String(node.text || '');
  if (node.marksText !== text) setRowMarksOn(node, adjustRowMarksForText(node.marks, String(node.marksText ?? ''), text));
  return node.marks || [];
}

/** Stores `marks` for the row's current text; no marks leaves no fields behind. */
export function setRowMarksOn(node: RowMarksHolder, marks: unknown): void {
  const text = String(node.text || '');
  const clean = normalizeRowMarks(marks, text.length);
  if (clean.length) {
    node.marks = clean;
    node.marksText = text;
  } else {
    delete node.marks;
    delete node.marksText;
  }
}

/** Turns the old typed markup into formatting (owner, 2026-10-22: rows are rich text, the typed
 * syntax goes): `**x**` becomes bold and `__x__` italic, read exactly the way the old renderer
 * read them (left to right, the nearest closing pair, no nesting, never inside a `[[link]]`).
 * Existing marks move with their characters. Returns the same text and marks when there is
 * nothing to convert. */
export function convertLegacyRowMarkup(text: string, marks?: unknown): { text: string; marks: RowMark[]; changed: boolean } {
  const src = String(text || '');
  const formats = toCharFormats(marks, src.length);
  if (src.indexOf('**') < 0 && src.indexOf('__') < 0) return { text: src, marks: fromCharFormats(formats), changed: false };
  let out = '';
  const outFormats: CharFormat[] = [];
  const keep = (from: number, to: number, add?: 'b' | 'i') => {
    for (let j = from; j < to; j++) {
      out += src[j];
      outFormats.push(add ? { ...formats[j], [add]: true } : formats[j]);
    }
  };
  let changed = false;
  let i = 0;
  while (i < src.length) {
    if (src[i] === '[' && src[i + 1] === '[') {
      const close = src.indexOf(']]', i + 2);
      if (close > i + 2) {
        keep(i, close + 2);
        i = close + 2;
        continue;
      }
    }
    const pair = src.slice(i, i + 2);
    if (pair === '**' || pair === '__') {
      const end = src.indexOf(pair, i + 2);
      if (end > i + 2) {
        keep(i + 2, end, pair === '**' ? 'b' : 'i');
        i = end + 2;
        changed = true;
        continue;
      }
    }
    keep(i, i + 1);
    i++;
  }
  return { text: out, marks: fromCharFormats(outFormats), changed };
}
