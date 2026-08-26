import { useEffect, useState } from 'react';

const WELCOME_SEEN_KEY = 'sakura_web_welcome_seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(WELCOME_SEEN_KEY, 'true');
  } catch {
    // Storage full/unavailable -- same "best effort, don't throw" convention every other
    // store's own writeJson already uses in this project.
  }
}

const WHY_SAKURA_ROWS: { icon: JSX.Element; label: string; desc: string }[] = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    ),
    label: 'See the big picture without the clutter',
    desc: 'Five pages of notes usually means scrolling forever to find what you want. In Sakura, you can collapse the details and see just your main headings — like a table of contents. Click one open when you need it.'
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 9l4-4 4 4" />
        <path d="M9 5v14" />
        <path d="M19 15l-4 4-4-4" />
        <path d="M15 19V5" />
      </svg>
    ),
    label: 'Move things around like LEGO blocks',
    desc: 'In a normal document, moving a section means highlighting, cutting, pasting, and fixing the spacing. Here you just grab one point and drag it — everything tucked underneath comes with it automatically.'
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6Z" />
      </svg>
    ),
    label: 'Bring in the mess, get back structure',
    desc: "Paste in messy notes or import a Word document — Sakura sorts it into a tree for you, AI-assisted when it needs to be. This part's specific to Sakura, not outliners in general."
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
    label: 'It keeps you thinking, not just typing',
    desc: 'Plain note-taking lets you write down what someone said without really processing it. An outliner makes you decide, in the moment: is this a new idea, or a detail under the last one? That keeps you actively sorting instead of just transcribing.'
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    ),
    label: 'It grows into a full workspace, not just a tree',
    desc: 'Attach a decision log, a Q&A list, or a real embedded diagram to any node — or step outside the tree entirely into a Mind Map for freeform brainstorming. Present the whole outline fullscreen with a laser pointer, a running timer, and a whiteboard for sketching mid-talk. Track meetings and to-dos alongside it. All still the same outline underneath — nothing here is a separate app bolted on.'
  }
];

function BrandRow({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 18 }}>
      <span style={{ display: 'inline-flex' }} aria-hidden="true">
        <svg width={size} height={size} viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">
          <g opacity={0.9}>
            <ellipse cx="36" cy="18" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 38%,transparent)" stroke="color-mix(in srgb,var(--accent) 55%,transparent)" strokeWidth={1} />
            <ellipse cx="18" cy="30" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 30%,transparent)" stroke="color-mix(in srgb,var(--accent) 45%,transparent)" strokeWidth={1} />
            <ellipse cx="54" cy="30" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 30%,transparent)" stroke="color-mix(in srgb,var(--accent) 45%,transparent)" strokeWidth={1} />
            <ellipse cx="24" cy="46" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 22%,transparent)" stroke="color-mix(in srgb,var(--accent) 38%,transparent)" strokeWidth={1} />
            <ellipse cx="48" cy="46" rx="9" ry="9" fill="color-mix(in srgb,var(--accent) 22%,transparent)" stroke="color-mix(in srgb,var(--accent) 38%,transparent)" strokeWidth={1} />
            <circle cx="36" cy="32" r="5.5" fill="color-mix(in srgb,var(--accent) 18%,transparent)" stroke="color-mix(in srgb,var(--accent) 48%,transparent)" strokeWidth={1.2} />
          </g>
        </svg>
      </span>
      <span style={{ font: "600 13px 'Inter', sans-serif", color: 'var(--muted)', letterSpacing: '0.04em' }}>Sakura</span>
    </div>
  );
}

