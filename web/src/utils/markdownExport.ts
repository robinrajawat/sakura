/**
 * Markdown export (owner 2026-11-19, spec: docs/markdown-plan.md). Turns the open document into one
 * `.md` file that other notes apps open, and that markdownImport.ts reads back to the same rows.
 *
 * `mdSerializeDocument` is pure. `mdFromNoteHtml` and `mdTableToGrid` read already-sanitized HTML
 * through the DOM element the caller passes in (index.html parses with DOMParser; tests use
 * happy-dom), and never write HTML anywhere. Wired via scripts/generate-index-blocks.mjs's
 * `markdownExport` block; `exportMarkdown` in index.html gathers the rows and downloads the file.
 */

export interface MdExportMark {
  s: number;
  e: number;
  k: string;
  v?: string;
}

export interface MdExportRow {
  text: string;
  marks?: MdExportMark[];
  depth: number;
  heading?: number;
  isCheckbox?: boolean;
  checked?: boolean;
  /** The note as Markdown (from mdFromNoteHtml), '' when none. */
  noteMd?: string;
  /** Each table as rows of cell text (from mdTableToGrid). */
  tables?: string[][][];
  /** One-line mentions of what Markdown can't hold: "Picture: Floor plan", "Diagram: Flow". */
  mentions?: string[];
}

// ---------------------------------------------------------------------------------------------
// Escaping

