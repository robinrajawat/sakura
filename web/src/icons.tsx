/**
 * §8.2 (docs/phase8-design-system-parity-plan.md): the real icon set -- legacy's own inline-SVG
 * line icons (stroke-based, `fill="none" stroke="currentColor" stroke-width="2"
 * stroke-linecap="round" stroke-linejoin="round"`, no icon font, no sprite sheet), kept here as
 * small named exports so a future component pulls `<LocateIcon />` instead of re-pasting an
 * `<svg>` block per call site. Each icon below is a direct, line-cited port of a real legacy
 * `<svg>`; a handful with no legacy equivalent at all (Sun/Moon -- legacy has no header theme
 * toggle at all, theme lives only in `Settings -> Appearance` as text-label segmented buttons,
 * §8.12 docs/phase8-design-system-parity-plan.md) are built in the same stroke-based style for
 * visual consistency and explicitly called out as such below, not presented as ports.
 *
 * Default `width`/`height` on every icon is 14 (this project's own most common icon size); pass
 * explicit `width`/`height` props to override for a specific call site, matching whatever size
 * that legacy button actually used.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function baseProps(props: IconProps): IconProps {
  return {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    ...props
  };
}

/** legacy/index.html:4590 (`account-settings-btn`'s own icon) */
export function SettingsGearIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/** legacy/index.html:5357 (`ai-api-key-show-btn`/`cloud-gist-token-show-btn`'s own icon) */
export function EyeIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** legacy/index.html:29675 (`EYE_OFF_ICON`) */
export function EyeOffIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.61 6.61A18.5 18.5 0 0 0 1 12s4 8 11 8a9.26 9.26 0 0 0 5.39-1.61" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/** legacy/index.html:8835 (`SB_VAULT_LOCKED_ICON`) */
export function LockIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/** No direct legacy equivalent (legacy has no "unlocked" icon, only `SB_VAULT_LOCKED_ICON` for
 * the locked state) -- built as `LockIcon`'s natural open-shackle counterpart, same stroke-based
 * style, since showing the locked state with a real icon and the unlocked state with an emoji
 * would look inconsistent side by side. */
export function UnlockIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

/** legacy/index.html:18668 (icon-keyword map's own bullseye/target glyph) */
export function TargetIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** legacy/index.html:6264 (`#sidebar-search-icon`) */
export function SearchIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps({ strokeWidth: 2.5, ...props })}>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

/** legacy/index.html:6259 area (`#sidebar-toggle`'s own icon) */
export function SidebarToggleIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

/** legacy/index.html:6297 (`#sb-new-folder-btn`) */
export function NewFolderIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
  );
}

/** legacy/index.html:6518 (`#doc-link-chip`'s own icon) */
export function LinkIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** legacy/index.html:7964 (`#library-url-open-btn`) / :20370 (`.node-inline-open-panel-btn`) */
export function ExternalLinkIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/** legacy/index.html:10897 (`TRASH_ICON`) */
export function TrashIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps({ strokeWidth: 1.8, ...props })}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** legacy/index.html:6489 (`#more-version-history-btn`'s own icon, reused verbatim at
 * `#todos-history-btn`/`#meetings-history-btn`) */
export function ClockIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

/** legacy/index.html:4546 area (`#notif-toggle`'s own icon) */
export function BellIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/** legacy/index.html:4548 area (`#feedback-modal-close-btn` and every other real modal's own
 * close icon -- the same shape used throughout legacy for every dismiss/close/remove action). */
export function CloseIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps({ strokeWidth: 2.5, ...props })}>
      <line x1="4" y1="4" x2="20" y2="20" />
      <line x1="20" y1="4" x2="4" y2="20" />
    </svg>
  );
}

/** legacy/index.html:6460 (`#insert-dt-btn`) / :6626 (`#ptb-timestamp`) */
export function CalendarIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

/** legacy/index.html:6623 (`#ptb-image`) */
export function ImageIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