/**
 * Phase 7.2 slice (docs/phase7-app-shell-and-dashboard-plan.md): the first-run onboarding
 * modal -- direct port of legacy's real `#welcome-overlay`/`#welcome-modal`
 * (legacy/index.html:7639-7661) plus its stacked-on-top `#why-sakura-overlay`
 * (legacy/index.html:7663-7708), and the `openWelcomeModal`/`closeWelcomeModal`/
 * `openWhySakura`/`closeWhySakura` logic (legacy/index.html:34551-34582, 36506-36528,
 * 36587-36596).
 *
 * **Trigger condition, deliberately narrower than legacy's real one.** Legacy shows this once,
 * 500ms after boot, when `!localStorage.sakura_welcome_seen && !localStorage.sakura_tour_seen &&
 * loadActiveDocsIndex().length===0` -- i.e. a profile that has genuinely never created a
 * document. That second half of the check doesn't have a faithful equivalent here:
 * `documentsStore.ts`'s own `init()` (Phase 5, unrelated to this slice) already auto-creates a
 * real "Welcome" seed document synchronously on a brand-new profile's very first load, so
 * `docsIndex.length` is never actually observable as zero by the time any component could check
 * it -- porting that exact condition would just make this component's own visibility a coin
 * flip on render-order timing, not a meaningful signal. This slice uses ONLY the
 * `sakura_web_welcome_seen` flag (legacy's own PRIMARY signal) instead -- a real, deliberate
 * scoping choice, not an oversight. No web/-side equivalent of `sakura_tour_seen` exists either
 * (there's no tour to have separately seen), so closing this modal only ever sets the one flag.
 *
 * **Scoped for this slice** (docs/phase7-app-shell-and-dashboard-plan.md §7.2): the modal shell,
 * all four real dismiss paths (skip / backdrop click / Escape / picking a choice), and the "Why
 * an outliner" secondary modal in full (static content, no logic of its own).
 * **Explicitly deferred, not silently dropped:** the actual "Guided tour" interactive walkthrough
 * and "Watch the demo" scripted animation -- picking either closes this modal and shows a plain
 * `window.alert` placeholder (this project's established "no generic toast/modal system yet, use
 * a native browser primitive" convention -- see e.g. `App.tsx`'s own AI-error handling), each its
 * own real, separately-scoped future phase once this shell exists to launch them from. "Apply
 * Editor's Choice" is different in kind, not just deferred: `docs/phase6-full-parity-plan.md`'s
 * §6.7 already investigated and marked that whole preset N/A by explicit user decision (it's a
 * ~40-setting personal configuration snapshot, most of which has no equivalent in `web/` at all)
 * -- so this link's own placeholder message says so rather than implying it's merely "coming
 * later" like the tour/demo ones.
 */
