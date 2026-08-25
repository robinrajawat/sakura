import { useState } from 'react';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

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
 */
export function RestructureTextDialog({ onSubmit, onCancel }: { onSubmit: (text: string) => void; onCancel: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const [text, setText] = useState('');

  function handleSubmit(): void {
    if (!text.trim()) return;
    onSubmit(text);
  }

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        role="dialog"
        aria-label="Restructure Text into a Tree"
        onClick={(e) => e.stopPropagation()}
        style={{ background: t.background, color: t.text, border: `1px solid ${t.border}`, borderRadius: 12, padding: 20, width: 520, maxWidth: '92vw', boxShadow: '0 20px 40px rgba(0,0,0,.25)', fontFamily: 'sans-serif' }}
      >
        <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>Restructure Text into a Tree</h3>
        <p style={{ fontSize: 12, color: t.mutedText, margin: '0 0 12px' }}>
          Paste messy notes, an email, a transcript — anything without clear structure. Already-structured text (bullets, indents) is
          parsed instantly with no AI call. Always lands in a new document.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          placeholder="Paste or type the text to restructure…"
          aria-label="Text to restructure"
          rows={10}
          style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 13, padding: 8, borderRadius: 6, border: `1px solid ${t.border}`, background: t.background, color: t.text, resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!text.trim()}>
            Restructure
          </button>
        </div>
      </div>
    </div>
  );
}
