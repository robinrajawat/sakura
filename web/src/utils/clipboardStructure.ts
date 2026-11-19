/**
 * Reads the structure of formatted text pasted from another app (owner 2026-11-19: "make sure this
 * whole paste functionality is robust"). Word, OneNote, Outlook, Google Docs, Notion and web pages
 * put HTML on the clipboard; until now Sakura flattened it to plain lines, so headings, nested lists,
 * checkboxes, bold, italic and links were lost. This turns that HTML into rows instead.
 *
 * Input is a DOM element from an inert parse (DOMParser in index.html, happy-dom in tests): nothing
 * here loads, runs or writes HTML. Tables are returned as their outerHTML for the caller to sanitize
 * (sakuraSanitizeRichHtml) like every other table. Wired via scripts/generate-index-blocks.mjs's
 * `clipboardStructure` block; `structuredPasteRows` in index.html decides when to use it and falls
 * back to the plain-text reading whenever this would keep fewer words.
 */

export interface ClipMark {
  s: number;
  e: number;
  k: 'b' | 'i' | 's' | 'a';
  v?: string;
}

export interface ClipRow {
  text: string;
  marks: ClipMark[];
  depth: number;
  /** 0, or Sakura's heading size 1..3. */
  heading: number;
  isCheckbox: boolean;
  checked: boolean;
  /** Table elements' outerHTML, unsanitized: the caller cleans them. */
  tables: string[];
}

interface ClipNode {
  nodeType: number;
  nodeName: string;
  nodeValue?: string | null;
  textContent: string | null;
  childNodes: ArrayLike<ClipNode>;
  getAttribute?: (name: string) => string | null;
  outerHTML?: string;
}

type Fmt = { b?: boolean; i?: boolean; s?: boolean; a?: string };

const CLIPST_SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'HEAD', 'TITLE', 'META', 'LINK', 'NOSCRIPT', 'IMG', 'SVG', 'IFRAME', 'OBJECT', 'BUTTON', 'SELECT', 'TEXTAREA']);
const CLIPST_BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'PRE', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'HR', 'DL', 'DT', 'DD', 'ADDRESS', 'DETAILS', 'SUMMARY', 'BODY', 'CENTER']);
const CLIPST_CHECK_GLYPH_RE = /^\s*([☐□❏]|[☑☒✓✔✅])\s*/u;

function clipstTag(n: ClipNode): string {
  return (n.nodeName || '').toUpperCase();
}
function clipstAttr(n: ClipNode, name: string): string {
  return (n.getAttribute && n.getAttribute(name)) || '';
}
function clipstStyle(n: ClipNode): string {
  return clipstAttr(n, 'style').toLowerCase();
}
function clipstHidden(n: ClipNode): boolean {
  const st = clipstStyle(n);
  return /display\s*:\s*none/.test(st) || /mso-list\s*:\s*ignore/.test(st) || clipstAttr(n, 'aria-hidden') === 'true' && clipstTag(n) !== 'LI';
}
function clipstIsBlock(n: ClipNode): boolean {
  return n.nodeType === 1 && CLIPST_BLOCK_TAGS.has(clipstTag(n));
}
function clipstSafeHref(h: string): string | null {
  const u = h.trim();
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(u) ? u : null;
}

/** The formatting an element adds to (or removes from) what it inherits. */
function clipstFmtFor(n: ClipNode, f: Fmt): Fmt {
  const tag = clipstTag(n);
  const st = clipstStyle(n);
  const g: Fmt = { ...f };
  if (tag === 'B' || tag === 'STRONG') g.b = true;
  if (tag === 'I' || tag === 'EM') g.i = true;
  if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') g.s = true;
  const fw = /font-weight\s*:\s*([a-z0-9]+)/.exec(st);
  if (fw) g.b = fw[1] === 'bold' || fw[1] === 'bolder' || (/^\d+$/.test(fw[1]) && +fw[1] >= 600);
  const fs = /font-style\s*:\s*([a-z]+)/.exec(st);
  if (fs) g.i = fs[1] === 'italic' || fs[1] === 'oblique';
  if (/text-decoration[a-z-]*\s*:[^;]*line-through/.test(st)) g.s = true;
  if (tag === 'A') {
    const h = clipstSafeHref(clipstAttr(n, 'href'));
    if (h) g.a = h;
  }
  return g;
}

