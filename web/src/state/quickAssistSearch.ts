import { useOutlineStore, type OutlineNode } from '../store/outlineStore';
import { useDocumentsStore, loadDocNodesById, type DocFolder } from '../store/documentsStore';
import { useSidebarStore } from '../store/sidebarStore';
import { useNotePanelStore } from '../store/notePanelStore';
import { stripHtmlToText } from '../utils/stripHtmlToText';

/**
 * §6.10 slice 4 (docs/phase6-full-parity-plan.md): Quick Assist's Global Search integration --
 * the search-hit half of legacy's real `collectSearchGroups` (legacy/index.html:16942), shown
 * below command/action matches in the same box. Legacy's real function aggregates 18 named
 * categories; only 6 land in this first sub-slice, chosen by an explicit per-category audit of
 * which ones have a real, already-existing `web/` data source AND a real legacy collector to port
 * (not a guess): Documents (`collectDocMatches`), In documents/node text (`collectNodeTextMatches`),
 * Notes (`collectNoteMatches`), Code (`collectCodeMatches`), Tags (`collectTagMatches`), Folders
 * (`collectFolderMatches`).
 *
 * A significant finding from that audit, not just a scoping choice: legacy's own real
 * `collectSearchGroups` also lists To-Dos/Meetings/Journal/Library, each guarded by
 * `typeof collectXMatches==='function'?collectXMatches(q):[]` -- but `collectTodoMatches`,
 * `collectMeetingMatches`, `collectJournalMatches`, and `collectLibraryMatches` are never actually
 * DEFINED anywhere in legacy/index.html (confirmed by grep across the whole file and hub.html).
 * legacy's own real behavior for those four categories is therefore an unconditional empty array,
 * every time -- porting real search for Hub content here would be inventing behavior legacy itself
 * never had, not completing a gap. Left out of this slice for that reason, not because `web/`'s
 * own Hub stores (`hubTodosStore.ts` etc.) lack real content -- they don't, but there's nothing
 * real to port.
 *
 * The remaining legacy categories (Pad/Q&A/Diagrams/Remarks, Folders' sibling Templates,
 * Settings, Features, Help) are real in legacy but each has its own separate blocker in `web/`
 * today (Pad-family content isn't persisted per-document in `padStore.ts` yet -- only the
 * currently-open document's Pad/Q&A/Diagrams/Remarks are searchable, unlike Documents/notes/
 * code/tags/folders which all have real per-document storage; Templates has no live UI at all;
 * Settings/Features/Help have no searchable index and no underlying system to index) -- a
 * separately-scoped follow-up, not attempted here.
 *
 * Deliberately simplified vs. legacy's real collectors: plain-text snippets, no `<mark>` HTML
 * highlighting (`buildMatchSnippetHtml`/`buildFullLabelMarkHtml`'s own token-highlighting is
 * cosmetic, not behavioral); no trash-document scanning (`web/` has no trash/deleted-documents
 * concept at all yet, unlike legacy's own `searchIncludesTrash` toggle); no fuzzy-match fallback
 * (same simplification `quickAssist.ts`'s own command matching already makes, for the same
 * "small, jargon-heavy corpus" reasoning legacy's own comment gives). Navigation on click matches
 * this project's own already-established simplification (see `OutlineTree.tsx`'s wikilink
 * click-navigate, `onLinkClick` around line 1201: a plain `selectNode(id)`, no ancestor-expansion/
 * scroll-into-view/flash animation) rather than legacy's real `jumpToNodeInDoc`/`revealNodeInDoc`
 * (which do all three) -- not a new gap introduced here, the same pattern this whole codebase
 * already uses everywhere a result needs to land on a specific node.
 *
 * §6.10 slice 4b: added category-prefix scoping (typing "note: budget" or "notes: budget" scopes
 * results to just the Notes category, skipping command/action matching entirely, matching
 * legacy's real `qaParseCategoryPrefix`/`QA_CATEGORY_PREFIXES` exactly) and the chip-mode category
 * picker (`QA_SEARCH_CATEGORIES`/`QA_CATEGORY_PRIMARY_PREFIX`, direct ports of legacy's real
 * constants of the same name -- but scoped to only this slice's real 6 categories, not legacy's
 * real 18, matching the same audit-driven scoping `quickAssist.ts`'s own header explains for
 * QA_COMMANDS/QA_ACTIONS). The picker chip UI itself (verb + category rows, click/keyboard to
 * insert a prefix into the input) lives in `components/QuickAssistBar.tsx` -- legacy's own real
 * geometric bounding-box chip navigation (`qaMoveChip`, needed for its 18-category chip row
 * wrapping across several lines) is simplified here to plain sequential nav, since 6 category
 * chips plus 4 verb chips fit in one or two short rows at any reasonable width -- a "port the
 * effect, not the exact technique" call, not a functional gap.
 */

