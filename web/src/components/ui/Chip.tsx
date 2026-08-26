import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

/**
 * §8.3 (docs/phase8-design-system-parity-plan.md): the real pill-chip component -- direct port
 * of legacy's real `.status-chip`/`.status-chip-btn` family (legacy/index.html:619-623), the
 * status bar's own chip shape (transparent background, bordered, `currentColor`-driven, not
 * `DocChip` below's solid colored pill). Renders as a plain `<span>` when passive (`#sb-theme`'s
 * own real markup, legacy/index.html:6768), or a real `<button>` when `onClick` is given
 * (`#sb-scale`/`#sb-fs-status-chip`, same line) -- matching legacy's own real element choice per
 * chip rather than always using one or the other.
 */
export function Chip({
  icon,
  onClick,
  children,
  ...rest
}: {
  icon?: ReactNode;
  onClick?: () => void;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const content = icon ? (
    <span className="status-chip-icon">
      {icon}
      {children}
    </span>
  ) : (
    children
  );
  if (onClick) {
    return (
      <button type="button" className="status-chip status-chip-btn" onClick={onClick} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
        {content}
      </button>
    );
  }
  return (
    <span className="status-chip" {...rest}>
      {content}
    </span>
  );
}

/** legacy/index.html:3585-3595's own real `data-color` values -- `undefined`/`'gray'` render the
 * same base treatment (gray is the default, matching legacy's own base rule), kept as an explicit
 * option since some callers (a document's default "no status" state before this chip goes
 * `unset`) need to say "gray" on purpose rather than omitting the prop. */
export type DocChipColor = 'orange' | 'green' | 'red' | 'gray';

/**
 * §8.3 addition (docs/phase8-design-system-parity-plan.md): `.doc-status-chip`, a REAL, separate
 * chip family from `Chip` above -- missed by §8.1's own pass (see `index.css`'s own comment on
 * this class for the full story), only found while building this component. The document header's
 * own status/author/link chips (`DocumentHeader.tsx`, §7.4) are this family, not `Chip`'s --
 * retrofitting that file onto this component is §8.4 work, not this slice's.
 */
export function DocChip({
  color,
  unset,
  authorStyle,
  children,
  ...rest
}: {
  color?: DocChipColor;
  unset?: boolean;
  /** legacy/index.html:791's own `.doc-author-chip` modifier -- normal-case, text caret, fixed
   * width, for the one real `.doc-status-chip` usage that's an `<input>`, not a `<button>`. */
  authorStyle?: boolean;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const className = ['doc-status-chip', unset && 'unset', authorStyle && 'doc-author-chip'].filter(Boolean).join(' ');
  return (
    <button type="button" className={className} data-color={unset ? undefined : color} {...rest}>
      {children}
    </button>
  );
}
