/**
 * Strips Sakura's inline semantic-node markup down to plain text: `[[wikilinks]]`,
 * `[section headers]`, `(parenthetical asides)`, `` `code` ``, a leading `!` (highlight
 * marker), and a leading `>` (quote marker) are all unwrapped to their inner text.
 *
 * Phase 1 (docs/architecture-plan.md) — a literal, behavior-preserving extraction of
 * index.html's top-level `stripSemanticMarkers()`. Pure string transform, no DOM, no global
 * state — the cleanest possible Phase 1 candidate. NOT yet wired into index.html/hub.html;
 * see escapeHtml.ts's header comment for why.
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
 * Returns a node's display text with semantic markup stripped — a literal extraction of
 * index.html's top-level `getNodePlainText()`.
 */
export function getNodePlainText(node: PlainTextNode): string {
  return stripSemanticMarkers(node.text || '');
}