export interface QaSearchHit {
  label: string;
  meta: string;
  action: () => void;
}

export interface QaSearchGroup {
  name: string;
  items: QaSearchHit[];
}

/** This slice's 6 real categories -- matches the `key`s legacy's own real `QA_SEARCH_CATEGORIES`
 * (legacy/index.html:17226-17245) uses for these same 6, not an invented naming scheme. */
export type QaSearchCategoryKey = 'documents' | 'in-documents' | 'notes' | 'code' | 'tags' | 'folders';

/** Direct port of legacy's real `QA_SEARCH_CATEGORIES`, filtered to this slice's 6 real
 * categories -- drives the category-picker chip row in `QuickAssistBar.tsx`. */
export const QA_SEARCH_CATEGORIES: { key: QaSearchCategoryKey; group: string }[] = [
  { key: 'documents', group: 'Documents' },
  { key: 'in-documents', group: 'In documents' },
  { key: 'notes', group: 'Notes' },
  { key: 'code', group: 'Code' },
  { key: 'tags', group: 'Tags' },
  { key: 'folders', group: 'Folders' }
];

/** Direct port of legacy's real `QA_CATEGORY_PREFIXES` (legacy/index.html:17252-17271), filtered
 * to this slice's 6 real categories -- every alias a person can type before a colon
 * ("notes: budget", "note: budget") to scope a search to just that category. */
export const QA_CATEGORY_PREFIXES: Record<string, QaSearchCategoryKey> = {
  doc: 'documents',
  docs: 'documents',
  documents: 'documents',
  text: 'in-documents',
  content: 'in-documents',
  indocs: 'in-documents',
  note: 'notes',
  notes: 'notes',
  code: 'code',
  tag: 'tags',
  tags: 'tags',
  folder: 'folders',
  folders: 'folders'
};

/** Direct port of legacy's real `QA_CATEGORY_PRIMARY_PREFIX` (legacy/index.html:17289-17293),
 * filtered to this slice's 6 real categories -- the one canonical alias the category picker
 * inserts when a category chip is clicked (`QA_CATEGORY_PREFIXES` above has every alias a person
 * can type by hand; this is just which one the picker itself uses). */
export const QA_CATEGORY_PRIMARY_PREFIX: Record<QaSearchCategoryKey, string> = {
  documents: 'doc',
  'in-documents': 'text',
  notes: 'note',
  code: 'code',
  tags: 'tag',
  folders: 'folder'
};

/** Direct port of legacy's real `qaParseCategoryPrefix` (legacy/index.html:17272-17278) -- an
 * unrecognized prefix (or no colon at all) returns `null`, leaving the text to be parsed as a
 * normal command/search query instead. */
export function qaParseCategoryPrefix(text: string): { categoryKey: QaSearchCategoryKey; rest: string } | null {
  const m = String(text || '').match(/^\s*([a-zA-Z]+)\s*:\s*(.*)$/s);
  if (!m) return null;
  const key = QA_CATEGORY_PREFIXES[m[1].toLowerCase()];
  if (!key) return null;
  return { categoryKey: key, rest: m[2] };
}

/** Direct port of legacy's real `qaTokenizeQuery` (legacy/index.html:16492). */
export function qaTokenizeQuery(q: string): string[] {
  return String(q || '').split(/\s+/).filter(Boolean);
}

