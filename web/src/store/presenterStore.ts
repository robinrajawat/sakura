import { create } from 'zustand';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): the first concrete step of the Audience
 * View/dual-screen re-scoping recorded in that plan's own §6.6 section. Lifts `PresenterMode.tsx`'s
 * presenting state (slide index, blanked, laser, overview, notes, elapsed timer) out of that
 * component's local `useState` and into a real store -- a pure refactor, no behavior change on
 * its own, but a real prerequisite: legacy's own Audience View works by the opener window calling
 * functions that mutate the SECOND window's own state directly (`win.enterPresenterMode()`,
 * `win.previewSlideIndex`, etc. -- see phase6-full-parity-plan.md's §6.6 section for the full
 * mechanism this is building toward). `web/`'s React architecture has no equivalent of mutating
 * another component's local `useState` from outside it; a second window's own React tree needs
 * something external to actually be driven through, which local component state can never be.
 * This store is that "something external" -- the presenting surface a future audience-window
 * bridge (a `window`-exposed object of store actions, mirroring legacy's own direct
 * cross-window function-call approach) will read and drive, once built.
 *
 * Deliberately NOT persisted to localStorage -- this is ephemeral per-presentation-session state,
 * matching the exact behavior the local `useState` it replaces already had (resets to defaults
 * every time Presenter Mode is entered, never survives a reload).
 */
interface PresenterState {
  slideIndex: number;
  blanked: boolean;
  laserOn: boolean;
  laserPos: { x: number; y: number } | null;
  overviewOpen: boolean;
  notesOpen: boolean;
  elapsedSec: number;
  startedAt: number;

  /** Resets every field to its fresh-session default and stamps `startedAt` to now -- called
   * once when Presenter Mode is entered, the same moment legacy's own `startPresenterTimer`
   * fires at and the local `useState` version of this file used to reset via its mount effect. */
  enterPresenting: () => void;
  setSlideIndex: (i: number) => void;
  setBlanked: (on: boolean) => void;
  setLaserOn: (on: boolean) => void;
  setLaserPos: (pos: { x: number; y: number } | null) => void;
  setOverviewOpen: (on: boolean) => void;
  setNotesOpen: (on: boolean) => void;
  /** Recomputes `elapsedSec` from `startedAt` against the current clock -- called once a second
   * by PresenterMode's own running-timer interval, matching `formatElapsed`'s expected input. */
  tickElapsed: () => void;
}

export const usePresenterStore = create<PresenterState>((set, get) => ({
  slideIndex: 0,
  blanked: false,
  laserOn: false,
  laserPos: null,
  overviewOpen: false,
  notesOpen: false,
  elapsedSec: 0,
  startedAt: Date.now(),

  enterPresenting: () =>
    set({
      slideIndex: 0,
      blanked: false,
      laserOn: false,
      laserPos: null,
      overviewOpen: false,
      notesOpen: false,
      elapsedSec: 0,
      startedAt: Date.now()
    }),
  setSlideIndex: (i) => set({ slideIndex: i }),
  setBlanked: (on) => set({ blanked: on }),
  setLaserOn: (on) => set({ laserOn: on }),
  setLaserPos: (pos) => set({ laserPos: pos }),
  setOverviewOpen: (on) => set({ overviewOpen: on }),
  setNotesOpen: (on) => set({ notesOpen: on }),
  tickElapsed: () => set({ elapsedSec: Math.floor((Date.now() - get().startedAt) / 1000) })
}));
