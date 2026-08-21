import type { QueryableNode } from '../core/nodeQueries';
import { buildPrefix } from '../core/nodeQueries';
import { computeOutlineNumbers } from './serializeMarkdown';
import { getNodePlainText } from './stripSemanticMarkers';

/**
 * Export domain — fourth slice. `serializeTreeTextWithNotes` renders the same ASCII tree
 * `serializeTreeText` does, but with each node's note appended as its own indented "Note:" line
 * right under it. Used only where the AI actually needs to reason about note content (currently
 * `generateQaQuestionsAI`) — the plain `serializeTreeText` stays note-free everywhere else
 * (export/restructure) so this doesn't change any output that wasn't asked for.
 *
 * Genuinely different in kind from `serializeTreeText`'s own slice, not a mechanical repeat of
 * it: the one real difference — `stripHtmlToText(node.note)` — is a hand-written function that
 * genuinely touches the DOM (`document.createElement`), so it can't be referenced via
 * `declare function` the way this domain's other ambient dependencies are (that pattern is
 * reserved for already-*generated* functions; `stripHtmlToText` is hand-written). Instead it's
 * injected as an explicit parameter — the second real instance of the pattern
 * `templatesApply.ts` established with its injected `makeNode`/`emptyStyles` (the first
 * hand-written function injected as a dependency rather than referenced ambiently). Worth the
 * DI machinery here, unlike `decisionRowSnippet`'s own 4-line case (`decisionLogQueries.ts`'s
 * third slice): this function has real structure — a tree walk reusing three already-generated
 * ambient functions — where `decisionRowSnippet` had none.
 *
 * `buildPrefix`/`hasLaterSiblingAtDepth` (from `src/core/nodeQueries.ts`), `computeOutlineNumbers`
 * (from `src/utils/serializeMarkdown.ts`), and `getNodePlainText` (from
 * `src/utils/stripSemanticMarkers.ts`) are already generated elsewhere and referenced as ambient
 * globals via `declare function` — identical to `serializeTreeText.ts`'s own slice.
 * `treeIndentWidth`/`hideTreeLines`/`outlineNumbering` are likewise promoted to explicit
 * required parameters, same reasoning this domain's every prior slice established.
 */



/** The subset of a real outline node this module reads. `note` is optional/loose — a node
 * without one is the common case, matching the original's `node.note?...` defensive check. */
export interface NotableNode extends QueryableNode {
  note?: string;
}

/** Pure once `stripHtmlToText` is supplied: matches index.html's own `serializeTreeTextWithNotes`
 * exactly — same ASCII-tree rendering `serializeTreeTextCore` produces, but appending each
 * node's note (plain-texted via the injected `stripHtmlToText`, only when non-blank) as its own
 * indented `    Note: ...` line directly under that node's own line, indented to match the
 * node's own tree-connector prefix. */
export function serializeTreeTextWithNotesCore(
  scopeNodes: NotableNode[],
  rebaseDepth: boolean,
  outlineNumbering: boolean,
  treeIndentWidth: number,
  hideTreeLines: boolean,
  stripHtmlToText: (html: string) => string
): string {
  if (!scopeNodes.length) return '';
  const minDepth = rebaseDepth ? Math.min(...scopeNodes.map((n) => n.depth)) : 0;
  const numbers = computeOutlineNumbers(scopeNodes, outlineNumbering);
  const lines: string[] = [];
  scopeNodes.forEach((node, idx) => {
    const p = buildPrefix(scopeNodes, idx, treeIndentWidth, -minDepth);
    if (hideTreeLines) {
      p.vert = p.vert.replace(/[│]/g, ' ');
      p.conn = '';
    }
    const num = numbers[idx];
    lines.push(`${p.vert}${p.conn}${num ? num + ' ' : ''}${getNodePlainText(node)}`.trimEnd());
    const noteText = node.note ? stripHtmlToText(node.note) : '';
    if (noteText) lines.push(`${p.vert}    Note: ${noteText}`);
  });
  return lines.join('\n');
}