/** Direct port of legacy's real `qaHayMatches` (legacy/index.html:16493-16499), minus the fuzzy
 * fallback -- see this file's own header for why. AND semantics: every token must appear
 * somewhere in the haystack, in any order. */
export function qaHayMatches(hay: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const h = String(hay || '').toLowerCase();
  return tokens.every((t) => h.includes(t));
}

/** Plain-text equivalent of legacy's real `buildMatchSnippetHtml` (legacy/index.html:16526-16540)
 * -- centers a ±26-character window on the earliest token match, with ellipses at either
 * truncated edge. No `<mark>` highlighting, see this file's own header. */
export function buildMatchSnippet(text: string, tokens: string[]): string {
  const t = String(text || '');
  const lower = t.toLowerCase();
  if (!tokens.length) return t.slice(0, 64);
  let idx = -1;
  let matchLen = 1;
  tokens.forEach((tok) => {
    const i = lower.indexOf(tok);
    if (i !== -1 && (idx === -1 || i < idx)) {
      idx = i;
      matchLen = tok.length;
    }
  });
  if (idx === -1) return t.slice(0, 64);
  const radius = 26;
  const start = Math.max(0, idx - radius);
  const end = Math.min(t.length, idx + matchLen + radius);
  return (start > 0 ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '');
}

/** The active document's live in-memory nodes if `docId` is the active document (reflecting
 * unsaved edits, matching legacy's real `getDocNodesForSearch` preferring in-memory state for the
 * current doc), else that document's last-saved nodes from storage. */
function docNodesFor(docId: string, activeDocId: string | null): OutlineNode[] {
  if (docId === activeDocId) return useOutlineStore.getState().nodes;
  return loadDocNodesById(docId);
}

function navigateToDoc(docId: string, activeDocId: string | null): void {
  if (docId !== activeDocId) useDocumentsStore.getState().openDocument(docId);
}

/** Direct port of legacy's real `collectDocMatches` (legacy/index.html:16454-16469), minus trash
 * scanning. Capped at 5, matching legacy's own real limit. */
function collectDocMatches(tokens: string[]): QaSearchHit[] {
  const { docsIndex, activeDocId } = useDocumentsStore.getState();
  return docsIndex
    .filter((d) => qaHayMatches(d.title || 'Untitled', tokens))
    .slice(0, 5)
    .map((d) => ({
      label: (d.id === activeDocId ? '● ' : '') + (d.title || 'Untitled'),
      meta: d.id === activeDocId ? 'Current document' : '',
      action: () => navigateToDoc(d.id, activeDocId)
    }));
}

/** Direct port of legacy's real `collectNodeTextMatches` (legacy/index.html:16652-16683), minus
 * trash scanning. Capped at 6 total, 2 per document, matching legacy's own real limits. */
function collectNodeTextMatches(tokens: string[]): QaSearchHit[] {
  const { docsIndex, activeDocId } = useDocumentsStore.getState();
  const out: QaSearchHit[] = [];
  for (const d of docsIndex) {
    if (out.length >= 6) break;
    const docNodes = docNodesFor(d.id, activeDocId);
    let perDoc = 0;
    for (const n of docNodes) {
      if (perDoc >= 2 || out.length >= 6) break;
      const text = String(n.text || '');
      if (!qaHayMatches(text, tokens)) continue;
      perDoc++;
      out.push({
        label: buildMatchSnippet(text, tokens),
        meta: (d.id === activeDocId ? '● ' : '') + (d.title || 'Untitled'),
        action: () => {
          navigateToDoc(d.id, activeDocId);
          useOutlineStore.getState().selectNode(n.id);
        }
      });
    }
  }
  return out;
}

/** Direct port of legacy's real `collectNoteMatches` (legacy/index.html:16686-16718), minus trash
 * scanning. Capped at 4 total, 2 per document, matching legacy's own real limits. Note HTML is
 * stripped to plain text before matching/snippeting, same as legacy. */
