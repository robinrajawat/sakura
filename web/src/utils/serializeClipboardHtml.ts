import type { QueryableNode } from '../core/nodeQueries';
import type { CharFormat, RowMark, RowMarksHolder } from './rowMarks';

/**
 * Export domain — third slice. `serializeClipboardHtml` renders the rich-text (HTML) half of
 * copy-to-clipboard — the `text/html` clipboard item `copyNodesToClipboard` writes alongside
 * `serializeTreeText`'s plain-text version.
 *
 * Investigated as a whole before scoping, per the doc's own "investigate before assuming"
 * lesson: an earlier status note lumped this together with `serializeTreeTextWithNotes` as
 * "DOM-dependent via `stripHtmlToText`" — wrong for this function specifically.
 * `serializeClipboardHtml` never calls `stripHtmlToText` at all; tracing its real dependencies
 * (`getClipboardExportColors`, `depthTextColor`, `soften`, `parseStyledTextForClipboard`) finds
 * zero DOM calls anywhere in the chain — every one is plain string/math manipulation. All four
 * are included in this slice since they exist for no purpose other than this call chain (the
 * image export and decision-log cards that once also called `soften`/`getClipboardExportColors`
 * have since been removed).
 *
 * `buildPrefix`/`hasLaterSiblingAtDepth` (from `src/core/nodeQueries.ts`), `computeOutlineNumbers`
 * (from `src/utils/computeOutlineNumbers.ts`), and `escapeHtml` (from `src/utils/escapeHtml.ts`) are
 * already generated elsewhere and referenced as ambient globals via `declare function` — the
 * `esc()` hand-written one-liner wrapping `escapeHtml` is bypassed the same way `escAttr` was in
 * the since-removed `serializeOpml.ts` slice, calling `escapeHtml` directly instead.
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

// From src/utils/rowMarks.ts (formatting on part of a row), also already generated.
declare function rowMarksOf(node: RowMarksHolder | null | undefined): RowMark[];
declare function rowMarksToHtml(
  text: string,
  marks: unknown,
  renderText: (s: string) => string,
  wrap?: (html: string, f: CharFormat) => string
): string;

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
    hlYellow: '#eab308',
    hlGreen: '#22c55e',
    hlBlue: '#0ea5e9',
    hlPink: '#ec4899',
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

/** Renders one run of a row's text for the clipboard: HTML-escaped words. Typed markup
 * (`**bold**`, `__italic__`, `[Section]`) no longer formats anything (owner, 2026-10-22: rows are
 * rich text); formatting comes from the row's marks (`clipboardRowMarkTags`). `colors` is kept
 * so every renderer of a run has the same shape. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function parseStyledTextForClipboardCore(text: string, colors: ClipboardColors): string {
  return escapeHtml(String(text || ''));
}

/** Formatting on part of a row (node.marks), as inline styles another app keeps when pasted:
 * fixed light-mode text colours, and highlights mixed toward white the way the app shows them. */
export function clipboardRowMarkTags(html: string, f: CharFormat, colors: ClipboardColors): string {
  let out = html;
  if (f.b) out = '<b>' + out + '</b>';
  if (f.i) out = '<i>' + out + '</i>';
  if (f.u) out = '<u>' + out + '</u>';
  if (f.s) out = '<s>' + out + '</s>';
  const pick = (prefix: 'fc' | 'hl', name: string) =>
    (colors as Record<string, string>)[prefix + name.charAt(0).toUpperCase() + name.slice(1)];
  const fc = f.c ? pick('fc', f.c) : '';
  if (fc) out = `<span style="color:${fc};">` + out + '</span>';
  const hl = f.hl ? pick('hl', f.hl) : '';
  if (f.a) out = `<a href="${escapeHtml(f.a).replace(/"/g, '&quot;')}">` + out + '</a>';
  if (hl) out = `<span style="background:${softenCore(hl, '#ffffff', 0.45)};">` + out + '</span>';
  return out;
}

/** The subset of a real outline node `serializeClipboardHtmlCore` reads. `styles` is loose on
 * purpose — a node without any of these flags set is the common case, matching the original's
 * defensive `node.styles.bold?...` handling. */
export interface ClipboardNode extends QueryableNode, RowMarksHolder {
  styles: { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean };
}

/** Pure: matches index.html's own `serializeClipboardHtml` exactly — renders `scopeNodes` as a
 * self-contained HTML document (the `text/html` clipboard payload `copyNodesToClipboard` writes
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
      return `<div style="font-family:Consolas,'Courier New',monospace; white-space:pre; color:${colors.muted}; margin:2px 0;"><span style="color:${softenCore(colors.vert, colors.muted)};opacity:0.35;letter-spacing:-0.5px;font-weight:500;">${prefixHtml}</span>${numHtml}<span style="${textStyle}">${rowMarksToHtml(node.text || '', rowMarksOf(node), (t) => parseStyledTextForClipboardCore(t, colors), (h, f) => clipboardRowMarkTags(h, f, colors)) || '&nbsp;'}</span></div>`;
    })
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="background:#ffffff;padding:12px;border-radius:8px;">${rows}</body></html>`;
}
