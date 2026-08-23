/**
 * Pure folder-tree traversal (Phase 6.1, docs/phase6-full-parity-plan.md's 6.1 section: "real
 * file explorer", the last named gap). Following this project's established "extract pure
 * logic, unit-test it directly" convention (see tabOrder.ts's own header for the fuller
 * rationale and precedent).
 */

export interface DocFolderLike {
  id: string;
  parentId: string | null;
}

export interface FlatFolderEntry<T> {
  folder: T;
  depth: number;
}

/**
 * Flattens a `parentId`-linked folder tree into an ordered, depth-annotated list -- a folder
 * immediately followed by all of its own descendants (depth-first), siblings preserved in their
 * original array order. Matches legacy's own real render order and lack of any sibling sort
 * (legacy/index.html:30713's `folders.filter(f=>(f.parentId||null)===folder.id)` -- no `.sort()`
 * call anywhere on that result) -- creation order is display order, same as this project's other
 * unsorted lists (openTabs, etc).
 *
 * A folder whose own `parentId` doesn't match any existing folder's `id` (a dangling reference)
 * is silently excluded from the output entirely, not promoted to top-level -- this shouldn't
 * normally occur given documentsStore.ts's own `deleteFolder` always reassigns children to a
 * valid parent or `null` before removing a folder, but this function doesn't throw or attempt
 * to recover from it either way.
 */
export function flattenFolderTree<T extends DocFolderLike>(
  folders: T[],
  parentId: string | null = null,
  depth = 0
): FlatFolderEntry<T>[] {
  const result: FlatFolderEntry<T>[] = [];
  for (const folder of folders) {
    if ((folder.parentId ?? null) !== parentId) continue;
    result.push({ folder, depth });
    result.push(...flattenFolderTree(folders, folder.id, depth + 1));
  }
  return result;
}
