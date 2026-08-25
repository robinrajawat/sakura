/**
 * Pure resolver for the live outline tree's inline note/remark/Q&A preview visibility -- matches
 * legacy's own real deviation-tracking scheme exactly (legacy/index.html:18265-18269's own
 * comment: "inlineExpand*NodeIds Sets track deviation from the current alwaysExpandInlineEnabled
 * default... not 'is expanded' directly"). A node's per-domain Set doesn't store whether its
 * preview is open -- it stores whether that node's own state DIFFERS from the document-wide
 * default (`outlinePrefsStore.ts`'s `alwaysExpandInlineEnabled`). Whether a given node's preview
 * is actually visible right now is always this XOR against the live default, so toggling the
 * default instantly flips every node that hasn't been individually overridden, while every
 * node a user HAS clicked stays exactly as they left it -- the same behavior legacy's own real
 * toggle produces.
 */
export function isInlineExpanded(alwaysExpandInlineEnabled: boolean, expandedIds: ReadonlySet<number>, nodeId: number): boolean {
  return alwaysExpandInlineEnabled !== expandedIds.has(nodeId);
}