/** Inline content of one block (nested blocks excluded) as words + mark ranges. */
function clipstInline(nodes: ClipNode[], inherit: Fmt): { text: string; marks: ClipMark[] } {
  let text = '';
  const marks: ClipMark[] = [];
  const add = (t: string, f: Fmt) => {
    if (!t) return;
    const s = text.length;
    text += t;
    if (f.b) marks.push({ s, e: text.length, k: 'b' });
    if (f.i) marks.push({ s, e: text.length, k: 'i' });
    if (f.s) marks.push({ s, e: text.length, k: 's' });
    if (f.a) marks.push({ s, e: text.length, k: 'a', v: f.a });
  };
  const walk = (n: ClipNode, f: Fmt) => {
    if (n.nodeType === 3) { add((n.nodeValue ?? n.textContent ?? '').replace(/[\s ]+/g, ' '), f); return; }
    if (n.nodeType !== 1) return;
    const tag = clipstTag(n);
    if (CLIPST_SKIP_TAGS.has(tag) || clipstHidden(n)) return;
    if (tag === 'BR') { add(' ', {}); return; }
    if (tag === 'INPUT') return;
    const g = clipstFmtFor(n, f);
    // Paragraphs inside one item (<li><p>A</p><p>B</p></li>) keep a space between their words.
    const isBlock = CLIPST_BLOCK_TAGS.has(tag);
    if (isBlock) add(' ', {});
    for (const c of Array.from(n.childNodes)) walk(c, g);
    if (isBlock) add(' ', {});
  };
  for (const n of nodes) walk(n, inherit);
  return clipstTidy(text, marks);
}

/** Collapses spaces and trims, keeping marks on the same words. */
function clipstTidy(text: string, marks: ClipMark[]): { text: string; marks: ClipMark[] } {
  const map: number[] = [];
  let out = '';
  for (let j = 0; j < text.length; j++) {
    map[j] = out.length;
    if (text[j] === ' ' && (out.length === 0 || out[out.length - 1] === ' ')) continue;
    out += text[j];
  }
  map[text.length] = out.length;
  let end = out.length;
  while (end > 0 && out[end - 1] === ' ') end--;
  out = out.slice(0, end);
  const merged: ClipMark[] = [];
  for (const m of marks) {
    const s = Math.min(map[m.s], end), e = Math.min(map[m.e], end);
    if (e <= s) continue;
    const prev = merged.find((p) => p.k === m.k && p.v === m.v && p.e >= s && p.s <= e);
    if (prev) { prev.s = Math.min(prev.s, s); prev.e = Math.max(prev.e, e); }
    else merged.push({ ...m, s, e });
  }
  // A mark never starts or ends on a space.
  for (const m of merged) {
    while (m.s < m.e && out[m.s] === ' ') m.s++;
    while (m.e > m.s && out[m.e - 1] === ' ') m.e--;
  }
  return { text: out, marks: merged.filter((m) => m.e > m.s).sort((a, b) => a.s - b.s || a.e - b.e) };
}

