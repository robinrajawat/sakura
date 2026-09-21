/**
 * HTML-escapes a string for safe insertion into text content or an attribute value via
 * `innerHTML`/`outerHTML`.
 *
 * This is a literal, behavior-preserving extraction of the top-level `esc()` function that
 * used to live in index.html (currently at the module-level scope, used ~183 times throughout
 * the app). Wired into index.html via scripts/generate-index-blocks.mjs's `escapeHtml` block;
 * a thin hand-written wrapper (`function esc(value){return escapeHtml(value);}`) in that
 * block's footer preserves the original short name so none of index.html's real call sites
 * needed to change.
 *
 * Deliberately preserved from the original, even though it looks incomplete:
 * - Escapes only `&`, `<`, `>` — NOT `"` or `'`. index.html has a SEPARATE, differently-scoped
 *   `esc()` inside one specific closure (around its Notion-import code) that also escapes
 *   quotes, for its own attribute-context use — that is a different function with a different
 *   name collision, not a bug in this one, and not this extraction's concern to unify. Do not
 *   "fix" this without checking every one of the 183 call sites for reliance on the
 *   quote-not-escaped behavior in an attribute context first.
 * - No polymorphism/options — every call site passes a value expected to become plain text
 *   content, never HTML.
 */
export function escapeHtml(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