function collectNoteMatches(tokens: string[]): QaSearchHit[] {
  const { docsIndex, activeDocId } = useDocumentsStore.getState();
  const out: QaSearchHit[] = [];
  for (const d of docsIndex) {
    if (out.length >= 4) break;
    const docNodes = docNodesFor(d.id, activeDocId);
    let perDoc = 0;
    for (const n of docNodes) {
      if (perDoc >= 2 || out.length >= 4) break;
      const noteText = stripHtmlToText(n.note);
      if (!noteText || !qaHayMatches(noteText, tokens)) continue;
      perDoc++;
      out.push({
        label: buildMatchSnippet(noteText, tokens),
        meta: (d.id === activeDocId ? '● ' : '') + (d.title || 'Untitled'),
        action: () => {
          navigateToDoc(d.id, activeDocId);
          useOutlineStore.getState().selectNode(n.id);
          useNotePanelStore.getState().openPanel(n.id, !!n.note, !!n.codeBlock, 'note');
        }
      });
    }
  }
  return out;
}

/** Direct port of legacy's real `collectCodeMatches` (legacy/index.html:16720-16752), minus trash
 * scanning. Capped at 4 total, 2 per document, matching legacy's own real limits. */
function collectCodeMatches(tokens: string[]): QaSearchHit[] {
  const { docsIndex, activeDocId } = useDocumentsStore.getState();
  const out: QaSearchHit[] = [];
  for (const d of docsIndex) {
    if (out.length >= 4) break;
    const docNodes = docNodesFor(d.id, activeDocId);
    let perDoc = 0;
    for (const n of docNodes) {
      if (perDoc >= 2 || out.length >= 4) break;
      const codeText = n.codeBlock && typeof n.codeBlock.code === 'string' ? n.codeBlock.code : '';
      if (!codeText || !qaHayMatches(codeText, tokens)) continue;
      perDoc++;
      out.push({
        label: buildMatchSnippet(codeText, tokens),
        meta: (d.id === activeDocId ? '● ' : '') + (d.title || 'Untitled'),
        action: () => {
          navigateToDoc(d.id, activeDocId);
          useOutlineStore.getState().selectNode(n.id);
          useNotePanelStore.getState().openPanel(n.id, !!n.note, !!n.codeBlock, 'code');
        }
      });
    }
  }
  return out;
}

/** Direct port of legacy's real `collectTagMatches` (legacy/index.html:16755-16789), minus trash
 * scanning. Capped at 4 total, 2 per document, matching legacy's own real limits. The match is on
 * the tag itself, not the node's own text, same as legacy. */
function collectTagMatches(tokens: string[]): QaSearchHit[] {
  const { docsIndex, activeDocId } = useDocumentsStore.getState();
  const out: QaSearchHit[] = [];
  for (const d of docsIndex) {
    if (out.length >= 4) break;
    const docNodes = docNodesFor(d.id, activeDocId);
    let perDoc = 0;
    for (const n of docNodes) {
      if (perDoc >= 2 || out.length >= 4) break;
      const tags = Array.isArray(n.tags) ? n.tags : [];
      const matchedTag = tags.find((t) => qaHayMatches(t, tokens));
      if (!matchedTag) continue;
      perDoc++;
      out.push({
        label: '#' + matchedTag + ' — ' + String(n.text || '').slice(0, 50),
        meta: (d.id === activeDocId ? '● ' : '') + (d.title || 'Untitled'),
        action: () => {
          navigateToDoc(d.id, activeDocId);
          useOutlineStore.getState().selectNode(n.id);
        }
      });
    }
  }
  return out;
}

/** Ensures every ancestor of `folderId` (and the folder itself) is open, matching legacy's real
 * `revealFolderInSidebar`'s own ancestor-opening walk (legacy/index.html:31127-31141) -- an
 * already-open folder is left untouched, since `toggleFolderOpen` flips state rather than setting
 * it directly. Minus legacy's own DOM scroll-into-view/highlight-flash, see this file's own
 * header for why. */
