import { useEffect, useRef } from 'react';
import { useDataIoStore } from '../store/dataIoStore';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.8 slice: "Export & Import" settings section -- direct port of legacy's real
 * `sb-export-all-btn`/`sb-import-all-btn`/`sb-undo-restore-row` (legacy/index.html:5158-5160),
 * under the same "Data & Backup" category tier 1/tier 2 backup already live in. `dataIoStore.ts`
 * owns the actual export/import/undo mechanics; this component owns the two confirm dialogs
 * (`window.confirm`, this project's established native-primitive convention) and the reload
 * after a successful restore -- matching `BackupSettings.tsx`'s own established split (its
 * `handleRestore` confirms and reloads around `backupStore.ts`'s own confirm-free action).
 */
export function DataIoSettings({ t }: { t: ThemeTokens }) {
  const exportAll = useDataIoStore((s) => s.exportAll);
  const importFromFile = useDataIoStore((s) => s.importFromFile);
  const undoLastRestore = useDataIoStore((s) => s.undoLastRestore);
  const refreshUndoStatus = useDataIoStore((s) => s.refreshUndoStatus);
  const preRestoreAvailable = useDataIoStore((s) => s.preRestoreAvailable);
  const preRestoreSavedAt = useDataIoStore((s) => s.preRestoreSavedAt);
  const preRestoreReason = useDataIoStore((s) => s.preRestoreReason);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshUndoStatus();
  }, [refreshUndoStatus]);

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChosen(file: File) {
    if (
      !window.confirm(
        'This will replace everything currently in the app -- all current documents, folders, and templates will be overwritten.\n\nThis cannot be undone, though you\'ll be able to undo the import itself right after (Undo last restore, below). Continue?'
      )
    ) {
      return;
    }
    const outcome = await importFromFile(file);
    if (outcome === 'invalid') {
      window.alert('Not a valid Sakura backup file');
    } else if (outcome === 'rolled-back') {
      window.alert('Import failed -- backup too large for available storage; your previous data was restored');
    } else if (outcome === 'failed') {
      window.alert('Import failed partway -- reload and try again');
    } else {
      location.reload();
    }
  }

  async function handleUndo() {
    const savedAt = preRestoreSavedAt ? new Date(preRestoreSavedAt).toLocaleString() : 'unknown time';
    if (
      !window.confirm(
        `This will bring back what was in the app just before your last restore (${savedAt}), replacing what's here now.\n\nThis cannot be undone. Continue?`
      )
    ) {
      return;
    }
    const ok = await undoLastRestore();
    if (ok) {
      location.reload();
    } else {
      window.alert('Undo failed');
    }
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
      <div style={sectionHeaderStyle}>Export & Import</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <div style={{ flex: 1 }}>
          <div>Export all data</div>
          <div style={{ color: t.mutedText, fontSize: 11 }}>Downloads everything -- documents, folders, and settings -- as one JSON file.</div>
        </div>
        <button type="button" onClick={() => exportAll()}>
          Export…
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 12 }}>
        <div style={{ flex: 1 }}>
          <div>Import data</div>
          <div style={{ color: t.mutedText, fontSize: 11 }}>Replaces everything currently in the app with a previously exported backup file.</div>
        </div>
        <button type="button" onClick={handleImportClick}>
          Import…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) void handleFileChosen(file);
          }}
        />
      </div>
      {preRestoreAvailable && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <div>Undo last restore</div>
            <div style={{ color: t.mutedText, fontSize: 11 }}>
              A snapshot of what was here right before your last Restore, in case that restore turns out to have been the wrong file.
            </div>
            <div style={{ color: t.mutedText, fontSize: 11, marginTop: 2 }}>
              {preRestoreSavedAt ? `From ${formatRelativeTime(preRestoreSavedAt)}, before a ${preRestoreReason || 'restore'}` : ''}
            </div>
          </div>
          <button type="button" onClick={() => void handleUndo()}>
            Undo…
          </button>
        </div>
      )}
    </>
  );
}