/** Escapes characters Markdown would read as formatting, so the words come out as typed. */
export function mdEscape(text: string, opts: { lineStart?: boolean; inTable?: boolean } = {}): string {
  let out = text.replace(/[\\`*_[\]<>~]/g, (c) => '\\' + c);
  if (opts.inTable) out = out.replace(/\|/g, '\\|');
  if (opts.lineStart) {
    out = out.replace(/^(\s*)([#>+=-])/, '$1\\$2').replace(/^(\s*\d+)([.)])/, '$1\\$2');
  }
  return out;
}

function mdSafeUrl(url: string): string | null {
  const u = String(url || '').trim();
  if (!/^(https?:\/\/|mailto:)/i.test(u)) return null;
  return u.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

// ---------------------------------------------------------------------------------------------
// Inline: words + marks → Markdown

const MD_EMPH_ORDER = ['b', 's', 'i'] as const;
const MD_EMPH_DELIM: Record<string, string> = { b: '**', s: '~~', i: '*' };

/** Renders text with bold, italic, strikethrough and web links; other marks keep only their words. */
export function mdInline(text: string, marks: MdExportMark[] = [], lineStart = false): string {
  const n = text.length;
  if (!n) return '';
  const fmt: { b?: boolean; i?: boolean; s?: boolean; a?: string }[] = Array.from({ length: n }, () => ({}));
  for (const m of marks) {
    const s = Math.max(0, Math.min(n, m.s)), e = Math.max(0, Math.min(n, m.e));
    for (let j = s; j < e; j++) {
      if (m.k === 'b' || m.k === 'i' || m.k === 's') fmt[j][m.k] = true;
      else if (m.k === 'a') {
        const u = mdSafeUrl(m.v || '');
        if (u) fmt[j].a = u;
      }
    }
  }
  // Spaces never carry emphasis (`** x**` isn't bold in Markdown); the words around them do.
  for (let j = 0; j < n; j++) if (/\s/.test(text[j])) { fmt[j].b = false; fmt[j].i = false; fmt[j].s = false; }

  // Split into link groups, then render emphasis inside each with proper nesting.
  let out = '';
  let j = 0;
  while (j < n) {
    const link = fmt[j].a;
    let k = j;
    while (k < n && fmt[k].a === link) k++;
    const inner = mdRenderEmphasis(text, fmt, j, k, lineStart && j === 0 && !link);
    out += link ? '[' + inner + '](' + link + ')' : inner;
    j = k;
  }
  return out;
}

function mdRenderEmphasis(text: string, fmt: { b?: boolean; i?: boolean; s?: boolean }[], from: number, to: number, lineStart: boolean): string {
  let out = '';
  const stack: string[] = [];
  for (let j = from; j <= to; j++) {
    const want = new Set<string>(j < to ? MD_EMPH_ORDER.filter((k) => fmt[j][k]) : []);
    // Close from the top until everything still open is wanted, then open what's missing.
    let keep = 0;
    while (keep < stack.length && want.has(stack[keep])) keep++;
    for (let c = stack.length - 1; c >= keep; c--) out += MD_EMPH_DELIM[stack[c]];
    stack.length = keep;
    for (const k of MD_EMPH_ORDER) if (want.has(k) && !stack.includes(k)) { stack.push(k); out += MD_EMPH_DELIM[k]; }
    if (j < to) out += mdEscape(text[j], { lineStart: lineStart && j === from && !stack.length });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Notes and tables (read through a DOM element the caller provides)

interface ElLike {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<ElLike>;
  getAttribute?: (n: string) => string | null;
}

const MD_BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'PRE', 'BLOCKQUOTE', 'TABLE', 'SECTION', 'ARTICLE', 'FIGURE']);

function mdInlineFromDom(node: ElLike, inherit: { b?: boolean; i?: boolean; s?: boolean; a?: string } = {}): { text: string; marks: MdExportMark[] } {
  let text = '';
  const marks: MdExportMark[] = [];
  const walk = (n: ElLike, f: typeof inherit) => {
    if (n.nodeType === 3) {
      const t = (n.textContent || '').replace(/\s+/g, ' ');
      const s = text.length;
      text += t;
      if (f.b) marks.push({ s, e: text.length, k: 'b' });
      if (f.i) marks.push({ s, e: text.length, k: 'i' });
      if (f.s) marks.push({ s, e: text.length, k: 's' });
      if (f.a) marks.push({ s, e: text.length, k: 'a', v: f.a });
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.nodeName.toUpperCase();
    if (tag === 'BR') { text += ' '; return; }
    if (tag === 'IMG') return;
    const g = { ...f };
    if (tag === 'B' || tag === 'STRONG') g.b = true;
    if (tag === 'I' || tag === 'EM') g.i = true;
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') g.s = true;
    if (tag === 'A' && n.getAttribute) { const h = n.getAttribute('href'); if (h && mdSafeUrl(h)) g.a = h; }
    for (const c of Array.from(n.childNodes)) walk(c, g);
  };
  for (const c of Array.from(node.childNodes)) walk(c, inherit);
  return { text, marks };
}

function mdTrimInline(r: { text: string; marks: MdExportMark[] }): { text: string; marks: MdExportMark[] } {
  const lead = r.text.length - r.text.replace(/^\s+/, '').length;
  const text = r.text.trim();
  return { text, marks: r.marks.map((m) => ({ ...m, s: m.s - lead, e: m.e - lead })) };
}

/**
 * A note's HTML as Markdown paragraphs. Each line of the note becomes its own paragraph; list items
 * become "• " / "1. " paragraphs (not Markdown lists, which under a list item would read back as
 * child rows); preformatted text becomes a fenced code block.
 */
export function mdFromNoteHtml(root: ElLike): string {
  const paras: string[] = [];
  let inlineBuf: ElLike[] = [];
  const pushInline = (nodes: ElLike[]) => {
    const fake: ElLike = { nodeType: 1, nodeName: 'SPAN', textContent: '', childNodes: nodes };
    // Split on <br> so each visible line stays its own paragraph.
    let part: ElLike[] = [];
    const flush = () => {
      const r = mdTrimInline(mdInlineFromDom({ ...fake, childNodes: part }));
      if (r.text) paras.push(mdInline(r.text, r.marks, true));
      part = [];
    };
    for (const n of Array.from(fake.childNodes)) {
      if (n.nodeType === 1 && n.nodeName.toUpperCase() === 'BR') flush();
      else part.push(n);
    }
    flush();
  };
  const flushInline = () => { if (inlineBuf.length) pushInline(inlineBuf); inlineBuf = []; };
  const block = (n: ElLike, listPrefix?: string) => {
    const tag = n.nodeName.toUpperCase();
    if (tag === 'PRE') {
      const code = (n.textContent || '').replace(/\n$/, '');
      let fence = '```';
      while (code.includes(fence)) fence += '`';
      paras.push(fence + '\n' + code + '\n' + fence);
      return;
    }
    if (tag === 'UL' || tag === 'OL') {
      let idx = 1;
      for (const li of Array.from(n.childNodes)) {
        if (li.nodeType === 1 && li.nodeName.toUpperCase() === 'LI') block(li, tag === 'OL' ? idx++ + '. ' : '• ');
      }
      return;
    }
    if (tag === 'TABLE') {
      for (const row of mdTableToGrid(n)) if (row.some((c) => c)) paras.push(mdEscape(row.join(' | '), { lineStart: true }));
      return;
    }
    // Paragraph-like: its inline content, with nested blocks handled in order.
    const kids = Array.from(n.childNodes);
    const hasBlocks = kids.some((c) => c.nodeType === 1 && MD_BLOCK_TAGS.has(c.nodeName.toUpperCase()));
    const isHeading = /^H[1-6]$/.test(tag);
    if (!hasBlocks && !listPrefix && !isHeading) {
      pushInline(kids);
      return;
    }
    if (!hasBlocks) {
      const r = mdTrimInline(mdInlineFromDom(n, isHeading ? { b: true } : {}));
      if (r.text) {
        const body = mdInline(r.text, r.marks, !listPrefix);
        paras.push(listPrefix ? (/^\d/.test(listPrefix) ? listPrefix.replace('.', '\\.') : listPrefix) + body : body);
      }
      return;
    }
    let buf: ElLike[] = [];
    for (const c of kids) {
      if (c.nodeType === 1 && MD_BLOCK_TAGS.has(c.nodeName.toUpperCase())) {
        if (buf.length) { pushInline(buf); buf = []; }
        block(c);
      } else buf.push(c);
    }
    if (buf.length) pushInline(buf);
  };
  for (const c of Array.from(root.childNodes)) {
    if (c.nodeType === 1 && MD_BLOCK_TAGS.has(c.nodeName.toUpperCase())) { flushInline(); block(c); }
    else inlineBuf.push(c);
  }
  flushInline();
  return paras.join('\n\n');
}