/** A checkbox at the start of a list item: Google Docs (aria-checked), Notion, <input>, or a glyph. */
function clipstCheckbox(li: ClipNode): { isCheckbox: boolean; checked: boolean } {
  const ac = clipstAttr(li, 'aria-checked');
  if (clipstAttr(li, 'role') === 'checkbox' || ac === 'true' || ac === 'false') return { isCheckbox: true, checked: ac === 'true' };
  let found: { isCheckbox: boolean; checked: boolean } | null = null;
  const look = (n: ClipNode, depth: number) => {
    if (found || depth > 3 || n.nodeType !== 1) return;
    const tag = clipstTag(n);
    if (tag === 'UL' || tag === 'OL') return;
    const cls = ' ' + clipstAttr(n, 'class') + ' ';
    if (tag === 'INPUT' && clipstAttr(n, 'type').toLowerCase() === 'checkbox') { found = { isCheckbox: true, checked: n.getAttribute ? n.getAttribute('checked') !== null : false }; return; }
    if (/ checkbox(-on| on)? /.test(cls) || / checkbox-off /.test(cls)) { found = { isCheckbox: true, checked: / checkbox-on | checked /.test(cls) }; return; }
    for (const c of Array.from(n.childNodes)) look(c, depth + 1);
  };
  for (const c of Array.from(li.childNodes)) look(c, 0);
  return found ?? { isCheckbox: false, checked: false };
}

/**
 * Turns pasted HTML into rows: headings (nesting by level), lists (nesting by level, including
 * Word's mso-list paragraphs and OneNote's/Google Docs' lists inside lists), paragraphs, To-Do
 * checkboxes, inline bold/italic/strikethrough/links, and tables attached to the row above.
 */
