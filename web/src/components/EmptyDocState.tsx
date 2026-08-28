import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useDocumentsStore } from '../store/documentsStore';
import { useAuthStore } from '../store/authStore';
import { useOutlineStore } from '../store/outlineStore';
import { generateOutline } from '../state/aiOutline';
import { SparkleIcon } from '../icons';

/** Direct port of legacy's real `getGreetingTimePrefix` (legacy/index.html:13569) -- a plain
 * time-of-day greeting, no persisted state. */
function greetingTimePrefix(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

/**
 * Phase 7.4 slice (docs/phase7-app-shell-and-dashboard-plan.md): the empty-document state --
 * direct port of legacy's real `.empty-state.doc-empty` block (legacy/index.html:20292's
 * `render()`, the `!nodes.length` branch) -- the Sakura mark illustration, a personalized-or-
 * generic greeting, a hint line, and "New document"/"Generate with AI" buttons. Rendered by
 * `OutlineTree.tsx` in place of any node rows when the active document has zero nodes (confirmed
 * via real click-through to be exactly what legacy shows there too -- `web/`'s own `OutlineTree.tsx`
 * had no such branch before this slice, grepped directly, zero matches).
 *
 * **Greeting name**, matching legacy's real `getGreetingName()` (legacy/index.html:13570) exactly
 * for the one real source it has today: falls back to the signed-in account's first name
 * (`authStore`'s `user.displayName`) when set. NOT ported: legacy's OTHER source, a manually-typed
 * `greetingDisplayName` Settings preference (legacy/index.html:13568's `setGreetingDisplayName`) --
 * `web/` has no Settings surface for it (same "no UI for a setting that doesn't exist yet"
 * deferral this project uses throughout), so a signed-out visitor (or one who hasn't set a
 * display name) always sees the generic "Nothing here yet" heading, matching legacy's own real
 * fallback for that same case.
 *
 * **Hint text, deliberately adapted, not verbatim-ported.** Legacy's own real hint text names two
 * capabilities `web/` genuinely doesn't have: "paste a tree" (smart-paste/tree-connector-notation
 * detection, confirmed not built anywhere in `web/src` -- `docs/post-cutover-backlog.md`'s own
 * Preview/Presenter/Export section names this exact gap) and "load a template" (Templates has no
 * system at all in `web/`, same doc's own Documents & Tabs section). Porting either claim verbatim
 * would promise a capability this build doesn't have -- so this hint only names what's real here:
 * pressing Enter or typing directly.
 *
 * Design-system retrofit (docs/phase8-design-system-parity-plan.md): now renders through the real
 * `.empty-state`/`.doc-empty`/`.empty-state-illustration`/`.empty-state-actions` classes
 * (index.css, cited from legacy/index.html:544-552) instead of inline `style` objects -- this
 * component predates Phase 8's own `role="dialog"` sweep (§8.4a-n), so it was never swept by that
 * investigation despite needing the same retrofit. Found via a real side-by-side screenshot
 * comparison against a genuinely empty legacy document. Two real visual gaps fixed along the way:
 * the "New document" button now gets legacy's real solid accent-filled `.btn.primary` treatment
 * (via the already-ported standalone `.primary` class, §8.1) instead of rendering identically to
 * the plain "Generate with AI" button, and the illustration gets legacy's real opacity treatment
 * (`.55` default, `.72` on hover) instead of always rendering at full opacity.
 */
export function EmptyDocState() {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const newDocument = useDocumentsStore((s) => s.newDocument);
  const activeFolderId = useDocumentsStore((s) => {
    const id = s.activeDocId;
    return id ? (s.docFolderMap[id] ?? null) : null;
  });
  const user = useAuthStore((s) => s.user);
  const createFirstNode = useOutlineStore((s) => s.createFirstNode);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // A plain `autoFocus` prop is NOT reliable here: this component mounts as the direct result of
  // a click on another element (the tab bar's "+ New document" button, or this same component's
  // own "New document" button) -- the browser's native focus-follows-click behavior on that
  // BUTTON happens before React's commit, and real testing found `autoFocus` alone loses that
  // race often enough to matter: focus stayed on the button, and the next Space keystroke (a
  // native "activate the focused button" trigger, not this component's own logic) silently
  // created a SECOND new document instead of typing into the first node. An explicit `useEffect`
  // focus call, which runs after commit, reliably wins instead.
  useEffect(() => {
    wrapperRef.current?.focus();
  }, []);

  // §7.4 slice: matches legacy's real "press Enter or just type" empty-state affordance
  // (legacy/index.html:27110's `id==='header-title'&&ev.key==='Enter'` branch calling
  // `createRootAndEdit`, plus `ensureDocumentForEditing`'s own "any content-mutation entry point
  // that can fire with no document open" framing) -- Enter or any single printable character
  // creates the document's first node (pre-seeded with that character, if it was one) and opens
  // it for editing immediately via `outlineStore.ts`'s new `createFirstNode`. Guarded to the
  // wrapper DIV itself being the actual event target, not a descendant -- a focused "New
  // document"/"Generate with AI" button's own Enter press should trigger THAT button, not this.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      createFirstNode('');
    } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      createFirstNode(e.key);
    }
  }

  const firstName = user?.displayName?.trim().split(/\s+/)[0] || '';
  const title = firstName ? `${greetingTimePrefix()}, ${firstName}` : 'Nothing here yet';
  const subtitle = firstName ? 'Nothing here yet. Press Enter or just type.' : 'Press Enter or just type.';

  async function handleGenerateWithAi(): Promise<void> {
    const topic = window.prompt(
      'Generate Outline with AI\n\nDescribe what you want an outline for (e.g. "competitor analysis" or "onboarding checklist for a new hire").'
    );
    if (topic === null) return;
    setBusy(true);
    const result = await generateOutline(topic);
    setBusy(false);
    if (!result.ok) window.alert(result.message);
  }

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      autoFocus
      onKeyDown={handleKeyDown}
      className="empty-state doc-empty"
      style={{ outline: 'none' }}
    >
      <div>
        <div className="empty-state-illustration" aria-hidden="true">
          <svg width="72" height="72" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
            <g opacity={0.9}>
              <ellipse cx="36" cy="18" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 38%,transparent)" stroke="color-mix(in srgb,var(--accent) 55%,transparent)" strokeWidth={1} />
              <ellipse cx="18" cy="30" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 30%,transparent)" stroke="color-mix(in srgb,var(--accent) 45%,transparent)" strokeWidth={1} />
              <ellipse cx="54" cy="30" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 30%,transparent)" stroke="color-mix(in srgb,var(--accent) 45%,transparent)" strokeWidth={1} />
              <ellipse cx="24" cy="46" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 22%,transparent)" stroke="color-mix(in srgb,var(--accent) 38%,transparent)" strokeWidth={1} />
              <ellipse cx="48" cy="46" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 22%,transparent)" stroke="color-mix(in srgb,var(--accent) 38%,transparent)" strokeWidth={1} />
              <circle cx="36" cy="32" r="5.5" fill="color-mix(in srgb,var(--accent) 18%,transparent)" stroke="color-mix(in srgb,var(--accent) 48%,transparent)" strokeWidth={1.2} />
            </g>
          </svg>
        </div>
        <div style={{ fontSize: '1.1em', marginBottom: 6, color: t.text }}>{title}</div>
        <div style={{ fontSize: '.88em', opacity: 0.7, lineHeight: 1.6 }}>{subtitle}</div>
        <div className="empty-state-actions">
          <button type="button" className="primary" onClick={() => newDocument(activeFolderId)}>
            New document
          </button>
          <button
            type="button"
            onClick={() => void handleGenerateWithAi()}
            disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <SparkleIcon width={12} height={12} /> {busy ? 'Working…' : 'Generate with AI'}
          </button>
        </div>
      </div>
    </div>
  );
}
