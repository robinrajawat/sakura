import { useDocSyncStore } from '../store/docSyncStore';
import type { ThemeTokens } from '../store/themeStore';

/**
 * §6.8 slice: shown above the outline editor whenever the currently loaded document is someone
 * else's, shared with the signed-in account (`docSyncStore`'s `role !== 'owner'`) -- direct port
 * of legacy's real "Shared by ..." banner. Editors are told edits sync back to the owner's
 * document; viewers are told edits won't be saved, matching `docSyncStore.ts`'s own real
 * `pushDoc`/autosave viewer-role guard (a client-side deterrent only -- see that file's header).
 */
export function SharedDocBanner({ t }: { t: ThemeTokens }) {
  const role = useDocSyncStore((s) => s.role);
  const ownerDisplayName = useDocSyncStore((s) => s.ownerDisplayName);
  const ownerEmail = useDocSyncStore((s) => s.ownerEmail);

  if (role === 'owner') return null;

  const ownerLabel = ownerDisplayName || ownerEmail || 'someone else';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: t.hoverBg,
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        padding: '6px 10px',
        fontSize: 12,
        marginBottom: 6
      }}
    >
      <span>
        Shared by <strong>{ownerLabel}</strong> --{' '}
        {role === 'editor' ? 'you can edit; changes sync back to their document.' : 'view only, your edits will not be saved.'}
      </span>
    </div>
  );
}
