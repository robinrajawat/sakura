import { useAutoRewriteStore } from '../store/autoRewriteStore';
import type { AutoRewriteExclusions } from '../state/autoRewrite';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.9 slice 4 (docs/phase6-full-parity-plan.md): the "Auto-rewrite" section of Settings —
 * direct port of legacy's real auto-rewrite Settings block (the enable toggle, four exclusion
 * checkboxes, and the minWords/batchCap/idleSec threshold controls `store/autoRewriteStore.ts`
 * implements). A "Retry now" button appears only while paused-on-no-key, matching
 * `autoRewriteStore.ts`'s own documented simplification: legacy auto-resumes the moment a key
 * becomes available again, this instead needs an explicit retry (see that store's own header for
 * why — avoiding a circular import between it and `aiSettingsStore.ts`).
 */

const EXCLUSION_LABELS: { key: keyof AutoRewriteExclusions; label: string; hint: string }[] = [
  { key: 'checkbox', label: 'Checkbox nodes', hint: "Don't auto-rewrite checkbox items." },
  { key: 'heading', label: 'Heading nodes', hint: "Don't auto-rewrite nodes with a heading style." },
  { key: 'decisionlog', label: 'Decision Log fields', hint: "Don't auto-rewrite a node's own Context/Decision/Rationale/Alternatives/Impact/Status text." },
  { key: 'syntax', label: 'Backlinks & inline code', hint: "Don't auto-rewrite text containing [[backlinks]] or `code`." }
];

export function AutoRewriteSettings({ t }: { t: ThemeTokens }) {
  const enabled = useAutoRewriteStore((s) => s.enabled);
  const setEnabled = useAutoRewriteStore((s) => s.setEnabled);
  const exclusions = useAutoRewriteStore((s) => s.exclusions);
  const setExclusion = useAutoRewriteStore((s) => s.setExclusion);
  const minWords = useAutoRewriteStore((s) => s.minWords);
  const setMinWords = useAutoRewriteStore((s) => s.setMinWords);
  const batchCap = useAutoRewriteStore((s) => s.batchCap);
  const setBatchCap = useAutoRewriteStore((s) => s.setBatchCap);
  const idleSec = useAutoRewriteStore((s) => s.idleSec);
  const setIdleSec = useAutoRewriteStore((s) => s.setIdleSec);
  const pausedNoKey = useAutoRewriteStore((s) => s.pausedNoKey);
  const queueSize = useAutoRewriteStore((s) => s.queue.size);
  const flushNow = useAutoRewriteStore((s) => s.flushNow);

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
      <div style={sectionHeaderStyle}>Auto-rewrite</div>
      <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.currentTarget.checked)} aria-label="Enable auto-rewrite" />
          <span>
            Rewrite nodes automatically on commit
            <div style={{ fontSize: 11, color: t.mutedText }}>Sends a node's text for AI correction shortly after you finish editing it.</div>
          </span>
        </label>

        {pausedNoKey && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.mutedText }}>
            <span>Paused — no AI key available ({queueSize} waiting).</span>
            <button type="button" onClick={() => void flushNow()}>
              Retry now
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{ color: t.mutedText }}>Don't auto-rewrite:</span>
          {EXCLUSION_LABELS.map((ex) => (
            <label key={ex.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={exclusions[ex.key]} onChange={(e) => setExclusion(ex.key, e.currentTarget.checked)} aria-label={ex.label} />
              <span>
                {ex.label}
                <div style={{ fontSize: 11, color: t.mutedText }}>{ex.hint}</div>
              </span>
            </label>
          ))}
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Minimum words ({minWords})</span>
          <input type="range" min={0} max={20} step={1} value={minWords} onChange={(e) => setMinWords(Number(e.currentTarget.value))} aria-label="Auto-rewrite minimum words" />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Batch cap ({batchCap} nodes)</span>
          <input type="range" min={2} max={50} step={1} value={batchCap} onChange={(e) => setBatchCap(Number(e.currentTarget.value))} aria-label="Auto-rewrite batch cap" />
          <div style={{ fontSize: 11, color: t.mutedText }}>Flushes immediately once this many nodes are queued.</div>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Idle delay ({idleSec}s)</span>
          <input type="range" min={1} max={300} step={1} value={idleSec} onChange={(e) => setIdleSec(Number(e.currentTarget.value))} aria-label="Auto-rewrite idle delay" />
          <div style={{ fontSize: 11, color: t.mutedText }}>Flushes after this many seconds of no further edits.</div>
        </label>
      </div>
    </>
  );
}
