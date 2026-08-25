import { useEffect } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useIconPickerStore } from '../store/iconPickerStore';
import { applyIconChoice } from '../state/aiIcon';

/**
 * §6.9 slice 7 (docs/phase6-full-parity-plan.md): the candidate picker for Suggest icon's
 * single-node path, shown when `state/aiIcon.ts`'s `suggestIconChoiceForNode` finds more than one
 * distinct candidate (keyword/historical/AI-suggested emoji) and there's a real decision to make.
 * Direct-effect port of legacy's real `showIconPickerPopover` (legacy/index.html:29226-29258) —
 * one click applies a candidate and closes, clicking elsewhere or Escape dismisses with no change
 * — but deliberately NOT its pixel-precise anchor-above-the-row positioning: `web/`'s tree rows
 * have no stable selector equivalent to legacy's own `.node-row[data-id]`, so this always renders
 * centered, matching legacy's own real fallback path for when no anchor row is found
 * (legacy/index.html:29247-29249) rather than inventing new positioning behavior — see
 * `state/aiIcon.ts`'s own header for the fuller "port the effect, not the exact technique" note.
 * Rendered once from `App.tsx`, same as `RestructureTextDialog.tsx`; reads which node (if any) has
 * a picker open from `iconPickerStore.ts` rather than props, since both the toolbar button and
 * `OutlineTree.tsx`'s right-click menu need to open it and `OutlineTree.tsx` takes no props.
 */
export function IconPickerPopover() {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const nodeId = useIconPickerStore((s) => s.nodeId);
  const candidates = useIconPickerStore((s) => s.candidates);
  const close = useIconPickerStore((s) => s.close);

  useEffect(() => {
    if (nodeId === null) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [nodeId, close]);

  if (nodeId === null) return null;

  function choose(icon: string): void {
    if (nodeId === null) return;
    applyIconChoice(nodeId, icon);
    close();
  }

  return (
    <div
      role="presentation"
      onClick={close}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.15)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        role="dialog"
        aria-label="Choose an icon"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.background,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 10,
          padding: 10,
          display: 'flex',
          gap: 6,
          boxShadow: '0 14px 28px rgba(0,0,0,.2)'
        }}
      >
        {candidates.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => choose(c)}
            title={c}
            aria-label={`Use icon ${c}`}
            style={{ fontSize: 20, lineHeight: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${t.border}`, background: t.background, cursor: 'pointer' }}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
