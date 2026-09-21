import type { QueryableNode } from '../core/nodeQueries';

/**
 * Export domain — first slice. `serializeTreeText` renders the outline as the plain-text ASCII
 * tree used by the ".txt" export and the plaintext half of copy-to-clipboard (via
 * `exportToClipboard`'s `plain` value). Genuinely pure once traced: every function it calls is
 * already a generated ambient global —
 *
 * - `buildPrefix`/`hasLaterSiblingAtDepth` (from `src/core/nodeQueries.ts`, already generated;
 *   `buildPrefix` computes the `├──`/`└──`/`│` tree-connector prefix for one row)
 * - `computeOutlineNumbers` (from `src/utils/serializeMarkdown.ts`, already generated)
 * - `getNodePlainText` (from `src/utils/stripSemanticMarkers.ts`, already generated)
 *
 * all referenced as ambient globals via `declare function` — the pattern reserved for functions
 * generated in a *different* file/block (same convention `decisionLogQueries.ts`/
 * `diagramAnchor.ts` use for `stripSemanticMarkers`).
 *
 * The original read `treeIndentWidth`/`hideTreeLines` (user-preference globals) and
 * `outlineNumbering` directly; `outlineNumbering` was already passed explicitly by the time this
 * slice started (see `serializeMarkdown.ts`'s own header — it was updated in that commit).
 * `treeIndentWidth`/`hideTreeLines` are promoted to explicit required parameters here, same
 * "no silent default for a live user-preference toggle" reasoning `computeOutlineNumbers`'s own
 * header already established for `outlineNumbering`.
 *
 * `serializeTreeTextWithNotes` (near-identical, but appends each node's `note` via the
 * DOM-dependent `stripHtmlToText`) stays hand-written — genuinely different in kind, same split
 * decisionLogQueries.ts's third slice used for `decisionRowSnippet` vs.
 * `getDecisionAnchorCandidates`.
 */

declare function buildPrefix(
  scopedNodes: QueryableNode[],
  idx: number,
  treeIndentWidth: number,
  depthOffset?: number
): { vert: string; conn: string };

declare function computeOutlineNumbers(list: QueryableNode[], outlineNumbering: boolean): string[];

declare function getNodePlainText(node: QueryableNode): string;

/** Pure: matches index.html's own `serializeTreeText` exactly — renders `scopeNodes` as an
 * ASCII tree (`├──`/`└──`/`│` connectors from `buildPrefix`, one line per node, optional
 * dotted outline numbers, semantic markers stripped from each node's text). When `rebaseDepth`
 * is true the whole tree is shifted so its shallowest node renders at depth 0 (used when
 * exporting/copying a subset of the document, e.g. Focus mode or a partial selection) — when
 * false, depths render exactly as stored. `hideTreeLines` on suppresses the `│` continuation
 * columns, leaving only the connector glyphs. */
export function serializeTreeTextCore(
  scopeNodes: QueryableNode[],
  rebaseDepth: boolean,
  outlineNumbering: boolean,
  treeIndentWidth: number,
  hideTreeLines: boolean
): string {
  if (!scopeNodes.length) return '';
  const minDepth = rebaseDepth ? Math.min(...scopeNodes.map((n) => n.depth)) : 0;
  const numbers = computeOutlineNumbers(scopeNodes, outlineNumbering);
  return scopeNodes
    .map((node, idx) => {
      const p = buildPrefix(scopeNodes, idx, treeIndentWidth, -minDepth);
      if (hideTreeLines) {
        p.vert = p.vert.replace(/[│]/g, ' ');
        p.conn = '';
      }
      const num = numbers[idx];
      return `${p.vert}${p.conn}${num ? num + ' ' : ''}${getNodePlainText(node)}`.trimEnd();
    })
    .join('\n');
}
