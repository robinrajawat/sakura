import { useState } from 'react';
import { useVaultStore } from '../store/vaultStore';
import type { ThemeTokens } from '../store/themeStore';
import { LockIcon, UnlockIcon } from '../icons';

/**
 * §6.9 slice 2 (docs/phase6-full-parity-plan.md): the Secure Storage vault's setup/unlock/lock/
 * disable UI — direct port of legacy's real Settings → Secure Storage controls
 * (`updateVaultStatusUI`, legacy/index.html, driven by the same `setupVaultPassphrase`/
 * `unlockVault`/`lockVault`/`disableVaultEncryption` this PR's `vaultStore.ts` reimplements).
 *
 * Passphrase entry is an inline expandable form rather than legacy's own `sakuraPasswordPrompt`
 * modal dialogs — `web/` has no generic modal-dialog component yet, and every other confirm-style
 * interaction in this project already stands in with a native browser primitive
 * (`window.confirm`, see `HubLibraryPanel.tsx`/`SidebarFileExplorer.tsx`/etc.'s own header
 * comments) rather than building one custom modal system per feature. A two-field passphrase +
 * confirm form doesn't map cleanly onto `window.prompt`'s single-value shape, so an inline form
 * is the more honest "simpler chrome" stand-in here, same category of call as those.
 *
 * Legacy's status-bar `sb-vault-chip` (visible only while locked, left-click to unlock) is NOT
 * ported — `web/` has no status bar surface yet (`§6.1`'s "status bar" item is unbuilt); the
 * locked/unlocked state is instead surfaced only here, inside Settings. A real, separately-scoped
 * follow-up once a status bar exists.
 */
export function SecureStorageSettings({ t }: { t: ThemeTokens }) {
  const active = useVaultStore((s) => s.active);
  const unlocked = useVaultStore((s) => s.unlocked);
  const setup = useVaultStore((s) => s.setup);
  const unlock = useVaultStore((s) => s.unlock);
  const lock = useVaultStore((s) => s.lock);
  const disable = useVaultStore((s) => s.disable);

  const [formOpen, setFormOpen] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  function resetForm(): void {
    setFormOpen(false);
    setPassphrase('');
    setConfirmPassphrase('');
  }

  async function handleSetup(): Promise<void> {
    setBusy(true);
    setStatusMsg(null);
    const result = await setup(passphrase, confirmPassphrase);
    setBusy(false);
    setStatusMsg(result.message);
    if (result.ok) resetForm();
    else setConfirmPassphrase('');
  }

  async function handleUnlock(): Promise<void> {
    setBusy(true);
    setStatusMsg(null);
    const result = await unlock(passphrase);
    setBusy(false);
    setStatusMsg(result.message);
    if (result.ok) resetForm();
    else setPassphrase('');
  }

  async function handleDisable(): Promise<void> {
    if (!window.confirm('Disable Secure Storage? Every AI provider key will be stored as plaintext again.')) return;
    setBusy(true);
    setStatusMsg(null);
    const result = await disable();
    setBusy(false);
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

  const inputStyle: React.CSSProperties = { font: 'inherit', padding: '4px 6px', borderRadius: 4, border: `1px solid ${t.border}`, background: t.background, color: t.text };

  return (
    <>
      <div style={sectionHeaderStyle}>Secure Storage</div>
      <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
        <div style={{ color: t.mutedText, display: 'flex', alignItems: 'center', gap: 5 }}>
          {active ? (
            unlocked ? (
              <>
                <UnlockIcon width={12} height={12} /> Unlocked — AI provider keys are encrypted at rest.
              </>
            ) : (
              <>
                <LockIcon width={12} height={12} /> Locked — unlock to use or edit AI provider keys.
              </>
            )
          ) : (
            'Off — AI provider keys are stored in plain text. Set a passphrase to encrypt them at rest.'
          )}
        </div>

        {!active && !formOpen && (
          <button type="button" onClick={() => setFormOpen(true)}>
            Set up Secure Storage
          </button>
        )}

        {!active && formOpen && (
          <div style={{ display: 'grid', gap: 6 }}>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} placeholder="passphrase (6+ characters)" aria-label="New Secure Storage passphrase" style={inputStyle} />
            <input type="password" value={confirmPassphrase} onChange={(e) => setConfirmPassphrase(e.currentTarget.value)} placeholder="confirm passphrase" aria-label="Confirm Secure Storage passphrase" style={inputStyle} />
            <div style={{ fontSize: 11, color: t.mutedText }}>There's no recovery — if you forget it, you'll need to re-enter your keys from scratch.</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={handleSetup} disabled={busy || !passphrase || !confirmPassphrase}>
                {busy ? 'Setting up…' : 'Set up'}
              </button>
              <button type="button" onClick={resetForm} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {active && !unlocked && !formOpen && (
          <button type="button" onClick={() => setFormOpen(true)}>
            Unlock
          </button>
        )}

        {active && !unlocked && formOpen && (
          <div style={{ display: 'grid', gap: 6 }}>
            <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} placeholder="passphrase" aria-label="Secure Storage passphrase" style={inputStyle} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={handleUnlock} disabled={busy || !passphrase}>
                {busy ? 'Unlocking…' : 'Unlock'}
              </button>
              <button type="button" onClick={resetForm} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {active && unlocked && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={lock}>
              Lock
            </button>
            <button type="button" onClick={handleDisable} disabled={busy}>
              Disable
            </button>
          </div>
        )}

        {statusMsg && (
          <div style={{ fontSize: 11, color: t.mutedText }} role="status">
            {statusMsg}
          </div>
        )}
      </div>
    </>
  );
}
