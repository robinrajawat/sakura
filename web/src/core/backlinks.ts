import { stripSemanticMarkers } from '../utils/stripSemanticMarkers';

/**
 * Backlinks groundwork (Phase 6.3, docs/phase6-full-parity-plan.md's Note panel "backlinks
 * section" -- deliberately deferred when the rest of the Note/Code panel work shipped, since it
 * needed this infrastructure first; see the header comments on NotePanel.tsx/notePanelStore.ts
 * for that earlier deferral). This is the first slice of that infrastructure: the pure
 * query/mutation layer, direct ports of legacy's `getBacklinkRefs`/`getBacklinksTo`/
 * `cleanupBacklinksFor`/`renameBacklinksFor` (legacy/index.html:20087-20142).
 *
 * Legacy resolves a `[[Node Name]]` reference by matching current node TEXT, not a stable id --
 * there's no id embedded in the mention itself. That's a real, deliberate design choice (see
 * legacy's own comment on `renameBacklinksFor`: "there's no stable id in a [[mention]]"), not
 * an oversight this port should "fix" -- matching it exactly means a node's outline text IS its
 * address for backlink purposes, and renaming a node updates every `[[Old Name]]` reference to
 * `[[New Name]]` elsewhere, while deleting a node strips references to it entirely. Matching is
 * case-insensitive and normalizes through `stripSemanticMarkers` on both sides (so a target
 * whose own text carries e.g. a `[section]` marker still matches a plain-text mention of it).
 *
 * Deliberately NOT in this slice: rendering `[[...]]` as a clickable link in NodeText.tsx, the
 * `@`-mention autocomplete UI for inserting a reference while editing node text, wiring
 * `cleanupBacklinksFor`/`renameBacklinksFor` into outlineStore's delete/commit actions, and the
 * Note panel's actual Backlinks section display -- each its own separately-scoped next slice,
 * building on this query layer.
 */

export interface BacklinkableNode {
  id: number;
  text: string;
}

/** Extracts every `[[...]]` reference's inner text from a string, in order. Matches legacy's
 * own regex exactly, including the `(?!\])` negative lookahead that stops a `[[[triple]]]`
 * bracket from being misread as a valid reference. */
export function getBacklinkRefs(text: string | null | undefined): string[] {
  const refs: string[] = [];
  const re = /\[\[([\s\S]*?)\]\](?!\])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || ''))) !== null) {
    refs.push(m[1]);
  }
  return refs;
}

function normalizedMatch(ref: string, targetText: string, targetPlain: string): boolean {
  const rt = ref.trim().toLowerCase();
  return rt === targetText || stripSemanticMarkers(rt).trim().toLowerCase() === targetPlain;
}

/** Node ids whose text contains a `[[...]]` reference resolving to `targetId`. Empty array if
 * the target node doesn't exist or has blank text (nothing could reference it meaningfully). */
export function getBacklinksTo(nodes: BacklinkableNode[], targetId: number): number[] {
  const target = nodes.find((n) => n.id === targetId);
  if (!target) return [];
  const targetText = String(target.text || '').trim().toLowerCase();
  if (!targetText) return [];
  const targetPlain = stripSemanticMarkers(targetText).trim().toLowerCase();
  return nodes
    .filter((n) => n.id !== targetId && getBacklinkRefs(n.text || '').some((r) => normalizedMatch(r, targetText, targetPlain)))
    .map((n) => n.id);
}

/** Strips `[[ref]]` entirely (not just its brackets) from every node's text where `ref` matches
 * one of `deletedTexts` -- called when the referenced node(s) are deleted, so a dangling
 * mention doesn't point at text that no longer exists anywhere. Returns a new node array;
 * doesn't mutate the input, unlike legacy's in-place `n.text=newText`. */
export function cleanupBacklinksFor<T extends BacklinkableNode>(nodes: T[], deletedTexts: string[]): T[] {
  const lower = deletedTexts.map((t) => t.trim().toLowerCase());
  return nodes.map((n) => {
    if (!n.text.includes('[[')) return n;
    const newText = n.text
      .replace(/\[\[([\s\S]*?)\]\](?!\])/g, (match, ref) => (lower.includes(ref.trim().toLowerCase()) ? '' : match))
      .replace(/\s{2,}/g, ' ')
      .trim();
    return newText !== n.text ? { ...n, text: newText } : n;
  });
}

/** Rewrites every `[[Old Name]]` reference to `[[New Name]]` across all nodes after a rename --
 * a no-op (returns the input array unchanged, same reference) if `oldText`/`newText` are the
 * same case-insensitively, or if nothing actually referenced the old text. Case-only renames are
 * intentionally skipped, matching legacy: `[[node]]` -> `[[Node]]` doesn't rewrite anything. */
export function renameBacklinksFor<T extends BacklinkableNode>(nodes: T[], oldText: string, newText: string): T[] {
  const oldTrim = String(oldText || '').trim();
  const newTrim = String(newText || '').trim();
  if (!oldTrim || oldTrim.toLowerCase() === newTrim.toLowerCase()) return nodes;
  const oldLower = oldTrim.toLowerCase();
  let any = false;
  const next = nodes.map((n) => {
    if (!n.text.includes('[[')) return n;
    const updated = n.text.replace(/\[\[([\s\S]*?)\]\](?!\])/g, (match, ref) => {
      if (ref.trim().toLowerCase() !== oldLower) return match;
      any = true;
      return `[[${newTrim}]]`;
    });
    return updated !== n.text ? { ...n, text: updated } : n;
  });
  return any ? next : nodes;
}