/** legacy/index.html:7958 (`#library-favorite-btn`) -- pass `filled` to match legacy's own
 * `.library-row-favorite.active svg{fill:currentColor}` treatment for an active favorite. */
export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean } = {}) {
  return (
    <svg {...baseProps({ fill: filled ? 'currentColor' : 'none', ...props })}>
      <path d="M12 2l2.9 6.6L22 9.6l-5 4.9 1.2 7-6.2-3.5L5.8 21.5 7 14.5l-5-4.9 7.1-1z" />
    </svg>
  );
}

/** legacy/index.html:6473 (`#qb-ai-rewrite`'s own icon -- the same 4-point sparkle used for
 * every real AI action button in legacy). */
export function SparkleIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6Z" fill="currentColor" stroke="currentColor" strokeWidth={1} />
    </svg>
  );
}

/** No direct legacy equivalent -- legacy has no header theme-toggle button at all (theme lives
 * only in Settings -> Appearance as text-label segmented buttons); built in the same stroke-based
 * style as every other icon here for visual consistency with its new SVG neighbors in the header,
 * not presented as a port. */
export function MoonIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

export function SunIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </svg>
  );
}

/** legacy/index.html:4586 (`#account-manage-btn`'s own icon) */
export function IdCardIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M5 16c.6-1.6 2.1-2.5 4-2.5s3.4.9 4 2.5" />
      <line x1="14" y1="9" x2="18" y2="9" />
      <line x1="14" y1="12" x2="18" y2="12" />
    </svg>
  );
}

/** legacy/index.html:4570 (`#account-signin-open-btn`'s own icon) */
export function LoginIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

/** legacy/index.html:4587 (`#account-signout-btn`'s own icon) */
export function LogoutIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

/** legacy/index.html:4593 (`#account-help-btn`'s own icon) */
export function BookIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

/** legacy/index.html:4594 (`#account-feedback-btn`'s own icon, same shape as the toolbar's real
 * `#qb-note` -- App.tsx's own inline `<svg>` there, not yet retrofit onto this shared icon). */
export function MessageIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** legacy/index.html:4595 (`#account-about-btn`'s own icon) */
export function InfoIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/** legacy/index.html:4540/6233 (`#appbar-more-export-btn`/`#export-toggle`'s own icon) */
export function UploadTrayIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

/** legacy/index.html:4541/6221 (`#appbar-more-import-btn`/`#import-toggle`'s own icon) */
export function DownloadTrayIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** legacy/index.html:4542/6220 (`#appbar-more-print-btn`/`#print-btn`'s own icon) */
export function PrinterIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

/** legacy/index.html:6236 (`Copy as Text`'s own icon) */
export function ClipboardIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
    </svg>
  );
}

/** legacy/index.html:6225/6242 (Word `.docx` import/export's own icon, no ruled lines) */
export function DocFileIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/** legacy/index.html:6240 (Markdown `.md` export's own icon -- `DocFileIcon` plus two full-width
 * ruled lines) */
export function MarkdownFileIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}

/** legacy/index.html:6243 (PDF `.pdf` export's own icon -- `DocFileIcon` plus one full-width and
 * one short ruled line, distinct from `MarkdownFileIcon`'s two full-width lines) */
export function PdfFileIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </svg>
  );
}

/** legacy/index.html:6251 (Decision Log `.xlsx` export's own icon -- `MarkdownFileIcon` plus one
 * extra short top ruled line) */
export function XlsxFileIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
      <line x1="8" y1="9" x2="10" y2="9" />
    </svg>
  );
}

/** legacy/index.html:6241 (Tree `.txt` export's own icon) */
export function TreeLinesIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="12" y1="18" x2="20" y2="18" />
    </svg>
  );
}

/** legacy/index.html:6244 (PowerPoint `.pptx` export's own icon) */
export function PptFileIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  );
}

/** legacy/index.html:6224/6245 (OPML `.opml` import/export's own icon -- three connected nodes) */
export function OpmlIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="17" cy="12" r="2.4" />
      <path d="M8 6h4a4 4 0 0 1 4 4" />
      <path d="M8 18h4a4 4 0 0 0 4-4" />
    </svg>
  );
}

