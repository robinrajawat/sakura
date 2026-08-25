/**
 * Auto-rewrite on commit — §6.9 slice 4 (docs/phase6-full-parity-plan.md). The pure exclusion
 * filter, `shouldAutoRewriteNode`, direct port of legacy's real `shouldAutoRewriteNode`
 * (legacy/index.html:28574-28584): a just-committed node only queues for auto-rewrite if it
 * clears a minimum word count AND isn't excluded by any of the four independently-toggleable
 * categories.
 */

export interface AutoRewriteExclusions {
  checkbox: boolean;
  heading: boolean;
  decisionlog: boolean;
  syntax: boolean;
}

export interface AutoRewriteCandidateNode {
  isCheckbox?: boolean;
  styles?: { heading?: number | null } | null;
}

/** Matches legacy's real `decisionlog` exclusion regex exactly — a node whose text starts with
 * one of Decision Log's five structured-field labels (Context/Decision/Rationale/Alternatives/
 * Impact) or the literal "Decision Log"/"Status" label, followed by `:`, a middle-dot, or the
 * end of the string. */
const DECISIONLOG_RE = /^(Decision Log|Context|Decision|Rationale|Alternatives|Impact|Status)(?=:|\s·|$)/;

/** Pure: whether a just-committed node's new text should be queued for auto-rewrite. Matches
 * legacy's real logic and default thresholds exactly:
 * - `checkbox`: excludes any node that's a checkbox (matches on the node's OWN post-commit
 *   `isCheckbox`, since a raw `[ ] text` commit auto-converts to a checkbox before this check
 *   would ever run in practice).
 * - `heading`: excludes any node with a heading level set.
 * - `decisionlog`: excludes Decision Log's own structured-field text (see `DECISIONLOG_RE`).
 * - `syntax`: excludes text containing `[[` (a backlink) or a backtick (inline code) — rewriting
 *   either risks mangling syntax the AI doesn't know is structurally significant.
 */
export function shouldAutoRewriteNode(text: string, node: AutoRewriteCandidateNode, exclusions: AutoRewriteExclusions, minWords: number): boolean {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < minWords) return false;
  if (exclusions.checkbox && node.isCheckbox) return false;
  if (exclusions.heading && node.styles?.heading) return false;
  if (exclusions.decisionlog && DECISIONLOG_RE.test(text)) return false;
  if (exclusions.syntax && (text.includes('[[') || text.includes('`'))) return false;
  return true;
}
