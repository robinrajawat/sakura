import { create } from 'zustand';
import { todayDateStr } from '../utils/remarkDate';
import { generateId } from '../utils/generateId';
import { decisionLogForNodeCore } from '../state/decisionLogQueries';
import { reorderDiagramsCore } from '../state/diagramAnchor';

export type DecisionStatus = 'proposed' | 'approved' | 'rejected';

/** The 5 rich-text fields every decision has -- matches legacy's own real `DL_FIELDS`
 * (legacy/index.html:8313-8319) exactly, both the set and this order. */
export type DecisionTextField = 'context' | 'decision' | 'rationale' | 'alternatives' | 'impact';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): rebuilt to match legacy's own real Decision Log
 * schema (legacy/index.html:8276's own `let decisionLogs=[]` and `createDecisionLog()`,
 * legacy/index.html:35388-35413) -- this project's Phase 3 placeholder (`title`/`description`
 * only, numeric `id` from the shared Pad `nextId` counter) is gone. `id` is now a string, in the
 * exact format legacy's own real ids use (`'dl'+timestamp+rand`, via `generateId('dl')` --
 * `utils/generateId.ts`'s own default random-suffix length already matches legacy's real id
 * shape exactly, no new logic needed). `anchorNodeId` links a decision to one outline node --
 * the same shape Diagrams already uses (`diagramAnchor.ts`), plus a real invariant Diagrams
 * doesn't have: legacy enforces exactly one decision log per node (`decisionLogForNode`,
 * ported as `decisionLogForNodeCore` in `state/decisionLogQueries.ts`), so `createDecision`/
 * `setDecisionAnchor` below both check that pure function before assigning an anchor.
 */
export interface Decision {
  id: string;
  anchorNodeId: number | null;
  context: string;
  decision: string;
  rationale: string;
  alternatives: string;
  impact: string;
  status: DecisionStatus;
  author: string;
  /** Last-edited timestamp -- matches legacy's own real `dl.timestamp`, shown as "Last updated"
   * in the panel. Distinct from `createdAt`, which never changes. */
  timestamp: number;
  createdAt: number;
  modifiedAt: number;
}

export interface QaItem {
  id: number;
  question: string;
  answer: string;
}

export interface Remark {
  id: number;
  person: string;
  text: string;
  date: string;
}

export interface FileRef {
  id: number;
  name: string;
  size: number;
  dataUrl: string;
  mimeType: string;
  addedAt: number;
}

/** 5 MB raw file size cap, matching legacy's own `PAD_ATTACH_MAX_BYTES` exactly
 * (legacy/index.html:41872) -- base64 encoding adds ~33% on top of this, but the cap is on the
 * raw `File.size` before that overhead, same as legacy checks. */
export const PAD_ATTACH_MAX_BYTES = 5 * 1024 * 1024;

/** Phase 6.3 item 11 (docs/phase6-full-parity-plan.md), Diagrams sub-slice. `xml` is the saved
 * draw.io `<mxfile>` document -- '' until the editor's own 'save' event fires at least once,
 * same as legacy's own `d.xml=''` on creation. Deliberately NOT matching legacy's fuller
 * `Diagram` shape yet, same "flat, document-level list first pass" convention as every other Pad
 * tab in this store: `anchorNodeId` (node-linking), `status` (draft/in-progress/review/final --
 * `diagramDisplayList.ts` already has the pure filter/sort logic for this, unwired), `note`,
 * `previewSvg`/thumbnail generation, `pageCount`/multi-page badge, `isWhiteboard`, and
 * `genKey`-based regenerate-in-place -- each a real, separately-scoped follow-up. */
export interface Diagram {
  id: number;
  title: string;
  xml: string;
  createdAt: number;
  modifiedAt: number;
}

interface PadState {
  notesText: string;
  decisions: Decision[];
  qaItems: QaItem[];
  remarks: Remark[];
  files: FileRef[];
  diagrams: Diagram[];
  nextId: number;

