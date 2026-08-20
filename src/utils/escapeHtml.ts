/**
 * HTML-escapes a string for safe insertion into text content or an attribute value via
 * `innerHTML`/`outerHTML`.
 *
 * This is a literal, behavior-preserving extraction of the top-level `esc()` function in
 * index.html (currently at the module-level scope, used ~183 times throughout the app).
 * Phase 1 (docs/architecture-plan.md) — extraction and test-equivalence only, this is NOT
 * yet wired into index.html/hub.html. See the Phase 1 section of that doc for why: the live
 * app is a classic (non-module) `<script>`, and safely cutting it over to import from real
 * ES modules requires solving script-execution-order semantics once, deliberately, as its
 * own piece of work — not something to sneak in per-function during extraction.
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