/** legacy/index.html:6226/6248 (Sakura Document `.sakura.json` import/export's own icon) */
export function SakuraDocIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <path d="M5 20c1.5-4 3-6.5 5.5-8.5S15 8 18 5" />
      <circle cx="18" cy="5" r="2.1" />
      <circle cx="10.5" cy="11.5" r="1.7" />
    </svg>
  );
}

/** legacy/index.html:4593 area (`#account-support-btn`'s own Ko-fi mark) */
export function KofiIcon(props: IconProps = {}) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M11.351 2.715c-2.7 0-4.986.025-6.83.26C2.078 3.285 0 5.154 0 8.61c0 3.506.182 6.13 1.585 8.493 1.584 2.701 4.233 4.182 7.662 4.182h.83c4.209 0 6.494-2.234 7.637-4a9.5 9.5 0 0 0 1.091-2.338C21.792 14.688 24 12.22 24 9.208v-.415c0-3.247-2.13-5.507-5.792-5.87-1.558-.156-2.65-.208-6.857-.208m0 1.947c4.208 0 5.09.052 6.571.182 2.624.311 4.13 1.584 4.13 4v.39c0 2.156-1.792 3.844-3.87 3.844h-.935l-.156.649c-.208 1.013-.597 1.818-1.039 2.546-.909 1.428-2.545 3.064-5.922 3.064h-.805c-2.571 0-4.831-.883-6.078-3.195-1.09-2-1.298-4.155-1.298-7.506 0-2.181.857-3.402 3.012-3.714 1.533-.233 3.559-.26 6.39-.26m6.547 2.287c-.416 0-.65.234-.65.546v2.935c0 .311.234.545.65.545 1.324 0 2.051-.754 2.051-2s-.727-2.026-2.052-2.026m-10.39.182c-1.818 0-3.013 1.48-3.013 3.142 0 1.533.858 2.857 1.949 3.897.727.701 1.87 1.429 2.649 1.896a1.47 1.47 0 0 0 1.507 0c.78-.467 1.922-1.195 2.623-1.896 1.117-1.039 1.974-2.364 1.974-3.897 0-1.662-1.247-3.142-3.039-3.142-1.065 0-1.792.545-2.338 1.298-.493-.753-1.246-1.298-2.312-1.298" />
    </svg>
  );
}

/** §8.4f (docs/phase8-design-system-parity-plan.md): the Settings panel's own real category-rail
 * icons (legacy/index.html:4622-4670), ported for the first time since `SettingsPanel.tsx`'s
 * rail (§6.10 slice 2) never had icons at all -- text-only rail buttons. Sized to legacy's real
 * 14x14 viewBox/stroke-width for these specific icons rather than the 24x24 convention most of
 * this file otherwise uses, since that's what legacy's own rail actually ships. Only the 3 with
 * no existing equivalent: "Account" reuses `IdCardIcon` above (byte-identical path data to
 * legacy's own `data-cat="account"` icon), and "AI" reuses `SparkleIcon` (legacy's own real
 * `data-cat="ai"` icon is a solid sparkle, matching `SparkleIcon`'s own shape already). */
