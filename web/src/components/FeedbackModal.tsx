import { useState } from 'react';
import { addDoc, collection, getFirestore } from 'firebase/firestore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useAuthStore, getFirebaseApp } from '../store/authStore';
import { useEscapeToClose } from '../utils/useEscapeToClose';
import { CloseIcon, MessageIcon } from '../icons';

/**
 * §7.6 slice (docs/phase7-app-shell-and-dashboard-plan.md): "Send Feedback", one of the account
 * dropdown's real Help entries -- direct port of legacy's real `#feedback-modal-overlay`
 * (legacy/index.html:7077-7092) and its `submitFeedback`/send-button handler
 * (legacy/index.html:15268-15286, 8483-8496): a message textarea (6000-char cap, matching
 * legacy's own `maxlength`) plus an optional "reply to" email field, writing straight to the
 * same real `feedback` Firestore collection legacy's own build writes to (create-only by
 * `firestore.rules` -- no account needed, matching legacy's own "feedback shouldn't require
 * signing in" reasoning) rather than a fake/local-only submit. One real, deliberate
 * simplification vs. legacy: no `showToast('Thanks — feedback sent.')` afterward -- `web/` has
 * no toast infrastructure yet (same gap `ExportButtons.tsx`'s own header already documents) --
 * so this closes the modal on success with no further confirmation, a real but minor UX gap, not
 * a silently dropped feature.
 *
 * §8.4g retrofit (docs/phase8-design-system-parity-plan.md): renders through the real
 * `.app-modal-overlay`/`.app-modal`/`.app-modal-head`/`.app-modal-close-btn`/`.app-modal-body`
 * classes (index.css) instead of the ad hoc inline `style` objects this component started with.
 * `role="dialog"` moves to the OVERLAY element (matching legacy's own real markup exactly --
 * `#feedback-modal-overlay` itself carries the role, not its inner `.app-modal` box); the former
 * backdrop `role="presentation"` is dropped since the overlay itself is now the dialog root.
 * `<MessageIcon>` in the title matches legacy's own real inline `<svg>` there (legacy/index.html:
 * 7080), a gap this component never had before since it only ever rendered a bare text title.
 */
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const user = useAuthStore((s) => s.user);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  useEscapeToClose(onClose);

  async function handleSend(): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed) {
      setStatus('Enter a message first.');
      return;
    }
    setSending(true);
    setStatus('Sending…');
    try {
      await addDoc(collection(getFirestore(getFirebaseApp()), 'feedback'), {
        kind: 'feedback',
        message: trimmed.slice(0, 6000),
        email: email.trim() || null,
        uid: user ? user.uid : null,
        userAgent: navigator.userAgent,
        url: window.location.href,
        createdAt: Date.now()
      });
      onClose();
    } catch {
      setStatus("Couldn't send that — check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div role="dialog" aria-label="Send Feedback" aria-modal="true" className="app-modal-overlay" onClick={onClose}>
      <div className="app-modal" style={{ width: 'min(480px, 94vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="app-modal-head">
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <MessageIcon width={15} height={15} stroke="var(--accent)" />
              Send Feedback
            </h2>
            <div className="cs-sub">Bug reports, missing features, anything that felt off — this goes straight to Robin.</div>
          </div>
          <button type="button" className="app-modal-close-btn" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="app-modal-body">
          <textarea
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            placeholder="What's on your mind?"
            maxLength={6000}
            rows={6}
            aria-label="Feedback message"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, resize: 'vertical', padding: '9px 11px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.background, color: t.text, font: "400 13px 'Inter', sans-serif", lineHeight: 1.5 }}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder="Email (optional — only if you want a reply)"
            autoComplete="email"
            aria-label="Reply email (optional)"
            style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '8px 11px', border: `1px solid ${t.border}`, borderRadius: 8, background: t.background, color: t.text, fontSize: 12.5, fontFamily: "'Inter', sans-serif" }}
          />
          {status && <div style={{ marginTop: 8, minHeight: 15, fontSize: 12, color: t.mutedText }}>{status}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={() => void handleSend()} disabled={sending}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
