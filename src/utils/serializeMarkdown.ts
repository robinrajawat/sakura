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
 * Phase 1 (docs/architecture-plan.md) — extraction of index.html's top-level
 * `computeOutlineNumbers()`. The original reads a global `outlineNumbering` boolean (a user
 * preference toggle) directly; here it's an explicit, REQUIRED second parameter instead —
 * deliberately no default, unlike formatRelativeTime's injectable clock. There's no single
 * universally-correct default for a user preference the way "the current time" is a correct
 * default for "what time is it right now" — silently guessing a default here would risk
 * masking whatever the app's actual current setting is, which is worse than forcing every
 * caller to pass it explicitly. NOT yet wired into index.html/hub.html; see escapeHtml.ts's
 * header comment for why.
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
 * Phase 1 (docs/architecture-plan.md) — extraction of index.html's top-level
 * `serializeMarkdown()`. The original defaults `scopeNodes` to the live global `nodes` array
 * and reads the `outlineNumbering` global indirectly via `computeOutlineNumbers()` — both
 * removed here in favor of explicit, required parameters, for the same reason given above:
 * a pure leaf function shouldn't reach into global state, and the exact node list / setting
 * value must come from the caller. NOT yet wired into index.html/hub.html.
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
