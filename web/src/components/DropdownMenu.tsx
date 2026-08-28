import { useEffect, useRef, type ReactNode } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

/**
 * A small `role="menu"` popover with click-outside/Escape dismissal -- the shared building block
 * behind every anchored dropdown in this project (Settings, the per-document header's status/link
 * popovers, and -- as of the §7.6 slice, docs/phase7-app-shell-and-dashboard-plan.md -- the
 * account menu and the app-bar "more" menu). Originally a local helper inside
 * `DocumentHeader.tsx`; promoted here once a second and third caller needed the exact same
 * click-outside/Escape/z-index behavior rather than each keeping its own slightly-diverging copy.
 * `align` (new in this promotion) lets a caller anchor the menu to the right edge of its trigger
 * button instead of always the left -- needed for the two new §7.6 menus, both docked near the
 * right end of the header where a left-anchored menu would overflow the viewport.
 */
export function DropdownMenu({
  onClose,
  children,
  width,
  maxHeight,
  align = 'left',
  rich = false
}: {
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /** §8.4l addition (docs/phase8-design-system-parity-plan.md): matches legacy's own real
   * per-instance `max-height`+`overflow-y:auto` (e.g. `#notif-menu{max-height:380px}`,
   * legacy/index.html:499) for a menu whose content can outgrow a fixed height -- unset by
   * default since most `DropdownMenu` consumers (Settings/status/link popovers) never need it. */
  maxHeight?: number;
  align?: 'left' | 'right';
  /** §8.3 addition (docs/phase8-design-system-parity-plan.md): applies the real `export-menu-rich`
   * class legacy's own icon+label popovers carry (`class="export-menu export-menu-rich"`, e.g.
   * `#account-menu`/`#appbar-more-menu`) -- activates the nested `.export-menu-rich .export-item`/
   * `.export-icon`/`.export-label`/`.export-section-label` rules from `index.css` (§8.1) for any
   * `MenuItem.tsx` (§8.3) rendered inside. Off by default since not every `DropdownMenu` holds a
   * list of icon+label rows (`DocumentHeader.tsx`'s status/link popovers don't). */
  rich?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = THEME_TOKENS[useThemeStore((s) => s.theme)];

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onEscape(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      className={rich ? 'export-menu-rich' : undefined}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: '100%',
        ...(align === 'left' ? { left: 0 } : { right: 0 }),
        marginTop: 4,
        width: width ?? 200,
        background: t.background,
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        boxShadow: '0 14px 28px rgba(0,0,0,.16)',
        zIndex: 95,
        // §8.4 correction (docs/phase8-design-system-parity-plan.md): a bare inline `padding: 4`
        // here always beat the real `.export-menu-rich{padding:6px}` class (§8.1/§8.3) regardless
        // of `rich`, since inline style outranks a class selector -- only noticed once a real
        // `rich` consumer (AccountMenu.tsx, this slice) existed to expose it.
        padding: rich ? 6 : 4,
        font: "400 12.5px 'Inter', sans-serif",
        ...(maxHeight !== undefined ? { maxHeight, overflowY: 'auto' as const } : {})
      }}
    >
      {children}
    </div>
  );
}
