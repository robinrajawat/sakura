import { create } from 'zustand';
import type { AutoRewriteExclusions } from '../state/autoRewrite';
import { useAiSettingsStore } from './aiSettingsStore';
import { rewriteNodes } from '../state/aiRewrite';

/**
 * §6.9 slice 4 (docs/phase6-full-parity-plan.md): auto-rewrite on commit's real queue/flush
 * engine. Direct port of legacy's real `queueAutoRewrite`/`flushAutoRewriteQueue`
 * (legacy/index.html:28619-28761) — a committed node that clears `shouldAutoRewriteNode`
 * (`state/autoRewrite.ts`) joins a pending queue; the queue flushes (one `rewriteNodes` batch
 * call) on whichever comes first: `batchCap` nodes queued, or `idleSec` seconds of no new
 * commits. `commitEdit`/queueing itself is triggered from `OutlineTree.tsx`'s own real commit
 * call sites (Enter and blur), not from this store or `outlineStore.ts` — matches
 * `aiRewrite.ts`'s own established "plain orchestration, not a new store per concern" reasoning,
 * and keeps `outlineStore.ts` itself free of any AI-awareness.
 *
 * **Deliberate simplification from legacy's real pause/resume behavior:** legacy auto-resumes a
 * paused (no-key) queue the moment a key becomes available again, via `updateAiKeyStatus()`
 * firing after every key save/provider switch/vault unlock. Wiring that same auto-resume here
 * would need `aiSettingsStore.ts` to import this store back (it already gets imported here for
 * `getKeyForProvider`), a real circular-import risk for a background convenience. Instead, a
 * paused queue stays paused until the user explicitly retries (`flushNow()` again, surfaced as a
 * "Retry now" button in `AutoRewriteSettings.tsx` and the status chip) — queued node ids are
 * never lost either way, just not flushed automatically. A real, documented scope-down, not
 * silently dropped.
 *
 * Idle-timer scheduling uses a plain module-level `setTimeout` handle (not Zustand state —
 * timer handles aren't meaningfully serializable/comparable state).
 */

const STORAGE_KEY = 'sakura_web_auto_rewrite_v1';
const MAX_CONSECUTIVE_FAILS = 3; // matches legacy's own real AUTO_REWRITE_MAX_FAILS exactly

