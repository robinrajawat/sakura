/**
 * Leading-icon text helpers — shared by `store/outlineStore.ts` (`applySuggestedIcons`/
 * `applyIconChoice`) and `state/aiIcon.ts` (Suggest icon, §6.9 slice 7, docs/phase6-full-parity-
 * plan.md). Kept in `utils/` rather than either of those two modules specifically to avoid a
 * circular import: `aiIcon.ts` already imports `outlineStore.ts` for its own orchestration (same
 * convention as `aiRewrite.ts`/`aiOutline.ts`/`aiExpandTags.ts`), so `outlineStore.ts` can't import
 * back from `aiIcon.ts`.
 *
 * Direct port of legacy's real `LEADING_ICON_RE`/`splitLeadingIcon` (legacy/index.html:29017-
 * 29022). The icon is stored as a literal leading emoji on `node.text` (e.g. "🛒 Webshop checkout
 * flow") rather than a separate field, so it rides along for free through every existing code path
 * (duplicate, move, drag, copy/paste, search, export) with zero special-casing — the cost is that
 * removing/replacing it means recognizing and stripping a leading emoji run, which is what this
 * module does.
 */

// \p{Extended_Pictographic} (with the /u flag) matches the leading emoji character itself;
// \uFE0F covers the variation selector some emoji need (e.g. printer/cloud emoji); \u200d +
// another pictographic covers ZWJ sequences (e.g. a person-in-suit emoji). Matches legacy's own
// real regex exactly — not a 100%-exhaustive emoji grammar, but it covers every emoji this
// feature assigns.
const LEADING_ICON_RE = /^(\p{Extended_Pictographic}(?:\uFE0F|\u200d\p{Extended_Pictographic})*)[ \t]+/u;

export function splitLeadingIconCore(text: string): { icon: string; rest: string } {
  const s = String(text || '');
  const m = s.match(LEADING_ICON_RE);
  return m ? { icon: m[1], rest: s.slice(m[0].length) } : { icon: '', rest: s };
}
