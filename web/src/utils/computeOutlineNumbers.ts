import type { PlainTextNode } from './stripSemanticMarkers';

/**
 * A minimal shape for an outline node used by outline numbering — `depth` plus everything
 * `PlainTextNode` needs. See stripSemanticMarkers.ts's own comment on why this is intentionally
 * narrower than index.html's full node shape.
 */
export interface OutlineNode extends PlainTextNode {
  depth: number;
}

/**
 * Computes a dotted outline number ("1", "1.1", "1.2", "2", ...) for each node in `list`, or
 * an empty string for every node when outline numbering is off.
 *
 * Extraction of index.html's top-level `computeOutlineNumbers()`, wired in via
 * scripts/generate-index-blocks.mjs's `computeOutlineNumbers` block. The original read a global
 * `outlineNumbering` boolean (a user preference toggle) directly; here it's an explicit,
 * REQUIRED second parameter instead — deliberately no default, unlike formatRelativeTime's
 * injectable clock. There's no single universally-correct default for a user preference the
 * way "the current time" is a correct default for "what time is it right now" — silently
 * guessing a default here would risk masking whatever the app's actual current setting is,
 * which is worse than forcing every caller to pass it explicitly. Its callers
 * (serializeTreeText, serializeTreeTextWithNotes, serializeClipboardHtml) pass
 * `outlineNumbering` explicitly.
 *
 * This module used to be serializeMarkdown.ts and also held `serializeMarkdown()`; that
 * function's last caller (the To-Dos panel's AI "Extract action items") was removed, so only
 * computeOutlineNumbers and the OutlineNode type remain.
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
