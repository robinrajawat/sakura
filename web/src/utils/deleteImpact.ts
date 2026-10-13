/**
 * What deleting rows takes with it (owner decision: a row's linked objects go with it, with a
 * confirmation whenever there are inline objects, and a prominent warning for anything Undo can't
 * bring back).
 *
 * - Notes, tables and images live on the node, and Q&A and remarks are in the undo snapshot, so
 *   all of those come back with Ctrl/Cmd+Z.
 * - Diagrams live outside the undo snapshot: deleting one with its row is permanent.
 * - To-dos are never deleted; they keep their task and only lose the link (which reconnects if
 *   the delete is undone, since the row comes back with the same id).
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `deleteImpact` block.
 */

export interface DeleteImpactCounts {
  notes: number;
  tables: number;
  images: number;
  questions: number;
  remarks: number;
  diagrams: number;
  todos: number;
}

export function emptyDeleteImpact(): DeleteImpactCounts {
  return { notes: 0, tables: 0, images: 0, questions: 0, remarks: 0, diagrams: 0, todos: 0 };
}

/** Inline objects deleted along with the rows (to-dos are kept, so they don't count). */
export function inlineObjectTotal(c: DeleteImpactCounts): number {
  return c.notes + c.tables + c.images + c.questions + c.remarks + c.diagrams;
}

function countPhrase(n: number, singular: string, plural = singular + 's'): string {
  return n + ' ' + (n === 1 ? singular : plural);
}

/** "a", "a and b", "a, b and c". */
export function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
}

export interface DeleteImpactText {
  /** Objects Undo restores, as one sentence, or '' when there are none. */
  undoable: string;
  /** The prominent warning for objects deleted for good, or '' when there are none. */
  permanent: string;
  /** What happens to linked to-dos, or '' when there are none. */
  todos: string;
}

export function deleteImpactText(c: DeleteImpactCounts): DeleteImpactText {
  const parts: string[] = [];
  if (c.notes) parts.push(countPhrase(c.notes, 'note'));
  if (c.tables) parts.push(countPhrase(c.tables, 'table'));
  if (c.images) parts.push(countPhrase(c.images, 'image'));
  if (c.questions) parts.push(countPhrase(c.questions, 'question'));
  if (c.remarks) parts.push(countPhrase(c.remarks, 'remark'));
  const undoable = parts.length
    ? 'This also deletes ' + joinWithAnd(parts) + '. Undo (Ctrl/Cmd+Z) brings ' + (parts.length === 1 && inlineObjectTotal(c) - c.diagrams === 1 ? 'it' : 'them') + ' back.'
    : '';
  const permanent = c.diagrams
    ? countPhrase(c.diagrams, 'diagram') + ' will be permanently deleted. Undo can’t bring ' + (c.diagrams === 1 ? 'it' : 'them') + ' back.'
    : '';
  const todos = c.todos
    ? countPhrase(c.todos, 'to-do') + ' linked here ' + (c.todos === 1 ? 'stays' : 'stay') + ' in To-Dos, unlinked.'
    : '';
  return { undoable, permanent, todos };
}
