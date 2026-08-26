import { useState } from 'react';
import { addDoc, collection, getFirestore } from 'firebase/firestore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useAuthStore, getFirebaseApp } from '../store/authStore';
import { useEscapeToClose } from '../utils/useEscapeToClose';
import { CloseIcon } from '../icons';

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
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        role="dialog"
        aria-label="Send Feedback"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.background,
          color: t.text,
          border: `1px solid ${t.border}`,
          borderRadius: 12,
          padding: 20,
          width: 480,
          maxWidth: '92vw',
          boxShadow: '0 20px 40px rgba(0,0,0,.25)',
          fontFamily: "'Inter', sans-serif"
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15 }}>Send Feedback</h3>
            <div style={{ fontSize: 11.5, color: t.mutedText, marginTop: 2 }}>Bug reports, missing features, anything that felt off — this goes straight to Robin.</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close">
            <CloseIcon />
          </button>
        </div>
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
  );
}
