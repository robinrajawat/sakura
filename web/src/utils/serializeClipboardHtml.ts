import type { QueryableNode } from '../core/nodeQueries';

/**
 * Export domain — third slice. `serializeClipboardHtml` renders the rich-text (HTML) half of
 * copy-to-clipboard — the `text/html` clipboard item `exportToClipboard` writes alongside
 * `serializeTreeText`'s plain-text version.
 *
 * Investigated as a whole before scoping, per the doc's own "investigate before assuming"
 * lesson: an earlier status note lumped this together with `serializeTreeTextWithNotes` as
 * "DOM-dependent via `stripHtmlToText`" — wrong for this function specifically.
 * `serializeClipboardHtml` never calls `stripHtmlToText` at all; tracing its real dependencies
 * (`getClipboardExportColors`, `depthTextColor`, `soften`, `parseStyledTextForClipboard`) finds
 * zero DOM calls anywhere in the chain — every one is plain string/math manipulation. All four
 * are included in this slice since they exist for no purpose other than this call chain, except
 * `soften`/`getClipboardExportColors`, which turn out to already be reused by several other
 * hand-written call sites elsewhere (image export, decision-log card rendering) — extracting
 * them doesn't touch those call sites, since every generated block is available as an ambient
 * global to hand-written code exactly the same way it is to other generated blocks.
 *
 * `buildPrefix`/`hasLaterSiblingAtDepth` (from `src/core/nodeQueries.ts`), `computeOutlineNumbers`
 * (from `src/utils/serializeMarkdown.ts`), and `escapeHtml` (from `src/utils/escapeHtml.ts`) are
 * already generated elsewhere and referenced as ambient globals via `declare function` — the
 * `esc()` hand-written one-liner wrapping `escapeHtml` is bypassed the same way `escAttr` was in
 * `serializeOpml.ts`'s own slice, calling `escapeHtml` directly instead.
 *
 * `treeIndentWidth`/`hideTreeLines`/`outlineNumbering` are promoted to explicit required
 * parameters, same "no silent default for a live user-preference toggle" reasoning this domain's
 * first two slices already established.
 */

declare function buildPrefix(
  scopedNodes: QueryableNode[],
  idx: number,
  treeIndentWidth: number,
  depthOffset?: number
): { vert: string; conn: string };

declare function computeOutlineNumbers(list: QueryableNode[], outlineNumbering: boolean): string[];

declare function escapeHtml(value: unknown): string;

/** Fixed light-mode palette for anything copied to the system clipboard as rich text. Paste
 * destinations (email, Slack, Word, Notion...) are almost always light-background regardless of
 * Sakura's own theme, and most don't honor a background color set on the copied HTML — so text
 * colors pulled from a dark theme come out unreadable once pasted onto a light background.
 * Deliberately theme-independent: always light, never reads the app's live `currentTheme`. */
export function getClipboardExportColorsCore() {
  return {
    fg: '#1a1a1a',
    muted: '#6b7280',
    vert: '#9ca3af',
    conn: '#c96442',
    semSection: '#2563eb',
    semAlert: '#dc2626',
    semCode: '#7c3aed',
    semQuote: '#6b6240',
    codeBg: '#f3f4f6',
    fcRed: '#c0392b',
    fcOrange: '#c2701d',
    fcGreen: '#27824f',
    fcBlue: '#2766c2',
    fcPurple: '#7d3fb5',
    fcGray: '#6f6b63',
  };
}

export type ClipboardColors = ReturnType<typeof getClipboardExportColorsCore>;

/** Pure: mixes `base` toward `color` by `ratio` (0 = pure `base`, 1 = pure `color`) in RGB
 * space, returning an `rgb(...)` string. Falls back to whichever of `color`/`base` parses as a
 * valid `#rgb`/`#rrggbb` hex color (or `'#777'` if neither does) when the other doesn't parse. */