function revealFolder(folderId: string): void {
  const sidebar = useSidebarStore.getState();
  if (!sidebar.open) sidebar.toggleOpen();
  const chain: string[] = [];
  let cur = useDocumentsStore.getState().folders.find((f) => f.id === folderId);
  let guard = 0;
  while (cur && guard++ < 20) {
    chain.push(cur.id);
    const parentId: string | null = cur.parentId;
    cur = parentId ? useDocumentsStore.getState().folders.find((f) => f.id === parentId) : undefined;
  }
  chain.forEach((id) => {
    const f = useDocumentsStore.getState().folders.find((x) => x.id === id);
    if (f && !f.open) useDocumentsStore.getState().toggleFolderOpen(id);
  });
}

/** Direct port of legacy's real `collectFolderMatches` (legacy/index.html:16441-16453), minus
 * template folders (`web/` has no template system, see this file's own header). Capped at 5,
 * matching legacy's own real limit. */
function collectFolderMatches(tokens: string[]): QaSearchHit[] {
  const { folders } = useDocumentsStore.getState();
  const pathFor = (folder: DocFolder): string => {
    const parts: string[] = [];
    let cur: DocFolder | undefined = folder;
    let guard = 0;
    while (cur && guard++ < 20) {
      parts.unshift(cur.name || 'Unnamed folder');
      const parentId: string | null = cur.parentId;
      cur = parentId ? folders.find((f) => f.id === parentId) : undefined;
    }
    parts.pop();
    return parts.join(' / ');
  };
  return folders
    .filter((f) => qaHayMatches(f.name || 'Unnamed folder', tokens))
    .slice(0, 5)
    .map((f) => {
      const parentPath = pathFor(f);
      return {
        label: f.name || 'Unnamed folder',
        meta: parentPath ? 'In ' + parentPath : 'Document folder',
        action: () => revealFolder(f.id)
      };
    });
}

/** Direct port of legacy's real `collectSearchGroups` (legacy/index.html:16942-16963), scoped to
 * this slice's 6 real categories, in the same relative order legacy uses (content ahead of
 * app-chrome, per that function's own real ordering comment) -- and its own real shared-budget
 * drain (`let budget=8`, legacy/index.html around its `qaRender`'s search-group loop): the total
 * number of search-hit rows across every category combined is capped at 8, whichever categories'
 * results come first in group order get first claim on that budget. Returns `[]` for an empty
 * query, matching legacy's own real short-circuit. */
export function collectQaSearchGroups(query: string, scopedCategoryKey?: QaSearchCategoryKey | null): QaSearchGroup[] {
  // Lowercases defensively rather than relying on the caller having already normalized (`quickAssist.ts`'s
  // `buildQaEntries` does, but this is this module's own public entry point) -- `qaHayMatches` itself
  // does not lowercase its `tokens` argument, matching legacy's own real `qaHayMatches` contract exactly.
  const tokens = qaTokenizeQuery(query.toLowerCase());
  if (!tokens.length) return [];
  const groups: (QaSearchGroup & { key: QaSearchCategoryKey })[] = [
    { key: 'documents', name: 'Documents', items: collectDocMatches(tokens) },
    { key: 'in-documents', name: 'In documents', items: collectNodeTextMatches(tokens) },
    { key: 'notes', name: 'Notes', items: collectNoteMatches(tokens) },
    { key: 'code', name: 'Code', items: collectCodeMatches(tokens) },
    { key: 'tags', name: 'Tags', items: collectTagMatches(tokens) },
    { key: 'folders', name: 'Folders', items: collectFolderMatches(tokens) }
  ];
  // A category prefix scopes to just that one group, matching legacy's real `qaRender`'s own
  // `.filter(g=>...key===scopedCategoryKey...)` -- the same shared budget-of-8 drain still
  // applies below, it just has only one group left to drain from.
  const scoped = scopedCategoryKey ? groups.filter((g) => g.key === scopedCategoryKey) : groups;
  let budget = 8;
  const rendered: QaSearchGroup[] = [];
  for (const g of scoped) {
    if (budget <= 0 || !g.items.length) continue;
    const items = g.items.slice(0, budget);
    budget -= items.length;
    rendered.push({ name: g.name, items });
  }
  return rendered;
}
