/**
 * Markdown import (owner 2026-11-19, spec: docs/markdown-plan.md). Turns one `.md` file into the
 * rows of a new document. Pure: no DOM, no network, no third-party code. Wired into index.html via
 * scripts/generate-index-blocks.mjs's `markdownImport` block; `importMarkdownText` in index.html
 * builds the rows and sends every note and table through `sakuraSanitizeRichHtml`, like OPML.
 *
 * The bar is "robust": a CommonMark subset (headings, lists, task lists, paragraphs, quotes, fenced
 * code, GitHub tables, inline emphasis/links), and anything outside it comes through as its plain
 * text. Words are never dropped; unmatched emphasis markers stay as typed. Nothing from the file is
 * ever rendered as HTML: tags are reduced to their text, and notes/tables are built here from
 * escaped text only.
 */

import { repairTypedNumbers } from './listNumbers';

export interface MdMark {
  s: number;
  e: number;
  k: 'b' | 'i' | 's' | 'a';
  v?: string;
}

export interface MdRow {
  text: string;
  marks: MdMark[];
  depth: number;
  /** 0 for a plain row, else Sakura's heading size 1..3. */
  heading: number;
  isCheckbox: boolean;
  checked: boolean;
  /** Note HTML built from escaped text only (paragraphs and <pre><code>). '' when none. */
  note: string;
  /** Table HTML in Sakura's own shape (thead/tbody), built from escaped cell text. */
  tables: string[];
  /** Its children came in as a numbered list (`1.` items, or typed "1. 2. 3."; listNumbers.ts). */
  numbered?: boolean;
}

export interface MdImportResult {
  /** From a leading `# Title`, else ''. The caller falls back to the file name. */
  title: string;
  rows: MdRow[];
  /** Something was reduced to plain text (raw HTML, math, footnotes); the caller says so. */
  simplified: boolean;
}

export const MARKDOWN_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

// ---------------------------------------------------------------------------------------------
// Small helpers

function mdEscHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MD_NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function mdDecodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8}|#39);/g, (m, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return MD_NAMED_ENTITIES[body] ?? m;
  });
}

/** Only web and mail links survive as links; anything else keeps its words. */
function mdSafeHref(url: string): string | null {
  const u = url.trim().replace(/^<|>$/g, '');
  return /^(https?:\/\/|mailto:)[^\s]+$/i.test(u) ? u : null;
}

/** Leading whitespace width, tabs counted as 4. */
function mdIndentOf(line: string): number {
  let n = 0;
  for (const ch of line) {
    if (ch === ' ') n++;
    else if (ch === '\t') n += 4 - (n % 4);
    else break;
  }
  return n;
}

function mdStripIndent(line: string, cols: number): string {
  let n = 0, i = 0;
  while (i < line.length && n < cols && (line[i] === ' ' || line[i] === '\t')) {
    n += line[i] === '\t' ? 4 - (n % 4) : 1;
    i++;
  }
  return line.slice(i);
}

// ---------------------------------------------------------------------------------------------
// Inline: text + marks

interface InlineOut {
  text: string;
  marks: MdMark[];
  simplified: boolean;
}

/**
 * Parses one line (or a joined paragraph) of inline Markdown into plain words plus mark ranges.
 * Emphasis needs a matching closer on the same run of text; otherwise the markers stay as typed.
 */