  setNotesText: (text: string) => void;
  /** Creates a blank decision and returns its id, matching legacy's real `createDecisionLog`
   * (legacy/index.html:35388-35413): auto-anchors to `candidateAnchorNodeId` only if that node
   * doesn't already have a decision log (the real one-per-node rule), otherwise creates the
   * decision unanchored rather than silently stealing/rejecting -- the caller's own anchor-picker
   * UI (a later slice) is where a blocked node actually surfaces to the user. */
  createDecision: (candidateAnchorNodeId: number | null) => string;
  removeDecision: (id: string) => void;
  setDecisionStatus: (id: string, status: DecisionStatus) => void;
  setDecisionField: (id: string, field: DecisionTextField, value: string) => void;
  setDecisionAuthor: (id: string, author: string) => void;
  /** Re-anchors a decision to `nodeId` (or unlinks it, for `null`) -- matches legacy's real
   * `setDecisionAnchor` (legacy/index.html:35175-35183): returns `false` and leaves the decision
   * untouched if `nodeId` already has a DIFFERENT decision anchored to it (the caller's own UI
   * is responsible for surfacing that as a toast/message, matching legacy's own
   * `showToast('That node already has a decision log')` at the orchestration layer, not this
   * store), `true` on a successful re-anchor. */
  setDecisionAnchor: (id: string, nodeId: number | null) => boolean;
  /** Matches legacy's real `reorderDecisionRow` (legacy/index.html:35247-35256) -- reuses
   * `diagramAnchor.ts`'s own `reorderDiagramsCore` directly rather than a near-duplicate, since
   * that function is already generic over any `{id}`-shaped list, not diagram-specific. */
  reorderDecision: (draggedId: string, targetId: string) => void;
  addQaItem: (question: string, answer: string) => void;
  removeQaItem: (id: number) => void;
  addRemark: (person: string, text: string) => void;
  removeRemark: (id: number) => void;
  addFile: (name: string, size: number, dataUrl: string, mimeType: string) => void;
  removeFile: (id: number) => void;
  /** Creates a blank diagram (matching legacy's own `createDiagram`: empty title, empty xml)
   * and returns its id so the caller can open the editor on it immediately. */
  addDiagram: () => number;
  /** Adds a diagram that already has XML content -- the Generate-from-outline entry point,
   * matching legacy's own `addDiagramFromXml`. Returns the new id. */
  addDiagramFromXml: (xml: string) => number;
  removeDiagram: (id: number) => void;
  renameDiagram: (id: number, title: string) => void;
  duplicateDiagram: (id: number) => void;
  /** Saves new XML into an existing diagram -- the editor's 'save' event handler. */
  updateDiagramXml: (id: number, xml: string) => void;
}

/**
 * Phase 3 slice (docs/framework-migration-plan.md): Pad, part 1 (store). 5 of Pad's 7 real
 * tabs -- Notes, Decision Log, Q&A, Remarks, Files -- each started as a simple document-level
 * CRUD list, deliberately NOT matching legacy's real schema for these (in legacy, decisions/
 * remarks/Q&A entries are anchored to a specific outline node via `anchorNodeId`; node-anchoring
 * was a real, separately-scoped follow-up if still wanted once the basic tabs existed).
 *
 * §6.6 slice (docs/phase6-full-parity-plan.md): Decision Log is the first of these to get its
 * real legacy schema (`anchorNodeId`, node-linking, the one-decision-per-node rule) -- see the
 * `Decision` interface's own header above for the full story. Remarks/Q&A stay flat,
 * document-level lists for now; each is its own real, separately-scoped follow-up if still
 * wanted.
 *
 * Phase 6.3 item 11 (docs/phase6-full-parity-plan.md): Files gained real upload/storage --
 * direct port of legacy's own `addFileAttachment` (legacy/index.html:41986-42004): read the
 * selected `File` via `FileReader.readAsDataURL`, store the resulting base64 data URI inline in
 * `FileRef.dataUrl`, same persistence tier as everything else in this store (no backend, no
 * separate upload endpoint -- legacy has never had one either). The 5MB-per-file cap
 * (`PAD_ATTACH_MAX_BYTES`) matches legacy's own limit exactly. Deliberately NOT ported, same
 * "flat, document-level list first pass" convention as Decision Log/Remarks/Q&A above:
 * `anchorNodeId` (node-linking + the anchor-picker UI), `addedBy`, and `note` -- each a real,
 * separately-scoped follow-up if still wanted, not silently dropped.
 */