export function softenCore(color: string | null | undefined, base: string | null | undefined, ratio = 0.35): string {
  const toRgb = (v: string | null | undefined) => {
    const s = String(v || '').trim();
    const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const c = toRgb(color);
  const b = toRgb(base);
  if (!c || !b) return color || base || '#777';
  const mix = (x: number, y: number) => Math.round(y * (1 - ratio) + x * ratio);
  return `rgb(${mix(c.r, b.r)}, ${mix(c.g, b.g)}, ${mix(c.b, b.b)})`;
}

/** Pure: matches index.html's own `depthTextColor` exactly — a node's base text color fades
 * from `fg` at depth 0/negative toward `muted` as depth increases (68% muted at depth 1, 38% at
 * depth 2, fully `muted` from depth 3 on). */
export function depthTextColorCore(depth: number, fg: string, muted: string): string {
  if (depth <= 0) return fg;
  if (depth === 1) return softenCore(fg, muted, 0.68);
  if (depth === 2) return softenCore(fg, muted, 0.38);
  return muted;
}

/** Pure: matches index.html's own `parseStyledTextForClipboard` exactly — renders one node's
 * text as clipboard-safe inline HTML, recognizing the same markup the editor itself uses:
 * `**bold**`/`__italic__` spans are rendered as `<b>`/`<i>`, a leading `[Section]` token followed
 * by `= description` renders as a colored label plus a muted description (the "semantic guide"
 * shorthand — the only marker with real structural meaning elsewhere, e.g. the Table of
 * Contents), and any other `[section]` span found anywhere in the text is individually colored,
 * with everything else HTML-escaped plain text. The `(note)`/`!alert`/`` `code` `` markers this
 * once also styled were removed along with their editor-side chip rendering — plain punctuation
 * now, so they're left as ordinary escaped text like anything else. */
export function parseStyledTextForClipboardCore(text: string, colors: ClipboardColors): string {
  const src = String(text || '');
  const softSection = softenCore(colors.semSection, colors.muted);
  const descTone = softenCore(colors.muted, colors.fg);
  const semanticGuide = src.match(/^(\[[^\]]+\])\s*=\s*(.+)$/);
  if (semanticGuide) {
    const token = semanticGuide[1];
    const desc = semanticGuide[2];
    return (
      `<span style="color:${softSection};">${escapeHtml(token.slice(1, -1))}</span>` +
      `<span style="color:${descTone};"> = ${escapeHtml(desc)}</span>`
    );
  }
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        out += `<b>${escapeHtml(src.slice(i + 2, end))}</b>`;
        i = end + 2;
        continue;
      }
    }
    if (ch === '_' && src[i + 1] === '_') {
      const end = src.indexOf('__', i + 2);
      if (end > i + 2) {
        out += `<i>${escapeHtml(src.slice(i + 2, end))}</i>`;
        i = end + 2;
        continue;
      }
    }
    if (ch === '[') {
      const end = src.indexOf(']', i + 1);
      if (end > i + 1) {
        out += `<span style="color:${softSection};">${escapeHtml(src.slice(i + 1, end))}</span>`;
        i = end + 1;
        continue;
      }
    }
    out += escapeHtml(ch);
    i++;
  }
  return out;
}

/** The subset of a real outline node `serializeClipboardHtmlCore` reads. `styles` is loose on
 * purpose — a node without any of these flags set is the common case, matching the original's
 * defensive `node.styles.bold?...` handling. */
export interface ClipboardNode extends QueryableNode {
  styles: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };
}

/** Pure: matches index.html's own `serializeClipboardHtml` exactly — renders `scopeNodes` as a
 * self-contained HTML document (the `text/html` clipboard payload `exportToClipboard` writes
 * alongside `serializeTreeText`'s plain-text version): one `<div>` per node, each showing the
 * same ASCII tree-connector prefix `serializeTreeText` uses (rendered as literal `&nbsp;`-padded
 * text so it survives a paste), an optional outline-number span, and the node's text rendered
 * via `parseStyledTextForClipboard` with bold/italic/underline/strikethrough applied from
 * `node.styles` and its color faded by depth via `depthTextColor`. */
export function serializeClipboardHtmlCore(
  scopeNodes: ClipboardNode[],
  rebaseDepth: boolean,
  outlineNumbering: boolean,
  treeIndentWidth: number,
  hideTreeLines: boolean
): string {
  if (!scopeNodes.length) return '';
  const minDepth = rebaseDepth ? Math.min(...scopeNodes.map((n) => n.depth)) : 0;
  const colors = getClipboardExportColorsCore();
  const numbers = computeOutlineNumbers(scopeNodes, outlineNumbering);
  const rows = scopeNodes
    .map((node, idx) => {
      const p = buildPrefix(scopeNodes, idx, treeIndentWidth, -minDepth);
      if (hideTreeLines) {
        p.vert = p.vert.replace(/[│]/g, ' ');
        p.conn = '';
      }
      const rawPrefix = `${p.vert}${p.conn}`;
      const prefixHtml = escapeHtml(rawPrefix).replace(/ /g, '&nbsp;');
      const numHtml = numbers[idx] ? `<span style="color:${colors.muted};">${escapeHtml(numbers[idx])}&nbsp;</span>` : '';
      const deco = [node.styles.underline ? 'underline' : '', node.styles.strike ? 'line-through' : '']
        .filter(Boolean)
        .join(' ');
      const depth = node.depth || 0;
      const baseColor = depthTextColorCore(depth, colors.fg, colors.muted);
      const textStyle = [
        `color:${baseColor}`,
        node.styles.bold ? 'font-weight:700' : '',
        node.styles.italic ? 'font-style:italic' : '',
        deco ? `text-decoration:${deco}` : '',
      ]
        .filter(Boolean)
        .join(';');
      return `<div style="font-family:Consolas,'Courier New',monospace; white-space:pre; color:${colors.muted}; margin:2px 0;"><span style="color:${softenCore(colors.vert, colors.muted)};opacity:0.35;letter-spacing:-0.5px;font-weight:500;">${prefixHtml}</span>${numHtml}<span style="${textStyle}">${parseStyledTextForClipboardCore(node.text || '', colors) || '&nbsp;'}</span></div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#ffffff;padding:12px;border-radius:8px;">${rows}</body></html>`;
}