/** A table element's cells as text, row by row; merged and multi-line cells flatten to one line. */
export function mdTableToGrid(table: ElLike): string[][] {
  const rows: string[][] = [];
  const visit = (n: ElLike) => {
    const tag = n.nodeName.toUpperCase();
    if (tag === 'TR') {
      const cells: string[] = [];
      for (const c of Array.from(n.childNodes)) {
        const t = c.nodeName.toUpperCase();
        if (c.nodeType === 1 && (t === 'TD' || t === 'TH')) cells.push((c.textContent || '').replace(/\s+/g, ' ').trim());
      }
      rows.push(cells);
      return;
    }
    for (const c of Array.from(n.childNodes)) if (c.nodeType === 1) visit(c);
  };
  visit(table);
  return rows;
}

export function mdGridToTable(grid: string[][]): string[] {
  const rows = grid.filter((r) => r.length);
  if (!rows.length) return [];
  const cols = Math.max(...rows.map((r) => r.length));
  const cell = (c: string | undefined) => mdEscape(c ?? '', { inTable: true }) || ' ';
  const line = (r: string[]) => '| ' + Array.from({ length: cols }, (_, j) => cell(r[j])).join(' | ') + ' |';
  return [line(rows[0]), '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |', ...rows.slice(1).map(line)];
}

// ---------------------------------------------------------------------------------------------
// The document

/**
 * The whole document as Markdown. Rows with a heading style whose ancestors are all headings
 * become `##`… headings (the title is `#`); every other row is a `- ` list item under its nearest
 * heading. Notes, tables and mentions follow their row: indented under a list item, plain under a
 * heading.
 */
export function mdSerializeDocument(title: string, rows: MdExportRow[]): string {
  const out: string[] = ['# ' + mdInline((title || 'Untitled').trim() || 'Untitled', [], true), ''];
  const headingAt: boolean[] = []; // per depth: is the open row at this depth a heading block?
  const headingDepth: number[] = []; // per depth: depth of the nearest heading block at or above
  let prevWasList = false;

  const blank = () => { if (out[out.length - 1] !== '') out.push(''); };
  const blocksFor = (r: MdExportRow): string[] => {
    const b: string[] = [];
    if (r.noteMd && r.noteMd.trim()) b.push(...r.noteMd.split('\n'), '');
    for (const t of r.tables || []) { const md = mdGridToTable(t); if (md.length) b.push(...md, ''); }
    for (const m of r.mentions || []) b.push('*\\[' + mdEscape(m) + '\\]*', '');
    while (b.length && b[b.length - 1] === '') b.pop();
    return b;
  };

  for (const r of rows) {
    const depth = Math.max(0, Math.floor(r.depth || 0));
    headingAt.length = depth;
    headingDepth.length = depth;
    const parentIsHeading = depth === 0 || headingAt[depth - 1] === true;
    const isHeading = !!r.heading && r.heading > 0 && parentIsHeading;
    headingAt[depth] = isHeading;
    headingDepth[depth] = isHeading ? depth : depth > 0 ? headingDepth[depth - 1] : -1;
    const blocks = blocksFor(r);

    if (isHeading) {
      blank();
      out.push('#'.repeat(Math.min(6, depth + 2)) + ' ' + mdInline(r.text, r.marks));
      if (blocks.length) { out.push(''); out.push(...blocks); }
      out.push('');
      prevWasList = false;
      continue;
    }
    const base = depth > 0 ? headingDepth[depth - 1] + 1 : 0;
    const indent = '  '.repeat(Math.max(0, depth - base));
    if (!prevWasList) blank();
    const box = r.isCheckbox ? (r.checked ? '[x] ' : '[ ] ') : '';
    // A row whose words would read as a task box or a list marker gets its first character escaped.
    const body = mdInline(r.text, r.marks, true);
    out.push(indent + '- ' + box + (box ? body : body.replace(/^\[([ xX])\]/, '\\[$1\\]')));
    if (blocks.length) {
      out.push('');
      for (const l of blocks) out.push(l ? indent + '  ' + l : '');
      out.push('');
    }
    prevWasList = true;
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n') + '\n';
}
