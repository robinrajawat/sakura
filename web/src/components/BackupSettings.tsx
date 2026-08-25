import { useEffect } from 'react';
import { useBackupStore } from '../store/backupStore';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.8 slice (docs/phase6-full-parity-plan.md): "Data & backup" settings section, direct port
 * of legacy's real "Local safety copy" row (legacy/index.html:5159, `sb-idb-restore-btn`) --
 * status text ("Last saved X ago" / "No safety copy yet", matching `updateSafetyCopyStatus`
 * exactly) plus a "Restore…" button. `init()` (`backupStore.ts`) is called here on mount, the
 * same "call a store's own `init` from whichever component first needs it" convention
 * `AuthPanel.tsx`/`DocSyncPanel.tsx` already use -- it's idempotent, so mounting/unmounting this
 * settings section repeatedly (opening/closing Settings) never re-registers the debounce
 * listener twice.
 *
 * Restore uses `window.confirm` (this project's established "no toast/modal system yet, use a
 * native browser primitive" convention, same as the delete confirms elsewhere) rather than
 * legacy's own richer `sakuraConfirm` dialog (custom icon/title/danger-styled button) -- the
 * confirmation text itself is still a close paraphrase of legacy's real wording. A successful
 * restore reloads the page (`location.reload()`), matching legacy exactly: `web/`'s stores read
 * from `localStorage` once at their own module-level init, so there's no live "re-hydrate every
 * store from what's now in storage" path to call instead.
 */
export function BackupSettings({ t }: { t: ThemeTokens }) {
  const lastSavedAt = useBackupStore((s) => s.lastSavedAt);
  const init = useBackupStore((s) => s.init);
  const restoreFromSafetyCopy = useBackupStore((s) => s.restoreFromSafetyCopy);

  useEffect(() => {
    init();
  }, [init]);

  const statusText = lastSavedAt ? `Last saved ${formatRelativeTime(lastSavedAt)}` : 'No safety copy yet';

  async function handleRestore() {
    if (
      !window.confirm(
        'This will replace everything currently in the app with the local safety copy' +
          (lastSavedAt ? ` from ${new Date(lastSavedAt).toLocaleString()}` : '') +
          '.\n\nThis cannot be undone. Continue?'
      )
    ) {
      return;
    }
    const restored = await restoreFromSafetyCopy();
    if (!restored) {
      window.alert('No safety copy found.');
      return;
    }
    location.reload();
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

  return (
    <>
      <div style={sectionHeaderStyle}>Data & Backup</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <div style={{ flex: 1 }}>
          <div>Local safety copy</div>
          <div style={{ color: t.mutedText, fontSize: 11 }}>
            A second copy is kept automatically in a separate browser storage area, in case the main storage gets
            cleared. Not a substitute for Export.
          </div>
          <div style={{ color: t.mutedText, fontSize: 11, marginTop: 2 }}>{statusText}</div>
        </div>
        <button type="button" onClick={handleRestore}>
          Restore…
        </button>
      </div>
    </>
  );
}
