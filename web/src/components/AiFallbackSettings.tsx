import { useState } from 'react';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import { useVaultStore } from '../store/vaultStore';
import { getAllAiProviders } from '../state/aiProviderCatalog';
import { getAiUsageForProvider } from '../state/aiUsage';
import { hasStoredKeyForProvider } from '../state/aiProviders';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.9 slice 9 (docs/phase6-full-parity-plan.md): the provider fallback chain UI — direct port
 * of legacy's real `renderFallbackOrderList`/`applyFallbackToggle` (legacy/index.html:29543-
 * 29634). An enable toggle, and (when on) a drag-to-reorder list of every built-in provider with
 * a per-row enable checkbox: the primary provider always shows first, disabled/non-draggable
 * (matches legacy's own real `isPrimary` row treatment exactly, including staying visible rather
 * than being filtered out — seeing it in context is the point). Each row shows a usage badge
 * ("N today (F failed)") when there's real usage today, and a "— no key"/"— locked" note when the
 * provider has no usable key right now.
 *
 * Drag-and-drop is a simpler linear reorder than `OutlineTree.tsx`'s own 3-zone (above/child/
 * below) node drag — this list has no nesting, just a flat priority order — but still native
 * HTML5 `draggable`, matching this project's own established DnD approach rather than pulling in
 * a library. `aiFallback.ts`'s own `reorderFallbackEntryCore` (called via `aiSettingsStore.ts`'s
 * `reorderFallback`) preserves legacy's real splice-based reorder quirk exactly — see that
 * function's own header.
 */
export function AiFallbackSettings({ t }: { t: ThemeTokens }) {
  const provider = useAiSettingsStore((s) => s.provider);
  const fallbackEnabled = useAiSettingsStore((s) => s.fallbackEnabled);
  const fallbackOrder = useAiSettingsStore((s) => s.fallbackOrder);
  const setFallbackEnabled = useAiSettingsStore((s) => s.setFallbackEnabled);
  const setFallbackEntryEnabled = useAiSettingsStore((s) => s.setFallbackEntryEnabled);
  const reorderFallback = useAiSettingsStore((s) => s.reorderFallback);
  const getKeyForProvider = useAiSettingsStore((s) => s.getKeyForProvider);
  // Same reasoning as `AiProviderSettings.tsx`'s own vault-state subscription — re-render this
  // list when Secure Storage locks/unlocks elsewhere, since the "— no key"/"— locked" distinction
  // per row depends on live vault state that has no subscription mechanism of its own.
  const vaultActiveFlag = useVaultStore((s) => s.active);
  const vaultUnlockedFlag = useVaultStore((s) => s.unlocked);

  const [draggedId, setDraggedId] = useState<string | null>(null);

  const all = getAllAiProviders();
  const eligibleCount = fallbackOrder.filter((e) => e.enabled && e.id !== provider && !!getKeyForProvider(e.id)).length;
  const lockedElsewhere = vaultActiveFlag && !vaultUnlockedFlag && fallbackOrder.some((e) => e.id !== provider && e.enabled && hasStoredKeyForProvider(e.id));

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '.04em',
    textTransform: 'uppercase',
    color: t.mutedText,
    margin: '16px 0 8px',
    paddingBottom: 6,
    borderBottom: `1px solid ${t.border}`
  };

  return (
    <>
      <div style={sectionHeaderStyle}>AI Fallback</div>
      <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={fallbackEnabled} onChange={(e) => setFallbackEnabled(e.currentTarget.checked)} aria-label="Enable AI fallback" />
          <span>Enable AI fallback</span>
        </label>
        <div style={{ fontSize: 11, color: t.mutedText }}>
          If the primary provider hits a quota limit or errors, try the next enabled provider below automatically.
        </div>

        {fallbackEnabled && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            {fallbackOrder.map((entry) => {
              const p = all.find((x) => x.id === entry.id);
              if (!p) return null;
              const isPrimary = p.id === provider;
              const hasKey = !!getKeyForProvider(p.id);
              const usage = getAiUsageForProvider(p.id);
              return (
                <div
                  key={entry.id}
                  draggable={!isPrimary}
                  onDragStart={() => setDraggedId(entry.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedId && draggedId !== entry.id) reorderFallback(draggedId, entry.id);
                    setDraggedId(null);
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '5px 8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: 7,
                    background: t.background,
                    opacity: isPrimary ? 0.45 : 1
                  }}
                >
                  <span aria-hidden style={{ color: t.mutedText, cursor: isPrimary ? 'default' : 'grab', flexShrink: 0 }}>
                    ⠿
                  </span>
                  <input
                    type="checkbox"
                    checked={entry.enabled && !isPrimary}
                    disabled={isPrimary}
                    onChange={(e) => setFallbackEntryEnabled(entry.id, e.currentTarget.checked)}
                    aria-label={`Enable ${p.label} as a fallback`}
                  />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {p.label}
                    {isPrimary ? ' (primary)' : ''}
                    {!hasKey && !isPrimary && (
                      <span style={{ color: t.mutedText, fontWeight: 400 }}>
                        {vaultActiveFlag && !vaultUnlockedFlag && hasStoredKeyForProvider(p.id) ? ' — locked' : ' — no key'}
                      </span>
                    )}
                    {usage.count > 0 && (
                      <span style={{ color: t.mutedText, fontWeight: 400 }}>
                        {' · '}
                        {usage.count} today{usage.fails ? ` (${usage.fails} failed)` : ''}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            {!eligibleCount && (
              <div style={{ fontSize: 11, color: t.mutedText, padding: '4px 2px' }} role="status">
                {lockedElsewhere ? 'Fallback providers have keys saved, but Secure Storage is locked — unlock it to use them.' : 'No other checked provider has a key saved, so fallback has nowhere to go yet.'}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