function ls(): Storage | null {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

interface PersistedAutoRewritePrefs {
  enabled: boolean;
  exclusions: AutoRewriteExclusions;
  minWords: number;
  batchCap: number;
  idleSec: number;
}

// Matches legacy's own real top-level defaults exactly: auto-rewrite off by default, all four
// exclusions on, minWords=5, batchCap=5 (range 2-50), idleSec=120 (range 1-300).
const DEFAULTS: PersistedAutoRewritePrefs = {
  enabled: false,
  exclusions: { checkbox: true, heading: true, decisionlog: true, syntax: true },
  minWords: 5,
  batchCap: 5,
  idleSec: 120
};

function clampMinWords(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(20, Math.max(0, n)) : DEFAULTS.minWords;
}
function clampBatchCap(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(50, Math.max(2, n)) : DEFAULTS.batchCap;
}
function clampIdleSec(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(300, Math.max(1, n)) : DEFAULTS.idleSec;
}

function loadPersisted(): PersistedAutoRewritePrefs {
  try {
    const raw = ls()?.getItem(STORAGE_KEY);
    const d = raw ? JSON.parse(raw) : {};
    return {
      enabled: !!d.enabled,
      exclusions: {
        checkbox: d.exclusions?.checkbox === undefined ? true : !!d.exclusions.checkbox,
        heading: d.exclusions?.heading === undefined ? true : !!d.exclusions.heading,
        decisionlog: d.exclusions?.decisionlog === undefined ? true : !!d.exclusions.decisionlog,
        syntax: d.exclusions?.syntax === undefined ? true : !!d.exclusions.syntax
      },
      minWords: d.minWords === undefined ? DEFAULTS.minWords : clampMinWords(d.minWords),
      batchCap: d.batchCap === undefined ? DEFAULTS.batchCap : clampBatchCap(d.batchCap),
      idleSec: d.idleSec === undefined ? DEFAULTS.idleSec : clampIdleSec(d.idleSec)
    };
  } catch {
    return DEFAULTS;
  }
}

function savePersisted(p: PersistedAutoRewritePrefs): void {
  try {
    ls()?.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Best-effort, matches every other storage write in this project.
  }
}

let idleTimer: ReturnType<typeof setTimeout> | null = null;
function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

interface AutoRewriteState extends PersistedAutoRewritePrefs {
  queue: Set<number>;
  busy: boolean;
  pausedNoKey: boolean;
  consecutiveFails: number;

  setEnabled: (on: boolean) => void;
  setExclusion: (key: keyof AutoRewriteExclusions, on: boolean) => void;
  setMinWords: (n: number) => void;
  setBatchCap: (n: number) => void;
  setIdleSec: (n: number) => void;

  /** Queues a just-committed node's id if auto-rewrite is enabled — a no-op otherwise. Flushes
   * immediately once the queue reaches `batchCap`; otherwise (re)starts the `idleSec` timer. */
  queueNode: (id: number) => void;
  /** Sends the current queue as one batch `rewriteNodes` call. A no-op if the queue is empty. If
   * no AI key is currently available, pauses (keeps the queue intact, sets `pausedNoKey`) rather
   * than discarding it. Disables auto-rewrite entirely after `MAX_CONSECUTIVE_FAILS` consecutive
   * failed flushes, matching legacy's own real behavior. */
  flushNow: () => Promise<void>;
  /** Live status text for the chip — matches legacy's real `sb-auto-rewrite-chip` states. */
  statusText: () => string;
}

export const useAutoRewriteStore = create<AutoRewriteState>((set, get) => ({
  ...loadPersisted(),
  queue: new Set<number>(),
  busy: false,
  pausedNoKey: false,
  consecutiveFails: 0,

  setEnabled: (on) => {
    const next = { enabled: on, exclusions: get().exclusions, minWords: get().minWords, batchCap: get().batchCap, idleSec: get().idleSec };
    savePersisted(next);
    if (!on) {
      clearIdleTimer();
      set({ enabled: false, queue: new Set(), pausedNoKey: false });
    } else {
      set({ enabled: true });
    }
  },

  setExclusion: (key, on) => {
    const exclusions = { ...get().exclusions, [key]: on };
    savePersisted({ enabled: get().enabled, exclusions, minWords: get().minWords, batchCap: get().batchCap, idleSec: get().idleSec });
    set({ exclusions });
  },

  setMinWords: (n) => {
    const minWords = clampMinWords(n);
    savePersisted({ enabled: get().enabled, exclusions: get().exclusions, minWords, batchCap: get().batchCap, idleSec: get().idleSec });
    set({ minWords });
  },

  setBatchCap: (n) => {
    const batchCap = clampBatchCap(n);
    savePersisted({ enabled: get().enabled, exclusions: get().exclusions, minWords: get().minWords, batchCap, idleSec: get().idleSec });
    set({ batchCap });
  },

  setIdleSec: (n) => {
    const idleSec = clampIdleSec(n);
    savePersisted({ enabled: get().enabled, exclusions: get().exclusions, minWords: get().minWords, batchCap: get().batchCap, idleSec });
    set({ idleSec });
  },

  queueNode: (id) => {
    const s = get();
    if (!s.enabled) return;
    const queue = new Set(s.queue);
    queue.add(id);
    set({ queue, pausedNoKey: false });
    if (queue.size >= s.batchCap) {
      void get().flushNow();
      return;
    }
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      void get().flushNow();
    }, s.idleSec * 1000);
  },

  flushNow: async () => {
    clearIdleTimer();
    const s = get();
    if (!s.queue.size || s.busy) return;

    const ai = useAiSettingsStore.getState();
    const apiKey = ai.getKeyForProvider(ai.provider);
    if (!apiKey) {
      set({ pausedNoKey: true });
      return;
    }

    const ids = Array.from(s.queue);
    set({ queue: new Set(), busy: true, pausedNoKey: false });
    try {
      const result = await rewriteNodes(ids);
      set({ busy: false, consecutiveFails: result.ok ? 0 : get().consecutiveFails + 1 });
      if (!result.ok && get().consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
        get().setEnabled(false);
      }
    } catch {
      set({ busy: false, consecutiveFails: get().consecutiveFails + 1 });
      if (get().consecutiveFails >= MAX_CONSECUTIVE_FAILS) get().setEnabled(false);
    }
  },

  statusText: () => {
    const s = get();
    if (!s.enabled) return 'Auto-rewrite: Off';
    if (s.busy) return '✦ Rewriting…';
    if (s.pausedNoKey) return `✦ Auto-rewrite paused (${s.queue.size} waiting)`;
    if (s.queue.size > 0) return `✦ Auto-rewrite · ${s.queue.size} queued`;
    return '✦ Auto-rewrite';
  }
}));
