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

interface PadState {
  notesText: string;
  decisions: Decision[];
  qaItems: QaItem[];
  remarks: Remark[];
  files: FileRef[];
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
  removeFile: (id) => set({ files: get().files.filter((f) => f.id !== id) })
}));
