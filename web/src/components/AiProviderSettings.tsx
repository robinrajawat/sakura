import { useState, useEffect } from 'react';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import { useVaultStore } from '../store/vaultStore';
import { AI_BUILTIN_PROVIDERS, AI_CURATED_MODELS, getAiProviderById } from '../state/aiProviderCatalog';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.9 slice (docs/phase6-full-parity-plan.md): the "AI" section of Settings — provider select,
 * model select (curated list + a free-text "custom model id" fallback, matching legacy's real
 * `#ai-model-select`'s synthetic `__custom__` option), and API key entry/save/test. Direct port
 * of legacy's real `settings-section-ai-rewrite` markup (legacy/index.html:5336-5373), minus the
 * fallback-order list and usage summary (both real, separately-scoped §6.9 follow-ups — see
 * `aiSettingsStore.ts`'s own header for what this slice does and doesn't cover yet).
 *
 * The key input is intentionally never pre-filled with the saved plaintext (matches legacy: the
 * field clears after Save, and a saved key is represented only by the status line below it, not
 * by echoing it back into the input) — avoids a saved secret sitting in the DOM's own value
 * attribute longer than it needs to.
 */

const CUSTOM_MODEL_VALUE = '__custom__';

export function AiProviderSettings({ t }: { t: ThemeTokens }) {
  const provider = useAiSettingsStore((s) => s.provider);
  const model = useAiSettingsStore((s) => s.model);
  const setProvider = useAiSettingsStore((s) => s.setProvider);
  const setModel = useAiSettingsStore((s) => s.setModel);
  const getKeyForProvider = useAiSettingsStore((s) => s.getKeyForProvider);
  const keyStatusForProvider = useAiSettingsStore((s) => s.keyStatusForProvider);
  const saveKeyForProvider = useAiSettingsStore((s) => s.saveKeyForProvider);
  const testKeyForProvider = useAiSettingsStore((s) => s.testKeyForProvider);
  // Not read directly below -- `keyStatusForProvider`/`getKeyForProvider` already branch on live
  // vault state internally. Subscribing here exists purely so this component re-renders when the
  // vault is set up/unlocked/locked/disabled elsewhere (`SecureStorageSettings.tsx`), since
  // `vault.ts`'s own `vaultActive()`/`vaultUnlocked()` are plain function calls with no
  // subscription mechanism of their own -- see `vaultStore.ts`'s header for the full reasoning.
  useVaultStore((s) => s.active);
  useVaultStore((s) => s.unlocked);

  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // Tracks "the user just picked Custom model ID… from the dropdown" independently of whether
  // `model` itself already looks non-curated -- needed because switching into custom mode
  // deliberately keeps the current (curated) model value until the user actually types a
  // replacement, so `isCustomModel` alone can't tell the two apart yet.
  const [customMode, setCustomMode] = useState(false);

  const providerDef = getAiProviderById(provider);
  const curatedModels = AI_CURATED_MODELS[provider] || [];
  const isCustomModel = model !== '' && !curatedModels.some((m) => m.v === model);
  const showCustomInput = customMode || isCustomModel;
  const keyStatus = keyStatusForProvider(provider);

  // `statusMsg` is a transient "what just happened" message (a Save/Test result) layered over
  // the always-live `keyStatus` text below -- but it's plain React state, so it doesn't
  // automatically go stale when the vault's lock state changes elsewhere (SecureStorageSettings)
  // without this component re-rendering for any other reason. Clearing it whenever `locked`
  // itself flips (Lock/Unlock/Setup/Disable all change it) keeps a real vault-state change from
  // being permanently masked by an old "Key saved." message.
  useEffect(() => {
    setStatusMsg(null);
  }, [keyStatus.locked]);

  function handleProviderChange(nextId: string): void {
    setProvider(nextId);
    setKeyInput('');
    setStatusMsg(null);
    setCustomMode(false);
  }

  function handleModelSelectChange(value: string): void {
    if (value === CUSTOM_MODEL_VALUE) {
      // Switching into custom mode with no text yet -- keep the current model until the user
      // actually types something, same as legacy's own behavior (the select and the free-text
      // input stay in sync rather than clearing the real value immediately).
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    setModel(value);
  }

  async function handleSave(): Promise<void> {
    const value = keyInput || getKeyForProvider(provider);
    if (!value) return;
    setBusy('save');
    setStatusMsg(null);
    const result = await saveKeyForProvider(provider, value);
    setBusy(null);
    setKeyInput('');
    setStatusMsg(result.message);
  }

  async function handleTest(): Promise<void> {
    setBusy('test');
    setStatusMsg(null);
    const result = await testKeyForProvider(provider, model, keyInput || undefined);
    setBusy(null);
    setStatusMsg(result.message);
  }

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

  const selectStyle: React.CSSProperties = {
    font: 'inherit',
    padding: '4px 6px',
    borderRadius: 4,
    border: `1px solid ${t.border}`,
    background: t.background,
    color: t.text
  };

  return (
    <>
      <div style={sectionHeaderStyle}>AI</div>
      <div style={{ display: 'grid', gap: 12, fontSize: 12 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Provider</span>
          <select value={provider} onChange={(e) => handleProviderChange(e.currentTarget.value)} aria-label="AI provider" style={selectStyle}>
            {AI_BUILTIN_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>Model</span>
          <select value={showCustomInput ? CUSTOM_MODEL_VALUE : model} onChange={(e) => handleModelSelectChange(e.currentTarget.value)} aria-label="AI model" style={selectStyle}>
            {curatedModels.map((m) => (
              <option key={m.v} value={m.v}>
                {m.l}
              </option>
            ))}
            <option value={CUSTOM_MODEL_VALUE}>Custom model ID…</option>
          </select>
          {showCustomInput && (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
              placeholder="exact model id"
              aria-label="Custom AI model ID"
              style={{ font: 'inherit', padding: '4px 6px', borderRadius: 4, border: `1px solid ${t.border}`, background: t.background, color: t.text }}
            />
          )}
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>API key</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={keyInput}
              onChange={(e) => setKeyInput(e.currentTarget.value)}
              placeholder={keyStatus.hasKey ? '•••••••• (saved — enter a new key to replace)' : 'paste API key'}
              aria-label="AI provider API key"
              style={{ font: 'inherit', padding: '4px 6px', borderRadius: 4, border: `1px solid ${t.border}`, background: t.background, color: t.text, flex: 1, minWidth: 0 }}
            />
            <button type="button" onClick={() => setShowKey((v) => !v)} aria-label={showKey ? 'Hide key' : 'Show key'} title={showKey ? 'Hide key' : 'Show key'}>
              {showKey ? '🙈' : '👁'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={handleSave} disabled={busy !== null || (!keyInput && !keyStatus.hasKey)}>
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={handleTest} disabled={busy !== null || (!keyInput && !keyStatus.hasKey)}>
              {busy === 'test' ? 'Testing…' : 'Test'}
            </button>
          </div>
          <div style={{ fontSize: 11, color: t.mutedText }} role="status">
            {statusMsg ??
              (keyStatus.locked
                ? 'Key saved, but Secure Storage is locked.'
                : keyStatus.hasKey
                  ? `Key saved (${keyStatus.length ?? 0} chars).`
                  : 'No key saved.')}
          </div>
          <div style={{ fontSize: 11, color: t.mutedText }}>{providerDef.keyHint}</div>
        </label>
      </div>
    </>
  );
}
