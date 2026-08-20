/**
 * Generates a short, collision-resistant local id: a fixed prefix, a base36 timestamp, and a
 * short random suffix. NOT a UUID and not cryptographically secure — matches index.html's
 * existing id scheme exactly, used for locally-generated document/template/meeting-note ids
 * that only need to be unique within one browser's own storage, never across accounts or
 * exposed as a security boundary.
 *
 * Phase 1 (docs/architecture-plan.md) — extraction and test-equivalence only, NOT yet wired
 * into index.html/hub.html. See escapeHtml.ts's own header comment for why (script-execution-
 * order semantics, deferred to a later, deliberate cutover step).
 *
 * This single parameterized function replaces three near-identical copies currently living
 * separately in index.html:
 *   - genDocId()      → generateId('d')   — random suffix length 5
 *   - genTemplateId() → generateId('t')   — random suffix length 5
 *   - mnUid()         → generateId('mn')  — random suffix length 6
 * The random-suffix LENGTH differs between the two groups in the original code (5 vs 6) —
 * preserved here as an explicit parameter with each call site's own default, rather than
 * silently unified to one length, since collision probability at existing data volumes has
 * never been an issue at either length and unifying it is a real (if small) behavior change
 * outside this extraction's scope.
 */
export function generateId(prefix: string, randomSuffixLength: number = 5): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 2 + randomSuffixLength);
}
