import { useState } from 'react';
import { RestructureListIcon } from '../icons';

/**
 * §6.9 slice 5 (docs/phase6-full-parity-plan.md): the paste-target for Restructure Text — direct
 * port of legacy's real `sakuraTextareaPrompt` dialog content (legacy/index.html's
 * `restructureTextWithAi`), as an actual overlay modal rather than `window.prompt()`. Unlike
 * Generate Outline's short single-line topic (a good fit for `window.prompt`, matching this
 * project's established native-browser-primitive convention), Restructure Text's whole premise
 * is pasting a large multi-line block — `window.prompt`'s native single-line input can't reliably
 * hold that (most browsers strip or collapse newlines from pasted content in a single-line
 * `<input>`), so a real textarea is a functional requirement here, not a nicety. `web/` has no
 * generic modal system to reuse, so this is a small, single-purpose overlay built just for this,
 * matching the same "simpler chrome, purpose-built rather than a general system" precedent
 * `SettingsPanel.tsx`/`AiProviderSettings.tsx` already established.
 *
 * §8.4n retrofit (docs/phase8-design-system-parity-plan.md): renders through the real
 * `#sakura-modal-overlay`/`#sakura-modal`/`-icon`/`-title`/`-body`/`-textarea-wrap`/`-textarea`/
 * `-actions`/`.smodal-btn`(+`.primary`) classes (index.css, cited from legacy/index.html:635-660)
 * instead of inline `style` objects -- `#sakura-modal` is legacy's own single, dynamically-
 * repurposed dialog instance (every `sakuraTextareaPrompt`/`sakuraLinkPrompt` call reuses the same
 * DOM node); this component is `web/`'s own single-purpose instance of just the textarea-prompt
 * variant, so only that variant's real pieces are ported (see index.css's own comment on this
 * class family for what's skipped and why). Body copy now matches legacy's own real
 * `restructureTextWithAi` call site (legacy/index.html:29444) close to verbatim, with one
 * deliberate omission: legacy's real text promises "your original pasted text kept in its Pad" --
 * `state/aiOutline.ts`'s own `restructureText` doesn't actually do this (a real, pre-existing
 * feature gap from an earlier phase, not something this CSS-retrofit slice silently claims true by
 * copying the sentence anyway). `<RestructureListIcon>` (new in `icons.tsx`) is a literal port of
 * legacy's own real inline `<svg>` at that same call site. Skips legacy's own `.open`/`.closing`
 * opacity-fade + transform-scale enter/exit transition, same React mount/unmount precedent as
 * `.app-modal-overlay`/`#welcome-overlay`.
 */
export function RestructureTextDialog({ onSubmit, onCancel }: { onSubmit: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('');

  function handleSubmit(): void {
    if (!text.trim()) return;
    onSubmit(text);
  }

  return (
    <div id="sakura-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="sakura-modal-title" onClick={onCancel}>
      <div id="sakura-modal" onClick={(e) => e.stopPropagation()}>
        <div id="sakura-modal-icon">
          <RestructureListIcon />
        </div>
        <div id="sakura-modal-title">Restructure Text into a Tree</div>
        <div id="sakura-modal-body">
          Paste messy notes, an email, a transcript — anything without clear structure. The AI organizes it into a tree and may clean up
          wording (fix broken line wraps, tighten long sentences) so it reads well as outline nodes — it will not invent facts that are
          not in your text, but it is not a verbatim copy either.
          {'\n\n'}
          Already-structured text (bullets, indents) is detected automatically and parsed instantly without an AI call.
          {'\n\n'}
          Always lands in a new document.
        </div>
        <div id="sakura-modal-textarea-wrap">
          <textarea
            id="sakura-modal-textarea"
            autoFocus
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            placeholder="Paste or type the text to restructure…"
            aria-label="Text to restructure"
          />
        </div>
        <div id="sakura-modal-actions">
          <button type="button" className="smodal-btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="smodal-btn primary" onClick={handleSubmit} disabled={!text.trim()}>
            Restructure
          </button>
        </div>
      </div>
    </div>
  );
}
