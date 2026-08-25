/**
 * `parseTextToTreeNodesCore` — direct line-for-line port of legacy's real `parseTextToTreeNodes`
 * (legacy/index.html:20944), the general-purpose "plain/bulleted/tree-connector text → depth
 * hierarchy" heuristic parser. §6.9 (docs/phase6-full-parity-plan.md) needs this for Generate
 * Outline and Restructure Text (both parse the AI's own nested-list response with it, and
 * Restructure Text's `looksAlreadyStructuredCore` skips the AI entirely when this parser alone
 * is already enough). Legacy also reuses the same function for clipboard-paste-a-tree and a
 * Word-import structure-detection fallback — neither of those call sites is wired to this port
 * yet (clipboard paste isn't built in `web/` at all; Word import's own AI/tree-connector
 * fallback is a documented, separately-scoped gap per `utils/parseDocxHtml.ts`'s own header).
 *
 * The algorithm in two passes:
 * 1. Walk every non-blank line, classifying it as a real content row (bullet/numbered/lettered/
 *    roman-numeral prefix optionally stripped, a checkbox marker optionally stripped, leading
 *    tree-connector glyphs (`│┃├└┣┗┠┝┞┢┡┟─━`) converted to equivalent whitespace) or as
 *    something to skip/fold in: a separator line (`---`, `···`, etc.), a "branch line with no
 *    label" (just a connector, e.g. a bare `├──`) which instead marks the NEXT real line as one
 *    level deeper via `pendingIndentWidth`, or — only once the text is confirmed to use tree
 *    connectors at all — a genuine wrapped-continuation line (no recognizable prefix at all)
 *    that gets appended onto the previous row's own text rather than becoming a new row.
 * 2. Convert each row's raw `indentWidth` (tabs counted as 2 spaces) into a real `depth` via a
 *    monotonic stack (a line only deepens relative to the nearest-shallower row seen so far, an
 *    inconsistently-indented input still produces a sane hierarchy rather than garbage), then
 *    normalizes so the shallowest row present ends up at depth 0.
 *
 * Deliberately returns only `{text, depth}[]` — legacy's own version also carries a `styles`
 * field, but every row it ever produces uses the same untouched default (`emptyStyles()`), so
 * there's no real per-row variation to preserve; callers apply `defaultNodeStyles()` themselves
 * when building real `OutlineNode` objects, avoiding a pointless empty-styles-in, empty-styles-
 * out round trip through a ported `emptyStyles`/`normalizeStyles` pair with nothing to normalize.
 */

export interface ParsedTreeRow {
  text: string;
  depth: number;
}

const BULLET_RE = /^(?:[-*+•●◦▪▫■□‣⁃◉○→➜➝➞]|(?:\d+|[A-Za-z]|[ivxlcdmIVXLCDM]+)[.)])\s+/;
const SEP_RE = /^[\s\-–—_=~•●▪▫■□⋯·.]{3,}$/;
const TREE_CONNECTOR_RE = /[│┃├└┣┗┠┝┞┢┡┟─━]/;
const BRANCH_CHAR_RE = /[├└┣┗┠┝┞┢┡┟]/;
const NO_PREFIX_RE = /^[\t \u00a0\u2000-\u200b\u202f\u205f\u3000│┃├└┣┗┠┝┞┢┡┟─━]/;
const CHECKBOX_LEAD_RE = /^(?:\[(?: |x|X)\]|☐|☑|✅|✓)\s+/;

interface ParseRow {
  text: string;
  indentWidth: number;
}

export function parseTextToTreeNodesCore(text: string): ParsedTreeRow[] {
  const rawLines = String(text || '')
    .replace(/\r/g, '')
    .split('\n');
  const hasTreeConnectors = rawLines.some((l) => TREE_CONNECTOR_RE.test(l));

  const rows: ParseRow[] = [];
  let pendingIndentWidth: number | null = null;

  for (const raw of rawLines) {
    if (!raw || !raw.trim()) continue;
    let line = raw.replace(/\u00a0/g, ' ').replace(/[\u2000-\u200b\u202f\u205f\u3000]/g, ' ');
    const isNoPrefixLine = !NO_PREFIX_RE.test(line);

    if (hasTreeConnectors && rows.length && isNoPrefixLine && !BULLET_RE.test(line.trim()) && !CHECKBOX_LEAD_RE.test(line.trim())) {
      if (pendingIndentWidth !== null) {
        const label = line.trim();
        if (label) rows.push({ text: label, indentWidth: pendingIndentWidth });
        pendingIndentWidth = null;
        continue;
      }
      rows[rows.length - 1].text = (rows[rows.length - 1].text + ' ' + line.trim()).trim();
      continue;
    }

    const strippedForBranch = line;
    line = line.replace(/[│┃]/g, '  ').replace(/[├└┣┗┠┝┞┢┡┟]/g, ' ').replace(/[─━]/g, ' ');
    if (SEP_RE.test(line.trim())) {
      pendingIndentWidth = null;
      continue;
    }

    const m = line.match(/^[\t ]*/);
    const indentRaw = (m ? m[0] : '').replace(/\t/g, '  ');
    const indentWidth = indentRaw.length;
    let label = line.slice((m ? m[0] : '').length).trim();
    label = label.replace(BULLET_RE, '').trim();
    label = label
      .replace(/^\[(?: |x|X)\]\s+/, '')
      .replace(/^(?:☐|☑|✅|✓)\s+/, '')
      .trim();

    if (!label) {
      pendingIndentWidth = BRANCH_CHAR_RE.test(strippedForBranch) ? indentWidth + 1 : null;
      continue;
    }
    pendingIndentWidth = null;
    rows.push({ text: label, indentWidth });
  }

  if (!rows.length) return [];

  const stack: { width: number; depth: number }[] = [{ width: -1, depth: -1 }];
  const out: ParsedTreeRow[] = [];
  rows.forEach((row) => {
    while (stack.length > 1 && row.indentWidth <= stack[stack.length - 1].width) stack.pop();
    const depth = stack[stack.length - 1].depth + 1;
    stack.push({ width: row.indentWidth, depth });
    out.push({ text: row.text, depth });
  });

  const minDepth = Math.min(...out.map((n) => n.depth));
  return out.map((n) => ({ text: n.text, depth: n.depth - minDepth }));
}

/** Pure: matches legacy's real `looksAlreadyStructured` (legacy/index.html:29399-29406) exactly
 * — a cheap, free, instant check for "does this text already encode a hierarchy" (literal
 * tree-connector glyphs, or at least two distinct indentation widths actually present), so
 * Restructure Text can skip the AI call entirely and hand off straight to
 * `parseTextToTreeNodesCore` when it's true. Bullet characters alone are deliberately NOT
 * sufficient on their own (see legacy's own comment, preserved in `state/aiCapabilities.ts`'s
 * Restructure wiring): a bulleted list with every line at the same indentation carries no depth
 * signal this heuristic parser can use. */
export function looksAlreadyStructuredCore(text: string): boolean {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.replace(/\t/g, '  '))
    .filter((l) => l.trim());
  if (lines.length < 2) return false;
  const indentWidths = new Set(lines.map((l) => (l.match(/^[\t ]*/) || [''])[0].length));
  const hasConnectors = lines.some((l) => TREE_CONNECTOR_RE.test(l));
  return hasConnectors || indentWidths.size >= 2;
}
