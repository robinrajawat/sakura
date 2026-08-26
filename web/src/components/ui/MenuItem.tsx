import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * §8.3 (docs/phase8-design-system-parity-plan.md): the real dropdown-menu-row component --
 * direct port of legacy's real `.export-item` (legacy/index.html:476, icon+label variant at
 * legacy/index.html:480-491), meant to render inside a `<DropdownMenu rich>` (§8.3's own addition
 * to that component) so the icon-column/label/hover/danger treatment from `index.css` (§8.1)
 * actually applies. Every menu row `AccountMenu.tsx`/`ExportButtons.tsx` (§7.6) built with a
 * plain padded `<button>` should retrofit onto this in §8.4, not before -- this component itself
 * is only the primitive, not that retrofit.
 */
export function MenuItem({
  icon,
  danger,
  children,
  ...rest
}: {
  icon?: ReactNode;
  danger?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={danger ? 'export-item account-danger-item' : 'export-item'} role="menuitem" {...rest}>
      {icon && <span className="export-icon">{icon}</span>}
      <span className="export-label">{children}</span>
    </button>
  );
}
