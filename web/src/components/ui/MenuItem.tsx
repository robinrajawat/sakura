import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * §8.3 (docs/phase8-design-system-parity-plan.md): the real dropdown-menu-row component --
 * direct port of legacy's real `.export-item` (legacy/index.html:476, icon+label variant at
 * legacy/index.html:480-491), meant to render inside a `<DropdownMenu rich>` (§8.3's own addition
 * to that component) so the icon-column/label/hover/danger treatment from `index.css` (§8.1)
 * actually applies. Every menu row `AccountMenu.tsx`/`ExportButtons.tsx` (§7.6) built with a
 * plain padded `<button>` should retrofit onto this in §8.4, not before -- this component itself
 * is only the primitive, not that retrofit.
 *
 * §8.4 correction: the icon span now also carries `.export-icon.danger` (legacy/index.html:4587's
 * own `<span class="export-icon danger">` on its real sign-out row) when `danger` is set -- missed
 * when this component was first built in §8.3 since it had no real consumer yet to expose the gap.
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
      {icon && <span className={danger ? 'export-icon danger' : 'export-icon'}>{icon}</span>}
      <span className="export-label">{children}</span>
    </button>
  );
}
