import { create } from 'zustand';
import { todayDateStr } from '../utils/remarkDate';

export type DecisionStatus = 'proposed' | 'approved' | 'rejected';

export interface Decision {
  id: number;
  title: string;
  description: string;
  status: DecisionStatus;
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
  addDecision: (title: string, description: string) => void;
  removeDecision: (id: number) => void;
  setDecisionStatus: (id: number, status: DecisionStatus) => void;
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
 * tabs -- Notes, Decision Log, Q&A, Remarks, Files -- each a simple document-level CRUD list,
 * deliberately NOT matching legacy's real schema for these (in legacy, decisions/remarks/Q&A
 * entries are anchored to a specific outline node via `anchorNodeId`; here they're flat,
 * document-level lists for this first pass, with node-anchoring a real, separately-scoped
 * follow-up if it's still wanted once the basic tabs exist).
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

  addDecision: (title, description) => {
    const { decisions, nextId } = get();
    set({ decisions: [...decisions, { id: nextId, title, description, status: 'proposed' }], nextId: nextId + 1 });
  },
  removeDecision: (id) => set({ decisions: get().decisions.filter((d) => d.id !== id) }),
  setDecisionStatus: (id, status) =>
    set({ decisions: get().decisions.map((d) => (d.id === id ? { ...d, status } : d)) }),

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
