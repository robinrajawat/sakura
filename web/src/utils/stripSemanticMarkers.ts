/**
 * Strips Sakura's inline semantic-node markup down to plain text: `[[wikilinks]]`,
 * `[section headers]`, `(parenthetical asides)`, `` `code` ``, a leading `!` (highlight
 * marker), and a leading `>` (quote marker) are all unwrapped to their inner text.
 *
 * A literal, behavior-preserving extraction of index.html's top-level `stripSemanticMarkers()`.
 * Pure string transform, no DOM, no global state — the cleanest possible Phase 1 candidate.
 * Wired into index.html via scripts/generate-index-blocks.mjs's `stripSemanticMarkers` block —
 * name and signature match the original exactly, no wrapper needed.
 */
export function stripSemanticMarkers(text: string | null | undefined): string {
  return String(text || '')
    .replace(/\[\[([\s\S]*?)\]\](?!\])/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\s)!(\S)/g, '$1$2')
    .replace(/^>\s*/, '')
    .replace(/(\s)>(\S)/g, '$1$2');
}

/**
 * A minimal shape for an outline node — only the fields the extracted export utilities in
 * this directory actually read. Intentionally NOT the full node shape used elsewhere in
 * index.html (which carries many more fields: id, styles, children, collapsed state, etc.)
 * — narrower is more honest about what these specific pure functions depend on.
 */
export interface PlainTextNode {
  text?: string | null;
}

/**
 * Returns a node's words as the editor shows them: only `[[link]]` brackets are removed (a link
 * shows its name). Typed `**`, `__` and `[ ]` are plain characters since rows became rich text
 * (owner, 2026-10-22); formatting lives in node.marks and never changes the words. The one helper
 * every reader of a row's words goes through (search, sorting, labels, word counts, plain-text
 * exports). Wired into index.html via scripts/generate-index-blocks.mjs's `stripSemanticMarkers`
 * block, alongside `stripSemanticMarkers` itself.
 */
export function getNodePlainText(node: PlainTextNode): string {
  return String(node.text || '')
    .replace(/\[\[([\s\S]*?)\]\](?!\])/g, '$1');
}