export function readClipboardStructure(root: ClipNode): ClipRow[] {
  const rows: ClipRow[] = [];
  const headingStack: { level: number; depth: number }[] = [];
  const sectionDepth = () => (headingStack.length ? headingStack[headingStack.length - 1].depth + 1 : 0);

  const pushRow = (inl: { text: string; marks: ClipMark[] }, depth: number, extra: Partial<ClipRow> = {}): ClipRow | null => {
    let { text, marks } = inl;
    let isCheckbox = extra.isCheckbox ?? false, checked = extra.checked ?? false;
    const g = CLIPST_CHECK_GLYPH_RE.exec(text);
    if (g && text.length > g[0].length) {
      isCheckbox = true;
      checked = !/[☐□❏]/u.test(g[1]);
      const cut = g[0].length;
      text = text.slice(cut);
      marks = marks.map((m) => ({ ...m, s: Math.max(0, m.s - cut), e: m.e - cut })).filter((m) => m.e > m.s);
    }
    if (!text && !(extra.tables && extra.tables.length)) return null;
    const row: ClipRow = { text, marks, depth: Math.max(0, depth), heading: 0, tables: [], ...extra, isCheckbox, checked };
    rows.push(row);
    return row;
  };
  const attachTable = (t: ClipNode, depth: number) => {
    const html = t.outerHTML || '';
    if (!html) return;
    const last = rows[rows.length - 1];
    if (last) last.tables.push(html);
    else rows.push({ text: '', marks: [], depth, heading: 0, isCheckbox: false, checked: false, tables: [html] });
  };

  // Lists hold blocks and blocks hold lists, so these refer to each other; declared here, set below.
  let block: (el: ClipNode) => void = () => {};
  let flushInline: (nodes: ClipNode[]) => void = () => {};

  const list = (el: ClipNode, level: number) => {
    let lastItem: ClipRow | null = null;
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType !== 1 || clipstHidden(c)) continue;
      const tag = clipstTag(c);
      if (tag === 'UL' || tag === 'OL') { list(c, lastItem ? level + 1 : level); continue; }
      if (tag !== 'LI') { block(c); continue; }
      const kids = Array.from(c.childNodes);
      const inlineKids: ClipNode[] = [];
      const later: ClipNode[] = [];
      for (const k of kids) {
        const kt = clipstTag(k);
        if (k.nodeType === 1 && (kt === 'UL' || kt === 'OL' || kt === 'TABLE' || kt === 'PRE')) later.push(k);
        else if (later.length && k.nodeType === 1 && clipstIsBlock(k)) later.push(k);
        else inlineKids.push(k);
      }
      // <li><p>…</p><p>…</p></li> (Word on the web, Google Docs): the paragraphs are one item.
      const inl = clipstInline(inlineKids, {});
      const box = clipstCheckbox(c);
      lastItem = pushRow(inl, sectionDepth() + level, box) ?? lastItem;
      for (const k of later) {
        const kt = clipstTag(k);
        if (kt === 'UL' || kt === 'OL') list(k, level + 1);
        else if (kt === 'TABLE') attachTable(k, sectionDepth() + level);
        else block(k);
      }
    }
  };

  block = (el: ClipNode) => {
    if (el.nodeType === 3) {
      const t = (el.nodeValue ?? '').trim();
      if (t) pushRow(clipstInline([el], {}), sectionDepth());
      return;
    }
    if (el.nodeType !== 1) return;
    const tag = clipstTag(el);
    if (CLIPST_SKIP_TAGS.has(tag) || clipstHidden(el) || tag === 'HR') return;
    const st = clipstStyle(el);
    const h = /^H([1-6])$/.exec(tag);
    if (h) {
      const level = +h[1];
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
      const depth = headingStack.length ? headingStack[headingStack.length - 1].depth + 1 : 0;
      const size = Math.min(3, headingStack.length + 1);
      const r = pushRow(clipstInline(Array.from(el.childNodes), {}), depth, { heading: size });
      if (r) headingStack.push({ level, depth });
      return;
    }
    if (tag === 'UL' || tag === 'OL') { list(el, 0); return; }
    if (tag === 'TABLE') { attachTable(el, sectionDepth()); return; }
    // Word's list paragraph: its level is in the style ("mso-list:l0 level2 lfo1").
    const wl = /mso-list\s*:\s*l\d+\s+level(\d+)/.exec(st);
    if (wl) {
      const inl = clipstInline(Array.from(el.childNodes), {});
      // Word's own bullet/number text, when it wasn't marked mso-list:Ignore.
      const lead = /^(?:[·•o§▪▫■□\-–]|\d{1,3}[.)]|[a-zA-Z][.)]|[ivxIVX]{1,5}[.)])\s+/.exec(inl.text);
      if (lead) {
        const cut = lead[0].length;
        inl.text = inl.text.slice(cut);
        inl.marks = inl.marks.map((m) => ({ ...m, s: Math.max(0, m.s - cut), e: m.e - cut })).filter((m) => m.e > m.s);
      }
      pushRow(inl, sectionDepth() + Math.max(0, +wl[1] - 1));
      return;
    }
    const kids = Array.from(el.childNodes);
    if (kids.some((k) => clipstIsBlock(k))) {
      // A container: its own loose text and its blocks, in order.
      let buf: ClipNode[] = [];
      const flush = () => { if (buf.length) { flushInline(buf); buf = []; } };
      for (const k of kids) {
        if (k.nodeType === 1 && clipstIsBlock(k)) { flush(); block(k); }
        else buf.push(k);
      }
      flush();
      return;
    }
    flushInline(kids);
  };

  /** Inline content with <br> line breaks: each line its own row. */
  flushInline = (nodes: ClipNode[]) => {
    let part: ClipNode[] = [];
    const out = () => { const inl = clipstInline(part, {}); if (inl.text) pushRow(inl, sectionDepth()); part = []; };
    for (const n of nodes) {
      if (n.nodeType === 1 && clipstTag(n) === 'BR') out();
      else part.push(n);
    }
    out();
  };

  for (const c of Array.from(root.childNodes)) {
    const tag = clipstTag(c);
    // Google Docs wraps the whole copy in <b style="font-weight:normal" id="docs-internal-guid-…">.
    if (c.nodeType === 1 && tag === 'B' && /font-weight\s*:\s*normal/.test(clipstStyle(c)) && Array.from(c.childNodes).some((k) => clipstIsBlock(k))) {
      for (const k of Array.from(c.childNodes)) block(k);
      continue;
    }
    block(c);
  }
  return rows;
}

/** Words of 2+ letters/digits, for the "never fewer words than the plain reading" check. */
export function clipWordCount(text: string): number {
  return (String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*[\p{L}\p{N}]|\p{N}/gu) || []).length;
}