export function mdParseInline(src: string): InlineOut {
  let simplified = false;
  // HTML: comments vanish, <br> becomes a space, other tags are dropped keeping their text.
  let s = src.replace(/(?<!\\)<!--[\s\S]*?-->/g, '');
  if (/(?<!\\)<\/?[A-Za-z][^>]*>/.test(s)) {
    s = s.replace(/(?<!\\)<br\s*\/?>/gi, ' ').replace(/(?<!\\)<(?!https?:|mailto:)\/?[A-Za-z][^>]*>/g, '');
    simplified = true;
  }
  if (/\$\$|\\\(|\\\[|\[\^[^\]]+\]/.test(s)) simplified = true;
  // Wiki links [[Page]] / [[Page|Alias]] → their words.
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, page: string, alias?: string) => alias || page);

  let text = '';
  const marks: MdMark[] = [];
  type Open = { k: 'b' | 'i' | 's'; delim: string; textAt: number };
  const insertLiteral = (pos: number, lit: string) => {
    text = text.slice(0, pos) + lit + text.slice(pos);
    for (const m of marks) {
      if (m.s >= pos) m.s += lit.length;
      if (m.e > pos) m.e += lit.length;
    }
  };
  const open: Open[] = [];
  const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    // Backslash escape of punctuation.
    if (c === '\\' && i + 1 < s.length && /[!-/:-@[-`{-~]/.test(s[i + 1])) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    // Code span: literal, backticks dropped (rows have no code formatting).
    if (c === '`') {
      let run = 1;
      while (s[i + run] === '`') run++;
      const fence = '`'.repeat(run);
      const end = s.indexOf(fence, i + run);
      if (end > -1) {
        let code = s.slice(i + run, end);
        if (code.length > 2 && code[0] === ' ' && code[code.length - 1] === ' ') code = code.slice(1, -1);
        text += code;
        i = end + run;
        continue;
      }
      text += fence;
      i += run;
      continue;
    }
    // Autolink <https://…>.
    if (c === '<') {
      const m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(s.slice(i));
      if (m) {
        const start = text.length;
        text += m[1];
        marks.push({ s: start, e: text.length, k: 'a', v: m[1] });
        i += m[0].length;
        continue;
      }
    }
    // Image ![alt](url) and link [text](url).
    if (c === '[' || (c === '!' && s[i + 1] === '[')) {
      const isImg = c === '!';
      const startBr = isImg ? i + 1 : i;
      const close = mdFindClosingBracket(s, startBr);
      if (close > -1 && s[close + 1] === '(') {
        const parenEnd = mdFindClosingParen(s, close + 1);
        if (parenEnd > -1) {
          const inner = s.slice(startBr + 1, close);
          const target = s.slice(close + 2, parenEnd).trim().replace(/\s+["'(].*$/, '');
          const sub = mdParseInline(inner);
          if (sub.simplified) simplified = true;
          const start = text.length;
          for (const m of sub.marks) marks.push({ ...m, s: m.s + start, e: m.e + start });
          text += sub.text;
          const href = mdSafeHref(target);
          if (href && text.length > start) marks.push({ s: start, e: text.length, k: 'a', v: href });
          i = parenEnd + 1;
          continue;
        }
      }
    }
    // Emphasis / strong / strikethrough.
    if (c === '*' || c === '_' || c === '~') {
      let run = 1;
      while (s[i + run] === c) run++;
      if (c === '~' && run !== 2) {
        text += s.slice(i, i + run);
        i += run;
        continue;
      }
      const before = s[i - 1], after = s[i + run];
      const leftFlanking = after !== undefined && !/\s/.test(after);
      const rightFlanking = before !== undefined && !/\s/.test(before);
      // Intraword underscores (snake_case) are literal.
      const intraword = c === '_' && isWordChar(before) && isWordChar(after);
      let remaining = run;
      // Close: always the innermost open marker of this character, if this run is long enough.
      while (!intraword && remaining > 0 && rightFlanking) {
        let idx = -1;
        for (let j = open.length - 1; j >= 0; j--) if (open[j].delim[0] === c) { idx = j; break; }
        if (idx === -1 || open[idx].delim.length > remaining) break;
        const closed = open.splice(idx);
        const o = closed.shift()!;
        // Markers opened inside it and never closed are literal text: put them back first.
        for (const d of closed.reverse()) insertLiteral(d.textAt, d.delim);
        if (text.length > o.textAt) marks.push({ s: o.textAt, e: text.length, k: o.k });
        remaining -= o.delim.length;
      }
      // Open with whatever is left: ** strong, * emphasis, *** both, ~~ strikethrough.
      if (!intraword && remaining > 0 && leftFlanking) {
        if (c === '~') open.push({ k: 's', delim: '~~', textAt: text.length });
        else {
          if (remaining >= 2) { open.push({ k: 'b', delim: c + c, textAt: text.length }); remaining -= 2; }
          if (remaining >= 2) { open.push({ k: 'b', delim: c + c, textAt: text.length }); remaining -= 2; }
          if (remaining === 1) { open.push({ k: 'i', delim: c, textAt: text.length }); remaining = 0; }
        }
        remaining = 0;
      }
      if (remaining > 0) text += c.repeat(remaining);
      i += run;
      continue;
    }
    text += c;
    i++;
  }
  // Unclosed openers are literal text, in place.
  for (const o of open.reverse()) insertLiteral(o.textAt, o.delim);
  const decoded = mdDecodeWithMarks(text, marks);
  // Leading/trailing spaces (often left by removed tags) go; marks shift with the words.
  const lead = decoded.text.length - decoded.text.replace(/^\s+/, '').length;
  const trimmed = decoded.text.trim();
  const shifted = decoded.marks.map((mk) => ({ ...mk, s: mk.s - lead, e: mk.e - lead }));
  return { text: trimmed, marks: mdNormalizeMarks(shifted, trimmed.length), simplified };
}

function mdFindClosingBracket(s: string, openAt: number): number {
  let depth = 0;
  for (let j = openAt; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '[') depth++;
    else if (s[j] === ']') { depth--; if (depth === 0) return j; }
  }
  return -1;
}

function mdFindClosingParen(s: string, openAt: number): number {
  let depth = 0;
  for (let j = openAt; j < s.length; j++) {
    if (s[j] === '\\') { j++; continue; }
    if (s[j] === '(') depth++;
    else if (s[j] === ')') { depth--; if (depth === 0) return j; }
  }
  return -1;
}

/** Decodes entities while keeping mark offsets on the decoded text. */
function mdDecodeWithMarks(text: string, marks: MdMark[]): { text: string; marks: MdMark[] } {
  if (!text.includes('&')) return { text, marks };
  const map: number[] = [];
  let out = '';
  const re = /&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[a-zA-Z]{2,8}|#39);/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    for (let j = last; j < m.index; j++) { map[j] = out.length; out += text[j]; }
    const dec = mdDecodeEntities(m[0]);
    for (let j = m.index; j < m.index + m[0].length; j++) map[j] = out.length;
    out += dec;
    last = m.index + m[0].length;
  }
  for (let j = last; j < text.length; j++) { map[j] = out.length; out += text[j]; }
  map[text.length] = out.length;
  return { text: out, marks: marks.map((mk) => ({ ...mk, s: map[mk.s], e: map[mk.e] })) };
}

