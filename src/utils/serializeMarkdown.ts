import { getNodePlainText, type PlainTextNode } from './stripSemanticMarkers';

/**
 * A minimal shape for an outline node used by outline-numbering and Markdown export —
 * `depth` plus everything `PlainTextNode` needs. See stripSemanticMarkers.ts's own comment
 * on why this is intentionally narrower than index.html's full node shape.
 */
export interface OutlineNode extends PlainTextNode {
  depth: number;
}

/**
 * Computes a dotted outline number ("1", "1.1", "1.2", "2", ...) for each node in `list`, or
 * an empty string for every node when outline numbering is off.
 *
 * Extraction of index.html's top-level `computeOutlineNumbers()`, wired in via
 * scripts/generate-index-blocks.mjs's `serializeMarkdown` block. The original read a global
 * `outlineNumbering` boolean (a user preference toggle) directly; here it's an explicit,
 * REQUIRED second parameter instead — deliberately no default, unlike formatRelativeTime's
 * injectable clock. There's no single universally-correct default for a user preference the
 * way "the current time" is a correct default for "what time is it right now" — silently
 * guessing a default here would risk masking whatever the app's actual current setting is,
 * which is worse than forcing every caller to pass it explicitly. The functions that used to
 * read the global directly (serializeTreeText, serializeTreeTextWithNotes,
 * serializeClipboardHtml, and a docx-export call site) were updated in the same commit that
 * wired this block in, to pass `outlineNumbering` explicitly.
 */
export function computeOutlineNumbers(list: OutlineNode[], outlineNumbering: boolean): string[] {
  if (!outlineNumbering) return list.map(() => '');
  const counters: number[] = [];
  return list.map((node) => {
    const depth = node.depth || 0;
    counters.length = depth + 1;
    counters[depth] = (counters[depth] || 0) + 1;
    return counters.slice(0, depth + 1).join('.');
  });
}

/**
 * Serializes a list of outline nodes to a Markdown bullet list, with optional outline
 * numbers and optional depth-rebasing (so a subtree exported on its own starts at the top
 * level rather than keeping its original nesting depth).
 *
 * Extraction of index.html's top-level `serializeMarkdown()`, wired in via
 * scripts/generate-index-blocks.mjs's `serializeMarkdown` block. The original defaulted
 * `scopeNodes` to the live global `nodes` array and read the `outlineNumbering` global
 * indirectly via `computeOutlineNumbers()` — both removed here in favor of explicit, required
 * parameters, for the same reason given above: a pure leaf function shouldn't reach into
 * global state, and the exact node list / setting value must come from the caller. Its two
 * real call sites (exportMarkdown and one other) were updated in the same commit that wired
 * this block in, to pass `outlineNumbering` explicitly. computeOutlineNumbers/serializeMarkdown
 * needed a small relocation pass first, since they were originally interleaved with un-extracted
 * sibling functions (serializeTreeText, serializeClipboardHtml) in index.html.
 */
export function serializeMarkdown(
  scopeNodes: OutlineNode[],
  rebaseDepth: boolean,
  outlineNumbering: boolean
): string {
  if (!scopeNodes.length) return '';
  const minDepth = rebaseDepth ? Math.min(...scopeNodes.map((n) => n.depth)) : 0;
  const numbers = computeOutlineNumbers(scopeNodes, outlineNumbering);
  return scopeNodes
    .map((node, idx) => {
      const indent = '  '.repeat(Math.max(0, node.depth - minDepth));
      const num = numbers[idx] ? numbers[idx] + ' ' : '';
      return `${indent}- ${num}${getNodePlainText(node)}`;
    })
    .join('\n');
}
