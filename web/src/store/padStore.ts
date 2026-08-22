import { create } from 'zustand';

export interface Decision {
  id: number;
  title: string;
  description: string;
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
}

export interface FileRef {
  id: number;
  name: string;
}

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
  addQaItem: (question: string, answer: string) => void;
  removeQaItem: (id: number) => void;
  addRemark: (person: string, text: string) => void;
  removeRemark: (id: number) => void;
  addFile: (name: string) => void;
  removeFile: (id: number) => void;
}

/**
 * Phase 3 slice (docs/framework-migration-plan.md): Pad, part 1 (store). 5 of Pad's 7 real
 * tabs -- Notes, Decision Log, Q&A, Remarks, Files -- each a simple document-level CRUD list,
 * deliberately NOT matching legacy's real schema for these (in legacy, decisions/remarks/Q&A
 * entries are anchored to a specific outline node via `anchorNodeId`; here they're flat,
 * document-level lists for this first pass, with node-anchoring a real, separately-scoped
 * follow-up if it's still wanted once the basic tabs exist). Files is name-only -- no real
 * upload/storage layer exists yet (no backend), so a "file" here is just a recorded name.
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
    set({ decisions: [...decisions, { id: nextId, title, description }], nextId: nextId + 1 });
  },
  removeDecision: (id) => set({ decisions: get().decisions.filter((d) => d.id !== id) }),

  addQaItem: (question, answer) => {
    const { qaItems, nextId } = get();
    set({ qaItems: [...qaItems, { id: nextId, question, answer }], nextId: nextId + 1 });
  },
  removeQaItem: (id) => set({ qaItems: get().qaItems.filter((q) => q.id !== id) }),

  addRemark: (person, text) => {
    const { remarks, nextId } = get();
    set({ remarks: [...remarks, { id: nextId, person, text }], nextId: nextId + 1 });
  },
  removeRemark: (id) => set({ remarks: get().remarks.filter((r) => r.id !== id) }),

  addFile: (name) => {
    const { files, nextId } = get();
    set({ files: [...files, { id: nextId, name }], nextId: nextId + 1 });
  },
  removeFile: (id) => set({ files: get().files.filter((f) => f.id !== id) })
}));