export const usePadStore = create<PadState>((set, get) => ({
  notesText: '',
  decisions: [],
  qaItems: [],
  remarks: [],
  files: [],
  diagrams: [],
  nextId: 1,

  setNotesText: (notesText) => set({ notesText }),

  createDecision: (candidateAnchorNodeId) => {
    const { decisions } = get();
    const now = Date.now();
    const anchorNodeId =
      candidateAnchorNodeId != null && !decisionLogForNodeCore(decisions, candidateAnchorNodeId) ? candidateAnchorNodeId : null;
    const id = generateId('dl');
    const decision: Decision = {
      id,
      anchorNodeId,
      context: '',
      decision: '',
      rationale: '',
      alternatives: '',
      impact: '',
      status: 'proposed',
      author: '',
      timestamp: now,
      createdAt: now,
      modifiedAt: now
    };
    set({ decisions: [...decisions, decision] });
    return id;
  },
  removeDecision: (id) => set({ decisions: get().decisions.filter((d) => d.id !== id) }),
  setDecisionStatus: (id, status) =>
    set({ decisions: get().decisions.map((d) => (d.id === id ? { ...d, status, modifiedAt: Date.now() } : d)) }),
  setDecisionField: (id, field, value) =>
    set({ decisions: get().decisions.map((d) => (d.id === id ? { ...d, [field]: value, modifiedAt: Date.now() } : d)) }),
  setDecisionAuthor: (id, author) =>
    set({ decisions: get().decisions.map((d) => (d.id === id ? { ...d, author, modifiedAt: Date.now() } : d)) }),
  setDecisionAnchor: (id, nodeId) => {
    const { decisions } = get();
    if (nodeId != null && decisionLogForNodeCore(decisions, nodeId, id)) return false;
    set({ decisions: decisions.map((d) => (d.id === id ? { ...d, anchorNodeId: nodeId, modifiedAt: Date.now() } : d)) });
    return true;
  },
  reorderDecision: (draggedId, targetId) => {
    const decisions = get().decisions.map((d) => ({ ...d }));
    reorderDiagramsCore(decisions, draggedId, targetId);
    set({ decisions });
  },

  addQaItem: (question, answer) => {
    const { qaItems, nextId } = get();
    set({ qaItems: [...qaItems, { id: nextId, question, answer }], nextId: nextId + 1 });
  },
  removeQaItem: (id) => set({ qaItems: get().qaItems.filter((q) => q.id !== id) }),

  addRemark: (person, text) => {
    const { remarks, nextId } = get();
    set({ remarks: [...remarks, { id: nextId, person, text, date: todayDateStr() }], nextId: nextId + 1 });
  },
  removeRemark: (id) => set({ remarks: get().remarks.filter((r) => r.id !== id) }),

  addFile: (name, size, dataUrl, mimeType) => {
    const { files, nextId } = get();
    set({ files: [...files, { id: nextId, name, size, dataUrl, mimeType, addedAt: Date.now() }], nextId: nextId + 1 });
  },
  removeFile: (id) => set({ files: get().files.filter((f) => f.id !== id) }),

  addDiagram: () => {
    const { diagrams, nextId } = get();
    const ts = Date.now();
    const diagram: Diagram = { id: nextId, title: '', xml: '', createdAt: ts, modifiedAt: ts };
    set({ diagrams: [...diagrams, diagram], nextId: nextId + 1 });
    return nextId;
  },
  addDiagramFromXml: (xml) => {
    const { diagrams, nextId } = get();
    const ts = Date.now();
    const diagram: Diagram = { id: nextId, title: '', xml, createdAt: ts, modifiedAt: ts };
    set({ diagrams: [...diagrams, diagram], nextId: nextId + 1 });
    return nextId;
  },
  removeDiagram: (id) => set({ diagrams: get().diagrams.filter((d) => d.id !== id) }),
  renameDiagram: (id, title) =>
    set({ diagrams: get().diagrams.map((d) => (d.id === id ? { ...d, title, modifiedAt: Date.now() } : d)) }),
  duplicateDiagram: (id) => {
    const { diagrams, nextId } = get();
    const src = diagrams.find((d) => d.id === id);
    if (!src) return;
    const ts = Date.now();
    const copy: Diagram = { ...src, id: nextId, title: src.title ? `${src.title} (copy)` : '', createdAt: ts, modifiedAt: ts };
    set({ diagrams: [...diagrams, copy], nextId: nextId + 1 });
  },
  updateDiagramXml: (id, xml) =>
    set({ diagrams: get().diagrams.map((d) => (d.id === id ? { ...d, xml, modifiedAt: Date.now() } : d)) })
}));
