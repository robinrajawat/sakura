import { useAuthStore } from '../store/authStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { BellIcon, CloseIcon } from '../icons';

/**
 * §6.8 slice: notification bell -- badge + dropdown, direct port of legacy's real bell/menu UX
 * (legacy/index.html's `renderNotifBell`/`toggleNotifMenu`/`renderNotifList`, now driven by
 * `notificationsStore.ts` instead of hand-built DOM -- see that store's own header for the split
 * between the two). Mounted unconditionally in App.tsx's `headerActions` alongside the other
 * icon buttons there (theme toggle, sidebar toggle); renders nothing when signed out, matching
 * legacy's own real behavior of only ever populating the notifications collection for a signed-in
 * account.
 */
export function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const menuOpen = useNotificationsStore((s) => s.menuOpen);
  const setMenuOpen = useNotificationsStore((s) => s.setMenuOpen);
  const markRead = useNotificationsStore((s) => s.markRead);
  const remove = useNotificationsStore((s) => s.remove);
  const clearAll = useNotificationsStore((s) => s.clearAll);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  if (!user) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={menuOpen}
        style={{ position: 'relative' }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notif-badge" aria-label={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {menuOpen && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            zIndex: 120,
            width: 320,
            maxWidth: '90vw',
            maxHeight: 360,
            overflowY: 'auto',
            background: t.background,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            boxShadow: '0 14px 28px rgba(0,0,0,.12)',
            padding: 10,
            fontSize: 12,
            color: t.text
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <strong>Notifications</strong>
            {items.length > 0 && (
              <button type="button" onClick={() => void clearAll()} style={{ fontSize: 11 }}>
                Clear all
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div style={{ color: t.mutedText, padding: '6px 0' }}>No notifications yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 4 }}>
              {items.map((n) => (
                <div
                  key={n.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    padding: 6,
                    borderRadius: 6,
                    background: n.read ? 'transparent' : t.hoverBg
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => !n.read && void markRead(n.id)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && !n.read) void markRead(n.id);
                    }}
                    style={{ flex: 1, cursor: n.read ? 'default' : 'pointer' }}
                  >
                    {n.text}
                  </div>
                  <button
                    type="button"
                    onClick={() => void remove(n.id)}
                    aria-label="Dismiss notification"
                    title="Dismiss"
                    style={{ flexShrink: 0 }}
                  >
                    <CloseIcon width={10} height={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
