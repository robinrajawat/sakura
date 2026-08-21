import type { QueryableNode } from '../core/nodeQueries';

/**
 * Export domain — second slice. `serializeOpml` renders the outline as OPML 2.0 XML, used by
 * the ".opml" export. Investigated as a whole before scoping: `serializeOpml` itself calls
 * `getMeta()` (reads `#header-title`/`#doc-author` DOM inputs directly) for the document title,
 * and `new Date()` for the `<dateCreated>` timestamp — genuinely DOM-dependent and impure
 * respectively, so both are promoted to explicit parameters rather than left as ambient reads.
 * `title` gets no default (same "no silent default for live external state" reasoning
 * `computeOutlineNumbers`'s header established for `outlineNumbering` — there's no universally
 * correct fallback title the way "now" is a correct default for "what time is it"). `dateCreated`
 * DOES get a `new Date()` default, matching `formatRelativeTime`'s established injectable-clock
 * pattern — deterministic override for tests, unaffected real call site (the one real caller,
 * `exportOpml`, never needs to override it).
 *
 * `nodesToOutlineXml` (the recursive per-node XML-emission helper) turned out to be genuinely
 * pure once traced: no DOM, only reads `node.isCheckbox`/`node.checked`/`node.note`/`node.text`
 * plus the `nodeContentExportEnabled` user-preference global — promoted to an explicit required
 * parameter, same pattern this file uses for `title`. Both are exported so the wrapper can call
 * either directly if ever needed, though only `serializeOpmlCore` has a real external call site.
 *
 * `escAttr`'s own logic (HTML-escape plus quote-escaping for a safe XML attribute value) is
 * inlined directly rather than referenced via `declare function` — `escAttr` itself is a
 * hand-written one-liner wrapping the already-generated `escapeHtml`, not itself a generated
 * block, same reasoning `nodeSearch.ts` used for inlining `escapeRegExpLiteral` instead of
 * extending the ambient-reference pattern to hand-written code.
 *
 * `getNodePlainText` (from `src/utils/stripSemanticMarkers.ts`, already generated) and
 * `escapeHtml` (from `src/utils/escapeHtml.ts`, already generated) are referenced as ambient
 * globals via `declare function`.
 */

declare function escapeHtml(value: unknown): string;
declare function getNodePlainText(node: QueryableNode): string;

function escAttrLocal(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The subset of a real outline node `nodesToOutlineXmlCore` reads. Intentionally loose on
 * `isCheckbox`/`checked`/`note` (all optional) since a node without a checkbox or note is the
 * common case, matching the original's defensive `node.isCheckbox?...` handling. */
export interface OpmlNode extends QueryableNode {
  isCheckbox?: boolean;
  checked?: boolean;
  note?: string;
}

/** Pure: matches index.html's own `nodesToOutlineXml` exactly — recursively renders `list`
 * starting at `startIdx`, emitting an `<outline>` element per node deeper than `parentDepth`
 * (self-closing for a leaf, wrapping nested `<outline>`s for a node with children), a leading
 * `[x] `/`[ ] ` checkbox-state prefix when `node.isCheckbox` is set, and — only when
 * `nodeContentExportEnabled` is true and the node has a non-blank note — a `_note` attribute
 * carrying the note text. */
export function nodesToOutlineXmlCore(
  list: OpmlNode[],
  startIdx: number,
  parentDepth: number,
  nodeContentExportEnabled: boolean
): string {
  let xml = '';
  let i = startIdx;
  while (i < list.length && list[i].depth > parentDepth) {
    if (list[i].depth === parentDepth + 1) {
      const node = list[i];
      let j = i + 1;
      while (j < list.length && list[j].depth > parentDepth + 1) j++;
      const hasKids = j > i + 1;
      const label = getNodePlainText(node);
      const checkboxPrefix = node.isCheckbox ? (node.checked ? '[x] ' : '[ ] ') : '';
      const text = escAttrLocal(checkboxPrefix + label);
      const noteAttr =
        nodeContentExportEnabled && node.note && node.note.trim()
          ? ` _note="${escAttrLocal(node.note)}"`
          : '';
      xml += hasKids
        ? `<outline text="${text}"${noteAttr}>${nodesToOutlineXmlCore(list, i + 1, parentDepth + 1, nodeContentExportEnabled)}</outline>`
        : `<outline text="${text}"${noteAttr}/>`;
      i = j;
    } else {
      i++;
    }
  }
  return xml;
}

/** Pure: matches index.html's own `serializeOpml` exactly — renders `scopeNodes` as an OPML 2.0
 * document, `title` falling back to `'Untitled'` when blank, depths rebased so the shallowest
 * node sits at the OPML root, `<dateCreated>` from `dateCreated` (defaulting to `new Date()`,
 * see this module's own header for why). An empty `scopeNodes` still produces a valid, empty
 * OPML document with the title but no `<dateCreated>` — matching the original exactly. */
export function serializeOpmlCore(
  scopeNodes: OpmlNode[],
  title: string,
  nodeContentExportEnabled: boolean,
  dateCreated: Date = new Date()
): string {
  const safeTitle = escAttrLocal(title || 'Untitled');
  if (!scopeNodes.length) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head><title>${safeTitle}</title></head>\n<body></body>\n</opml>`;
  }
  const minDepth = Math.min(...scopeNodes.map((n) => n.depth));
  const rebased = scopeNodes.map((n) => ({ ...n, depth: n.depth - minDepth }));
  const body = nodesToOutlineXmlCore(rebased, 0, -1, nodeContentExportEnabled);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n<head>\n<title>${safeTitle}</title>\n<dateCreated>${dateCreated.toUTCString()}</dateCreated>\n</head>\n<body>\n${body}\n</body>\n</opml>`;
}