function railIconProps(props: IconProps): IconProps {
  return { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', ...props };
}

export function AppearanceIcon(props: IconProps = {}) {
  return (
    <svg {...railIconProps(props)}>
      <circle cx="7" cy="7" r="2.1" />
      <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.76 2.76l1.41 1.41M9.83 9.83l1.41 1.41M2.76 11.24l1.41-1.41M9.83 4.17l1.41-1.41" />
    </svg>
  );
}

export function EditPencilIcon(props: IconProps = {}) {
  return (
    <svg {...railIconProps(props)}>
      <path d="M9.4 1.6l3 3L4.3 12.7l-3.2.6.6-3.2z" />
    </svg>
  );
}

export function DatabaseIcon(props: IconProps = {}) {
  return (
    <svg {...railIconProps(props)}>
      <ellipse cx="7" cy="3.1" rx="5.5" ry="2" />
      <path d="M1.5 3.1v7.8c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V3.1" />
      <path d="M1.5 7c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2" />
    </svg>
  );
}

/** §8.4n (docs/phase8-design-system-parity-plan.md): `restructureTextWithAi`'s own real inline
 * icon (legacy/index.html:29444) -- a real deviation from every other icon in this file:
 * `stroke-width="1.8"` (not this file's own default 2) at a real 24x24 size (not this file's own
 * default 14), matching legacy's own real per-context usage exactly rather than the usual default. */
export function RestructureListIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps({ width: 24, height: 24, strokeWidth: 1.8, ...props })}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

/** §8.13 (docs/phase8-design-system-parity-plan.md): the Mind Map tab's own per-row icon
 * (legacy/index.html:50118, `.mindmap-row-icon`'s fixed content -- every row gets the same
 * icon, not content-driven). */
export function MindMapIcon(props: IconProps = {}) {
  return (
    <svg {...baseProps(props)}>
      <circle cx="12" cy="12" r="2.3" />
      <circle cx="20" cy="12" r="1.6" />
      <circle cx="16" cy="5.1" r="1.6" />
      <circle cx="8" cy="5.1" r="1.6" />
      <circle cx="4" cy="12" r="1.6" />
      <circle cx="8" cy="18.9" r="1.6" />
      <circle cx="16" cy="18.9" r="1.6" />
      <path d="M12 12 20 12M12 12 16 5.1M12 12 8 5.1M12 12 4 12M12 12 8 18.9M12 12 16 18.9" />
    </svg>
  );
}

/** §8.14 (docs/phase8-design-system-parity-plan.md): the app-bar's own real brand icon
 * (`#app-brand-icon`, legacy/index.html:4529) -- a real, previously-missed gap: a prior session's
 * own §7.6/8.11 write-up claimed "desktop's own real #appbar has none either," which turned out
 * to be wrong once this element was actually read; it's real, and it's in the desktop appbar, not
 * just the mobile page. A five-petal blossom built from `color-mix(in srgb, var(--accent) N%,
 * transparent)`-filled ellipses -- deliberately NOT using this file's own `baseProps` stroke
 * convention, since every shape here uses its own per-shape `fill`, not a single `currentColor`
 * stroke. */
export function SakuraBrandIcon(props: SVGProps<SVGSVGElement> = {}) {
  return (
    <svg width={16} height={16} viewBox="4.5 0.5 63 63" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" {...props}>
      <g opacity={0.9}>
        <ellipse cx="36" cy="18" rx="9" ry="9" fill="color-mix(in srgb, var(--accent) 38%, transparent)" stroke="color-mix(in srgb, var(--accent) 55%, transparent)" strokeWidth={1} />
        <ellipse cx="18" cy="30" rx="9" ry="9" fill="color-mix(in srgb, var(--accent) 30%, transparent)" stroke="color-mix(in srgb, var(--accent) 45%, transparent)" strokeWidth={1} />
        <ellipse cx="54" cy="30" rx="9" ry="9" fill="color-mix(in srgb, var(--accent) 30%, transparent)" stroke="color-mix(in srgb, var(--accent) 45%, transparent)" strokeWidth={1} />
        <ellipse cx="24" cy="46" rx="9" ry="9" fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="color-mix(in srgb, var(--accent) 38%, transparent)" strokeWidth={1} />
        <ellipse cx="48" cy="46" rx="9" ry="9" fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="color-mix(in srgb, var(--accent) 38%, transparent)" strokeWidth={1} />
        <circle cx="36" cy="32" r="5.5" fill="color-mix(in srgb, var(--accent) 18%, transparent)" stroke="color-mix(in srgb, var(--accent) 48%, transparent)" strokeWidth={1.2} />
      </g>
    </svg>
  );
}
