/**
 * Generates a short, collision-resistant local id: a fixed prefix, a base36 timestamp, and a
 * short random suffix. NOT a UUID and not cryptographically secure — matches index.html's
 * original id scheme exactly, used for locally-generated document/template/meeting-note ids
 * that only need to be unique within one browser's own storage, never across accounts or
 * exposed as a security boundary.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `generateId` block. This
 * single parameterized function replaces three near-identical copies that used to live
 * separately in index.html:
 *   - genDocId()      → now `function genDocId(){return generateId('d');}` — a thin wrapper
 *                        in the generated block's own footer, since its call sites live right
 *                        where the block splices in.
 *   - genTemplateId() → now `function genTemplateId(){return generateId('t')}` — hand-edited
 *                        in place elsewhere in index.html to delegate here.
 *   - mnUid()         → now `function mnUid(){return generateId('mn',6)}` — same treatment.
 * None of the three original functions' call sites needed to change.
 *
 * The random-suffix LENGTH differs between the two groups in the original code (5 vs 6) —
 * preserved here as an explicit parameter with each wrapper's own default, rather than
 * silently unified to one length, since collision probability at existing data volumes has
 * never been an issue at either length and unifying it is a real (if small) behavior change
 * outside this extraction's scope.
 */
export function generateId(prefix: string, randomSuffixLength: number = 5): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 2 + randomSuffixLength);
}