export function WelcomeModal() {
  const [seen, setSeen] = useState(readSeen);
  const [shouldRender, setShouldRender] = useState(false);
  const [whySakuraOpen, setWhySakuraOpen] = useState(false);

  useEffect(() => {
    if (seen) return;
    // Matches legacy's own real 500ms boot delay (its own setTimeout(...,500) before
    // openWelcomeModal) rather than popping the instant the app itself renders.
    const timer = setTimeout(() => setShouldRender(true), 500);
    return () => clearTimeout(timer);
  }, [seen]);

  const visible = !seen && shouldRender;

  function dismiss(): void {
    markSeen();
    setSeen(true);
  }

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return;
      // Matches legacy's real priority order: Escape closes the stacked-on-top "Why an
      // outliner" modal first if it's open, only reaching the welcome modal itself once that's
      // closed (legacy/index.html:36587-36596).
      if (whySakuraOpen) {
        e.stopPropagation();
        setWhySakuraOpen(false);
        return;
      }
      e.stopPropagation();
      dismiss();
    }
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [visible, whySakuraOpen]);

  if (!visible) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-heading"
        onClick={(e) => {
          if (e.target === e.currentTarget) dismiss();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1200,
          background: 'rgba(0,0,0,.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24
        }}
      >
        <div
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            boxShadow: '0 28px 56px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.10)',
            padding: '28px 28px 22px',
            width: 'min(480px, calc(100vw - 32px))',
            fontFamily: "'Inter', sans-serif"
          }}
        >
          <BrandRow size={22} />
          <h2 id="welcome-modal-heading" style={{ font: "700 18px 'Inter', sans-serif", color: 'var(--fg)', margin: '0 0 6px' }}>
            Welcome — where would you like to start?
          </h2>
          <p style={{ font: "400 13px 'Inter', sans-serif", color: 'var(--muted)', margin: '0 0 22px', lineHeight: 1.5 }}>
            Pick how you want to get familiar. You can always revisit both from the Help menu.
          </p>
          <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
            <button
              type="button"
              autoFocus
              onClick={() => {
                dismiss();
                window.alert("Guided tour isn't built here yet — coming in a future update.");
              }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', padding: '12px 14px' }}
            >
              <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" opacity={0.25} />
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Guided tour</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>
                  Step-by-step walkthrough of the real editor — interactive, skippable, takes about a minute.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                dismiss();
                window.alert("The demo isn't built here yet — coming in a future update.");
              }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left', padding: '12px 14px' }}
            >
              <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                  <polygon points="10 8 16 11 10 14 10 8" fill="currentColor" stroke="none" opacity={0.25} />
                  <polygon points="10 8 16 11 10 14 10 8" />
                </svg>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Watch the demo</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>A scripted animation showing the key features — just sit back and watch.</span>
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setWhySakuraOpen(true)}
            style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12.5, cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}
          >
            Why an outliner instead of plain notes? →
          </button>
          <button
            type="button"
            onClick={() => {
              window.alert("Editor's Choice isn't available in this build (docs/phase6-full-parity-plan.md §6.7).");
              dismiss();
            }}
            style={{ display: 'block', width: '100%', background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12.5, cursor: 'pointer', padding: '4px 0', textAlign: 'left', marginBottom: 8 }}
          >
            Prefer a leaner writing view? Apply Editor's Choice →
          </button>
          <button
            type="button"
            onClick={dismiss}
            style={{ display: 'block', width: '100%', textAlign: 'center', background: 'none', border: 'none', color: 'var(--hint)', fontSize: 12, cursor: 'pointer', padding: 4 }}
          >
            Skip for now, I'll explore on my own
          </button>
        </div>
      </div>
      {whySakuraOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="why-sakura-heading"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWhySakuraOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1210,
            background: 'rgba(0,0,0,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24
          }}
        >
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 16,
              boxShadow: '0 28px 56px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.10)',
              padding: '28px 28px 22px',
              width: 'min(560px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto',
              fontFamily: "'Inter', sans-serif"
            }}
          >
            <BrandRow size={22} />
            <h2 id="why-sakura-heading" style={{ font: "700 18px 'Inter', sans-serif", color: 'var(--fg)', margin: '0 0 6px' }}>
              Why an outliner — and why Sakura?
            </h2>
            <p style={{ font: "400 13px 'Inter', sans-serif", color: 'var(--muted)', margin: '0 0 18px', lineHeight: 1.5 }}>
              Think of an outliner as turning your notes into a family tree, instead of a messy
              pile of paragraphs. Instead of writing left to right, you write in points that tuck
              inside one another. Here's why that makes life easier:
            </p>
            <div style={{ display: 'grid', gap: 14, marginBottom: 16 }}>
              {WHY_SAKURA_ROWS.map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: 'var(--accent)' }}>
                    {row.icon}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--fg)' }}>{row.label}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>{row.desc}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--hint)', lineHeight: 1.5, marginBottom: 18 }}>
              Not every kind of writing wants this. Flowing essays and loosely connected notes are
              still better off elsewhere — Sakura's built for things that have a shape: plans,
              specs, architecture, meeting notes, decisions.
            </div>
            <button type="button" autoFocus onClick={() => setWhySakuraOpen(false)} style={{ width: '100%', padding: 9, fontSize: 13, fontWeight: 600 }}>
              Got it — let's start
            </button>
          </div>
        </div>
      )}
    </>
  );
}
