import { create } from 'zustand';

/**
 * §6.10 slice 3 (docs/phase6-full-parity-plan.md): Quick Assist's own open/closed state --
 * matches legacy's real `setQaOpen`/`toggleQa` (legacy/index.html:17633-17650) in spirit, minus
 * the `zenRevealAppbar`/`revealStatusbar` chrome-reveal side effects (`web/` has no zen mode or
 * collapsible status bar to reveal). Deliberately ephemeral, non-persisted -- unlike
 * `iconPickerStore.ts`, there's no per-node payload to carry, just whether the box is open, so a
 * single boolean plus open/close/toggle actions is the whole store. Kept separate from
 * `state/quickAssist.ts` (the pure command/action logic) the same way `iconPickerStore.ts` is
 * kept separate from `state/aiIcon.ts` -- this is transient UI state a global keyboard shortcut
 * (App.tsx) and a toolbar button both need to reach, not business logic.
 */
interface QuickAssistUiState {
  open: boolean;
  openBox: () => void;
  closeBox: () => void;
  toggleBox: () => void;
}

export const useQuickAssistStore = create<QuickAssistUiState>((set, get) => ({
  open: false,
  openBox: () => set({ open: true }),
  closeBox: () => set({ open: false }),
  toggleBox: () => set({ open: !get().open })
}));