function mdNormalizeMarks(marks: MdMark[], len: number): MdMark[] {
  return marks
    .map((m) => ({ ...m, s: Math.max(0, Math.min(m.s, len)), e: Math.max(0, Math.min(m.e, len)) }))
    .filter((m) => m.e > m.s)
    .sort((a, b) => a.s - b.s || a.e - b.e);
}

// ---------------------------------------------------------------------------------------------
// Blocks

const MD_ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const MD_HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const MD_LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)(.*)$/;
const MD_FENCE_RE = /^([ \t]*)(`{3,}|~{3,})(.*)$/;
const MD_TABLE_DELIM_RE = /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;
const MD_LOGSEQ_PROP_RE = /^[A-Za-z][\w-]*::( |$)/;

function mdSplitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let j = 0; j < t.length; j++) {
    if (t[j] === '\\' && t[j + 1] === '|') { cur += '|'; j++; continue; }
    if (t[j] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += t[j];
  }
  cells.push(cur.trim());
  return cells;
}

function mdCellHtml(md: string): string {
  return mdEscHtml(mdParseInline(md).text);
}

export function mdTableToHtml(header: string[], body: string[][]): string {
  const cols = Math.max(1, header.length);
  const fit = (r: string[]) => Array.from({ length: cols }, (_, j) => r[j] ?? '');
  return (
    '<table><thead><tr>' + fit(header).map((c) => '<th>' + mdCellHtml(c) + '</th>').join('') + '</tr></thead><tbody>' +
    body.map((r) => '<tr>' + fit(r).map((c) => '<td>' + mdCellHtml(c) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table>'
  );
}


/**
 * Turns Markdown text into a title and rows. Never throws on odd input; an empty result means the
 * file had no content.
 */
export function parseMarkdown(input: string): MdImportResult {
  let src = String(input ?? '');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const lines = src.replace(/\r\n?/g, '\n').split('\n');

  const rows: MdRow[] = [];
  let simplified = false;
  let title = '';

  // Headings nest by level; rows outside lists sit one level under the current heading.
  const headingStack: { level: number; depth: number; row: MdRow | null }[] = [];
  const sectionDepth = () => (headingStack.length ? headingStack[headingStack.length - 1].depth + 1 : 0);
  // Open list items: where their marker sits and where their content starts.
  let listStack: { markerIndent: number; contentIndent: number; row: MdRow }[] = [];
  let lastRow: MdRow | null = null;
  // The heading just written, while only its own prose has followed: that prose is its note.
  let headingForNote: MdRow | null = null;
  let para: string[] = [];
  let paraTarget: 'row' | 'note' = 'row';
  let blankSeen = false;

  const newRow = (text: string, depth: number, extra: Partial<MdRow> = {}): MdRow => {
    const inl = mdParseInline(text);
    if (inl.simplified) simplified = true;
    const row: MdRow = { text: inl.text, marks: inl.marks, depth, heading: 0, isCheckbox: false, checked: false, note: '', tables: [], ...extra };
    rows.push(row);
    lastRow = row;
    return row;
  };
  const currentItem = () => (listStack.length ? listStack[listStack.length - 1].row : null);
  const attachTarget = (): MdRow => currentItem() ?? lastRow ?? newRow('', sectionDepth());
  const addNote = (row: MdRow, html: string) => { row.note += html; };

  const flushPara = () => {
    if (!para.length) return;
    const joined = para.map((l) => l.trim()).join(' ');
    para = [];
    if (paraTarget === 'note') {
      const target = attachTarget();
      const inl = mdParseInline(joined);
      if (inl.simplified) simplified = true;
      addNote(target, '<p>' + mdEscHtml(inl.text) + '</p>');
    } else if (headingForNote) {
      const inl = mdParseInline(joined);
      if (inl.simplified) simplified = true;
      if (inl.text) addNote(headingForNote, '<p>' + mdEscHtml(inl.text) + '</p>');
    } else {
      const inl = mdParseInline(joined);
      if (inl.simplified) simplified = true;
      if (inl.text) newRow(joined, sectionDepth());
    }
    paraTarget = 'row';
  };
  const closeLists = () => { listStack = []; };

  let i = 0;
  // Front matter: a --- block at the very top.
  if (/^---[ \t]*$/.test(lines[0] ?? '')) {
    const end = lines.findIndex((l, j) => j > 0 && /^(---|\.\.\.)[ \t]*$/.test(l));
    if (end > 0) i = end + 1;
  }

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    const ind = mdIndentOf(line);
    const inItem = listStack.length > 0 && ind >= listStack[listStack.length - 1].contentIndent;

    if (!line.trim()) {
      flushPara();
      blankSeen = true;
      continue;
    }

    // Logseq block properties (id:: …, collapsed:: true) are not content.
    if (MD_LOGSEQ_PROP_RE.test(line.trim()) && (inItem || lastRow)) { continue; }

    // Fenced code → a monospaced note.
    const fence = MD_FENCE_RE.exec(line);
    if (fence) {
      flushPara();
      const fenceIndent = mdIndentOf(fence[1]);
      const marker = fence[2];
      const code: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        const t = l.trim();
        if (t.startsWith(marker[0].repeat(marker.length)) && /^[`~]+$/.test(t)) break;
        code.push(mdStripIndent(l, fenceIndent));
      }
      i = j; // the closing fence (or the end of the file when unclosed)
      const target = inItem || (listStack.length && fenceIndent > 0) ? currentItem() ?? attachTarget() : attachTarget();
      addNote(target, '<pre><code>' + mdEscHtml(code.join('\n')) + '</code></pre>');
      blankSeen = false;
      continue;
    }

    // GitHub table: a row of cells followed by a delimiter row.
    if (line.includes('|') && i + 1 < lines.length && MD_TABLE_DELIM_RE.test(lines[i + 1]) && lines[i + 1].includes('-') && mdSplitTableRow(lines[i + 1]).length === mdSplitTableRow(line).length) {
      flushPara();
      const header = mdSplitTableRow(line);
      const body: string[][] = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim() || !l.includes('|')) break;
        body.push(mdSplitTableRow(l));
      }
      i = j - 1;
      const target = inItem ? currentItem()! : attachTarget();
      target.tables.push(mdTableToHtml(header, body));
      blankSeen = false;
      continue;
    }

    // Setext heading: a paragraph line underlined with === or ---.
    if (para.length && paraTarget === 'row' && !listStack.length && /^ {0,3}(=+|-+)[ \t]*$/.test(line)) {
      const level = line.trim()[0] === '=' ? 1 : 2;
      const text = para.map((l) => l.trim()).join(' ');
      para = [];
      handleHeading(level, text);
      continue;
    }

    if (MD_HR_RE.test(line) && !inItem) {
      flushPara();
      closeLists();
      blankSeen = false;
      continue;
    }

    const atx = MD_ATX_RE.exec(line);
    if (atx && !inItem) {
      flushPara();
      handleHeading(atx[1].length, atx[2] ?? '');
      continue;
    }

    const li = MD_LIST_RE.exec(line);
    if (li && !(para.length && paraTarget === 'row' && !listStack.length && !blankSeen && /^\d/.test(li[2]) && li[2] !== '1.' && li[2] !== '1)')) {
      flushPara();
      const markerIndent = mdIndentOf(li[1]);
      const contentIndent = markerIndent + li[2].length + Math.max(1, Math.min(li[3].length, 4));
      while (listStack.length && markerIndent < listStack[listStack.length - 1].contentIndent) listStack.pop();
      let content = li[4];
      let isCheckbox = false, checked = false;
      const task = /^\[([ xX])\](?:[ \t]+|$)(.*)$/.exec(content);
      if (task) { isCheckbox = true; checked = task[1] !== ' '; content = task[2]; }
      // A quote marker inside a list item is just text.
      const depth = sectionDepth() + listStack.length;
      // A numbered item numbers its parent's list: the item it sits in, else its heading. A
      // numbered list at the very top of a file has no parent row and comes in as bullets.
      if (/^\d/.test(li[2])) {
        const parent = listStack.length ? listStack[listStack.length - 1].row : headingStack.length ? headingStack[headingStack.length - 1].row : null;
        if (parent) parent.numbered = true;
      }
      headingForNote = null;
      const row = newRow(content, depth, { isCheckbox, checked });
      listStack.push({ markerIndent, contentIndent, row });
      blankSeen = false;
      continue;
    }

    // Quote: the quoted words, Obsidian callout markers dropped.
    if (/^ {0,3}>/.test(line) && !inItem) {
      flushPara();
      closeLists();
      const text = line.replace(/^ {0,3}(>[ \t]?)+/, '').replace(/^\[![A-Za-z]+\][+-]?\s*/, '');
      headingForNote = null;
      if (text.trim()) newRow(text, sectionDepth());
      blankSeen = false;
      continue;
    }

    // Plain text.
    if (listStack.length) {
      const item = currentItem()!;
      if (inItem && blankSeen) {
        // A later paragraph of the same item: its note.
        if (!para.length) paraTarget = 'note';
        para.push(mdStripIndent(line, listStack[listStack.length - 1].contentIndent));
        blankSeen = false;
        continue;
      }
      if (!blankSeen) {
        // Lazy continuation: more words of the item's first paragraph, or of the note being written.
        if (para.length) { para.push(line); continue; }
        const extra = mdParseInline(line.trim());
        if (extra.simplified) simplified = true;
        const start = item.text.length + (item.text ? 1 : 0);
        item.text = item.text ? item.text + ' ' + extra.text : extra.text;
        for (const m of extra.marks) item.marks.push({ ...m, s: m.s + start, e: m.e + start });
        continue;
      }
      // Unindented text after a blank line ends the list.
      closeLists();
    }
    if (!para.length) paraTarget = 'row';
    para.push(line);
    blankSeen = false;
  }
  flushPara();
  // Numbers typed into the words ("1. Step", "2. Step") become a real numbered list.
  repairTypedNumbers(rows);

  function handleHeading(level: number, rawText: string) {
    closeLists();
    const text = rawText.trim();
    // A leading H1 before any content is the document's title.
    if (level === 1 && !title && !rows.length && !headingStack.length) {
      const inl = mdParseInline(text);
      if (inl.simplified) simplified = true;
      title = inl.text.trim();
      if (title) { headingForNote = null; return; }
    }
    while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
    const depth = headingStack.length ? headingStack[headingStack.length - 1].depth + 1 : 0;
    // Size by nesting: a top-level heading is Heading 1 whatever its #-level.
    const size = Math.min(3, headingStack.length + 1);
    headingForNote = newRow(text, depth, { heading: size });
    headingStack.push({ level, depth, row: headingForNote });
    blankSeen = false;
  }

  return { title, rows, simplified };
}

