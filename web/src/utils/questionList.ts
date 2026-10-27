/**
 * Pasting a list of questions into a thread's reply line (owner, 2026-10-27): colleagues send
 * batches of questions laid out as name › question › indented answer, and each should become its
 * own thread entry rather than one long comment.
 *
 * - A short line with questions under it is who asked them ("Kristoffer"); a short line with
 *   names under it is only a heading ("Open Questions") and is dropped.
 * - Every other line is a question; the lines indented under it are its answers. A question with
 *   nothing under it stays open.
 * - A short line just before a question at the same level is its title ("OQ-3: ATP validation").
 * - A short leftover line with nothing under it ("Additional Questions") is a heading and dropped.
 * - A question already in the thread, or pasted twice, is added once.
 *
 * Pure parts only; reading the clipboard and adding the entries stay in index.html next to
 * attachThreadPaste. Wired in via scripts/generate-index-blocks.mjs's `questionList` block.
 */

export interface OutlineLine {
  depth: number;
  text: string;
}

export interface PastedQuestion {
  /** Who asked it (the name line above it), or null when no name was given. */
  author: string | null;
  /** A short heading line that came right before it, or null. */
  title: string | null;
  text: string;
  /** One answer per line indented under the question (deeper lines are joined into theirs). */
  answers: string[];
}

export interface QuestionListResult {
  questions: PastedQuestion[];
  /** Questions left out because the thread (or the paste) already had them. */
  repeats: number;
}

interface TreeNode {
  text: string;
  children: TreeNode[];
}

// Bullets as typed or as Word writes them in plain text ("o" and "§" before a tab).
const BULLET = /^(?:[-*•◦▪‣·–§]|o(?=\t)|\d{1,3}[.)]|[a-zA-Z][.)])\s+/;

/** Plain text as indented lines: blank lines dropped, a tab counts as four spaces, bullets removed. */
export function outlineFromText(text: string): OutlineLine[] {
  const raw: { indent: number; text: string }[] = [];
  for (const line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^[ \t ]*/.exec(line);
    const lead = m ? m[0] : '';
    const body = line.slice(lead.length).replace(BULLET, '').trim();
    if (!body) continue;
    let indent = 0;
    for (const ch of lead) indent += ch === '\t' ? 4 : 1;
    raw.push({ indent, text: body.replace(/\s+/g, ' ') });
  }
  // Depth is the indent's rank among the indents used, so 3-space and tab outlines read the same.
  const widths = [...new Set(raw.map((l) => l.indent))].sort((a, b) => a - b);
  return raw.map((l) => ({ depth: widths.indexOf(l.indent), text: l.text }));
}

function buildTree(lines: OutlineLine[]): TreeNode[] {
  const root: TreeNode = { text: '', children: [] };
  const stack: { depth: number; node: TreeNode }[] = [{ depth: -1, node: root }];
  for (const l of lines) {
    while (stack.length > 1 && stack[stack.length - 1].depth >= l.depth) stack.pop();
    const node: TreeNode = { text: l.text, children: [] };
    stack[stack.length - 1].node.children.push(node);
    stack.push({ depth: l.depth, node });
  }
  return root.children;
}

const words = (t: string): number => t.split(/\s+/).filter(Boolean).length;

/** Reads as a question or a statement worth an entry (not a name or heading). */
function isQuestionLike(t: string): boolean {
  return t.includes('?') || words(t) > 6;
}

/** A short line that is no question: a name, a heading or a title. */
function isShortLabel(t: string, maxWords: number): boolean {
  return !t.includes('?') && words(t) <= maxWords && !/[.!]$/.test(t);
}

/** Looks like a person's name: one to three words, no digits or colons. */
function isNameLike(t: string): boolean {
  return isShortLabel(t, 3) && !/[\d:]/.test(t) && t.length <= 40;
}

function flatten(n: TreeNode): string {
  return [n.text, ...n.children.map(flatten)].join('\n');
}

const sameText = (t: string): string => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * The questions in an indented list. `existing` is the plain text of the questions already in
 * the thread, so a list pasted again (or a block repeated inside it) adds nothing twice.
 */
export function parseQuestionList(lines: OutlineLine[], existing: readonly string[] = []): QuestionListResult {
  const questions: PastedQuestion[] = [];
  const seen = new Set(existing.map(sameText).filter(Boolean));
  let repeats = 0;
  const walk = (nodes: TreeNode[], author: string | null): void => {
    let title: string | null = null;
    nodes.forEach((n, i) => {
      if (n.children.length && isShortLabel(n.text, 4)) {
        const asks = n.children.some((c) => isQuestionLike(c.text));
        walk(n.children, asks && isNameLike(n.text) ? n.text : author);
        title = null;
        return;
      }
      if (!n.children.length && isShortLabel(n.text, 10)) {
        const next = nodes[i + 1];
        title = next && isQuestionLike(next.text) ? n.text : null;
        return;
      }
      const key = sameText(n.text);
      if (seen.has(key)) repeats++;
      else {
        seen.add(key);
        questions.push({ author, title, text: n.text, answers: n.children.map(flatten) });
      }
      title = null;
    });
  };
  walk(buildTree(lines), null);
  return { questions, repeats };
}

/**
 * Whether a paste is a question list worth splitting rather than one comment: three or more
 * lines, and two or more questions with a question mark, or an indented list of two or more.
 */
export function isQuestionList(lines: OutlineLine[], result: QuestionListResult): boolean {
  if (lines.length < 3 || result.questions.length + result.repeats < 2) return false;
  return lines.filter((l) => l.text.includes('?')).length >= 2 || lines.some((l) => l.depth > 0);
}
