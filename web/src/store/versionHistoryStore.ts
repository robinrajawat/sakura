import { create } from 'zustand';
import { idbGet, idbSet } from '../utils/idbKv';
import type { OutlineNode } from './outlineStore';

/**
 * §6.8 slice: document Version History -- direct port of the core of legacy's real
 * `recordDocRevision`/`loadDocRevisions`/`maybeAutoSnapshotBeforeSave`/`restoreDocRevision`
 * (legacy/index.html:10029-10145, 11070-11170). Same real IndexedDB key scheme (`docrev:<id>`,
 * the SAME `sakura_backup_db`/`kv` store `utils/idbKv.ts` already talks to for the two backup
 * tiers), same real constants (`REVISION_MIN_GAP_MS` = 10 minutes between automatic snapshots,
 * `REVISION_MAX_PER_DOC` = 20, oldest dropped first), same three real `reason` strings
 * (`'Auto'`, `'Manual checkpoint'`, `'Before restoring an older version'`) that show in the
 * History panel.
 *
 * A REAL, deliberate scope-down from legacy's own much larger feature, matching this project's
 * established "capture the highest-value, highest-frequency surface now, document the rest"
 * pattern (the same call already made for both backup tiers' outline-only trigger): this only
 * captures a document's `nodes`/`title` -- legacy's own revisions also carry diagrams/decision
 * logs/Q&A/Pad/attachments/remarks, none of which this slice touches. Concretely NOT built:
 * per-node version history (a separate UI lens over this same storage, legacy's own
 * `openNodeVersionHistory` -- a real, tractable follow-up once the whole-document view exists);
 * restoring into a document that ISN'T the currently active one (legacy's `restoreDocRevision`
 * has a whole separate code path for restoring a background/inactive document's storage without
 * disturbing live state -- `web/`'s `documentsStore.ts` always operates through the single
 * active `useOutlineStore`, so this slice only supports restoring into the active document);
 * orphaned-diagram/decision-log-link messaging after a restore (moot here, since nothing but
 * nodes/title is captured or restored in the first place); and the four separate Hub-domain
 * histories (To-Dos/Meeting Notes/Journal/Library each have their OWN real, separate revision
 * mechanism in legacy, same 10-minute cadence but entirely independent storage) -- each a real,
 * separately-scoped follow-up.
 *
 * This module owns ONLY the revision list itself (read/write/capture-gate) -- it has no
 * knowledge of `outlineStore`/`documentsStore` internals beyond the plain `nodes`/`title` it's
 * handed. `documentsStore.ts` is the caller that knows WHEN to capture (its own
 * `saveActiveDocNodes`, right before overwriting a document's stored content -- matching
 * legacy's own "previous state recorded right before a save overwrites it" comment exactly) and
 * owns applying a chosen revision back onto live state, the same cross-store composition
 * pattern `docSyncStore.ts`/`backupStore.ts` already established elsewhere in this project.
 */

export const REVISION_MIN_GAP_MS = 10 * 60 * 1000;
export const REVISION_MAX_PER_DOC = 20;

export type RevisionReason = 'Auto' | 'Manual checkpoint' | 'Before restoring an older version';

export interface DocRevision {
  ts: number;
  reason: RevisionReason;
  nodes: OutlineNode[];
  title: string;
}

function revisionKey(docId: string): string {
  return `docrev:${docId}`;
}

async function loadRevisionsRaw(docId: string): Promise<DocRevision[]> {
  try {
    const list = await idbGet<DocRevision[]>(revisionKey(docId));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function saveRevisionsRaw(docId: string, list: DocRevision[]): Promise<void> {
  await idbSet(revisionKey(docId), list);
}

/** Pure-ish content comparison for the auto-capture dedup gate -- matches legacy's own
 * `maybeAutoSnapshotBeforeSave` JSON-stringify comparison (scoped here to just the fields this
 * slice actually captures: nodes + title). */
function sameContent(a: { nodes: OutlineNode[]; title: string }, b: { nodes: OutlineNode[]; title: string }): boolean {
  return JSON.stringify(a.nodes) === JSON.stringify(b.nodes) && a.title === b.title;
}

interface VersionHistoryState {
  docId: string | null;
  revisions: DocRevision[];
  loading: boolean;

  loadRevisions: (docId: string) => Promise<void>;
  /** The real automatic-snapshot gate: records `prevNodes`/`prevTitle` as a new `'Auto'`
   * revision only if it differs from the most recent revision's content AND at least
   * `REVISION_MIN_GAP_MS` has passed since that revision -- matching legacy's own exact two-part
   * gate (dedup + rate-limit). Deliberately takes the PREVIOUS (about-to-be-overwritten) content
   * as its argument, not the new content -- the caller (`documentsStore.ts`) is responsible for
   * reading that before it writes the new state, same as legacy's own real call site. */
  maybeCapture: (docId: string, prevNodes: OutlineNode[], prevTitle: string) => Promise<void>;
  /** Bypasses the rate-limit gate entirely -- legacy's own real "Save a version now" button and
   * the pre-restore safety checkpoint both call the equivalent of this directly. */
  recordRevision: (docId: string, nodes: OutlineNode[], title: string, reason: RevisionReason) => Promise<void>;
}

export const useVersionHistoryStore = create<VersionHistoryState>((set, get) => ({
  docId: null,
  revisions: [],
  loading: false,

  loadRevisions: async (docId) => {
    set({ docId, loading: true });
    const list = await loadRevisionsRaw(docId);
    // A stale response for a docId the panel has since navigated away from (opened a different
    // document's History while this read was still in flight) should never clobber the newer
    // one -- `docId` is set optimistically above, so if it's since changed, this response is
    // for a document nobody's looking at anymore and gets discarded.
    if (get().docId !== docId) return;
    set({ revisions: list, loading: false });
  },

  maybeCapture: async (docId, prevNodes, prevTitle) => {
    if (!prevNodes.length) return; // nothing meaningful to preserve, matches legacy's own guard
    const list = await loadRevisionsRaw(docId);
    const last = list[list.length - 1];
    if (last && sameContent(last, { nodes: prevNodes, title: prevTitle })) return;
    if (last && Date.now() - last.ts < REVISION_MIN_GAP_MS) return;
    await get().recordRevision(docId, prevNodes, prevTitle, 'Auto');
  },

  recordRevision: async (docId, nodes, title, reason) => {
    const list = await loadRevisionsRaw(docId);
    list.push({ ts: Date.now(), reason, nodes, title });
    while (list.length > REVISION_MAX_PER_DOC) list.shift();
    await saveRevisionsRaw(docId, list);
    if (get().docId === docId) set({ revisions: list });
  }
}));
