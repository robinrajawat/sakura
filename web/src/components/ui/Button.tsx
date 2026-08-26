import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'icon' | 'sidebar-icon';

const VARIANT_CLASS: Record<ButtonVariant, string | undefined> = {
  default: undefined,
  primary: 'primary',
  icon: 'icon-btn',
  'sidebar-icon': 'sb-icon-btn'
};

/**
 * §8.3 (docs/phase8-design-system-parity-plan.md): the real button component every plain
 * `<button>` in this codebase should be reaching for from here on, instead of a fresh ad hoc
 * inline `style` object per call site (the exact drift §8.1's own header names as this project's
 * root cause: "no shared source of truth ... variance creeps in slice over slice"). A thin
 * wrapper only -- applies the right §8.1 CSS class for `variant`, nothing else. The base bordered
 * treatment (`variant="default"`) needs no class at all, since it's already global via
 * `index.css`'s own bare `button` selector (§6.1); only the real named variants
 * (`.primary`/`.icon-btn`/`.sb-icon-btn`, legacy/index.html:383, 391, 1528) need one.
 *
 * `className` is still accepted and merged in (not replaced) so a caller can layer on a real
 * modifier class this component doesn't know about yet (`.toggle-on`, `.danger`, ...) without
 * this wrapper needing to grow a prop for every one of them up front.
 */
export function Button({
  variant = 'default',
  className,
  ...rest
}: { variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const variantClass = VARIANT_CLASS[variant];
  const merged = [variantClass, className].filter(Boolean).join(' ') || undefined;
  return <button type="button" className={merged} {...rest} />;
}
