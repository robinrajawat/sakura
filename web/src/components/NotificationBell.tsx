import { useNotificationsStore } from '../store/notificationsStore';
import { BellIcon, CloseIcon } from '../icons';
import { DropdownMenu } from './DropdownMenu';
import { formatRelativeTime } from '../utils/formatRelativeTime';

/**
 * §6.8 slice: notification bell -- badge + dropdown, direct port of legacy's real bell/menu UX
 * (legacy/index.html's `renderNotifBell`/`toggleNotifMenu`/`renderNotifList`, now driven by
 * `notificationsStore.ts` instead of hand-built DOM -- see that store's own header for the split
 * between the two). Mounted unconditionally in App.tsx's `headerActions` alongside the other
 * icon buttons there.
 *
 * §8.15 correction (docs/phase8-design-system-parity-plan.md): this component used to render
 * nothing at all when signed out -- reported directly by the user as a real gap, and confirmed
 * against legacy's own real markup: `#notif-wrap` (legacy/index.html:4545-4557) has no
 * hide-by-default/auth-gated styling anywhere -- only the unread-count badge itself
 * (`#notif-badge`) starts `display:none`, not the bell button around it. The bell now always
 * renders; `items`/`unreadCount` are naturally empty when signed out (the store only ever
 * populates for a signed-in account, matching legacy's own real behavior), so the dropdown
 * correctly falls through to its own existing empty state ("You're all caught up") rather than
 * needing any new signed-out-specific copy.
 *
 * §8.4l retrofit (docs/phase8-design-system-parity-plan.md): legacy's real `#notif-menu`
 * (legacy/index.html:4550-4555) is itself a `class="export-menu export-menu-rich"` consumer, not a
 * standalone popover -- this now renders through the EXISTING `DropdownMenu.tsx` (`rich`, plus a
 * new `maxHeight` prop matching legacy's real `#notif-menu{max-height:380px}`) instead of its own
 * ad hoc inline-styled overlay, with the real `.notif-menu-header`/`-title`/`.notif-clear-all` and
 * `.notif-item`(+`.unread`)/`-body`/`-text`/`-meta`/`-dismiss`/`.notif-empty` classes (index.css,
 * cited from legacy/index.html:496-513) for everything `.export-menu-rich` doesn't already cover.
 * Also adds a real per-item relative-timestamp line (`.notif-item-meta`, via the already-ported
 * `formatRelativeTime`) that legacy's own `renderNotifList` always shows and this component never
 * had before -- a genuine content gap this retrofit's own investigation found, not just a styling
 * one, since `NotifItem.createdAt` was already available and simply never rendered.
 */
export function NotificationBell() {
  const items = useNotificationsStore((s) => s.items);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const menuOpen = useNotificationsStore((s) => s.menuOpen);
  const setMenuOpen = useNotificationsStore((s) => s.setMenuOpen);
  const markRead = useNotificationsStore((s) => s.markRead);
  const remove = useNotificationsStore((s) => s.remove);
  const clearAll = useNotificationsStore((s) => s.clearAll);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        title="Notifications"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        style={{ position: 'relative' }}
      >
        <BellIcon width={15} height={15} />
        {unreadCount > 0 && (
          <span className="notif-badge" aria-label={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {menuOpen && (
        <DropdownMenu onClose={() => setMenuOpen(false)} align="right" rich width={300} maxHeight={380}>
          <div className="notif-menu-header">
            <div className="notif-menu-title">Notifications</div>
            {items.length > 0 && (
              <button type="button" className="notif-clear-all" onClick={() => void clearAll()}>
                Clear all
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <div className="notif-empty">You&apos;re all caught up</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                className={`notif-item${n.read ? '' : ' unread'}`}
                onClick={() => !n.read && void markRead(n.id)}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !n.read) void markRead(n.id);
                }}
              >
                <div className="notif-item-body">
                  <div className="notif-item-text">{n.text}</div>
                  <div className="notif-item-meta">{formatRelativeTime(n.createdAt)}</div>
                </div>
                <button
                  type="button"
                  className="notif-item-dismiss"
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(n.id);
                  }}
                  aria-label="Dismiss notification"
                  title="Dismiss"
                >
                  <CloseIcon width={12} height={12} />
                </button>
              </div>
            ))
          )}
        </DropdownMenu>
      )}
    </div>
  );
}
