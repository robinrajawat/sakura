import { useEffect } from 'react';

/**
 * §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): Escape-to-close for a modal, direct
 * port of the pattern every one of legacy's real overlay modals uses (e.g. `feedback-modal-
 * overlay`'s own `if(e.key==='Escape'...)closeFeedbackModal()`, legacy/index.html:8479-8481).
 * Shared by `FeedbackModal.tsx`/`HelpModal.tsx`/`AboutModal.tsx` (all three added this slice)
 * rather than each keeping its own copy of the same six-line effect.
 */
export function useEscapeToClose(onClose: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
}
