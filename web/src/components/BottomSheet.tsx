import type { ReactNode } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * §6.5 slice (docs/phase6-full-parity-plan.md), Mobile Hub. Direct-in-spirit port of legacy's
 * reusable bottom-sheet detail view shell (legacy/hub.html:256-291, `.hub-modal-overlay`/
 * `.hub-sheet`) -- a full-width sheet anchored to the bottom of the viewport (centered instead
 * above legacy's own 520px breakpoint, matched here too), a drag-handle bar, a close button, and
 * a scrollable body. Used by both `MobileHubTodos.tsx`'s task detail sheet and
 * `MobileHubJournal.tsx`'s entry detail sheet, same "one reusable shell, two real callers"
 * shape as legacy's own component.
 */
export function BottomSheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,.5)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 480,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: t.editBg,
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -10px 36px rgba(0,0,0,.22)'
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 999, background: t.border, margin: '10px auto 2px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 8px 10px 20px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: t.text }}>{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: 'none',
              background: t.toolbarButtonBg,
              color: t.mutedText,
              fontSize: 17,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            ×
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 20px 20px', flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>
  );
}
