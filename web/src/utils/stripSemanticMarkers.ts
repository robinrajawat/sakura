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
 * Returns a node's words as the editor shows them: `[[link]]` and `[section]` brackets,
 * `**bold**` and `__italic__` markers are removed; everything else the editor displays as typed
 * (parentheses, backticks, `!`, `>`) is kept. The one helper every reader of a row's words goes through (search, sorting,
 * labels, word counts, plain-text exports), so the row's storage format can change in one place
 * (owner, 2026-10-22: rows move to rich text). Originally a literal extraction of
 * index.html's top-level `getNodePlainText()`. Wired into index.html via
 * scripts/generate-index-blocks.mjs's `stripSemanticMarkers` block, alongside
 * `stripSemanticMarkers` itself — name and signature match the original exactly, no wrapper
 * needed.
 */
export function getNodePlainText(node: PlainTextNode): string {
  return String(node.text || '')
    .replace(/\[\[([\s\S]*?)\]\](?!\])/g, '$1')
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1');
}
