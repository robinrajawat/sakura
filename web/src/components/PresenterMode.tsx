import { useEffect, useMemo } from 'react';
import { useOutlineStore, type OutlineNode } from '../store/outlineStore';
import { usePadStore } from '../store/padStore';
import { usePresenterStore } from '../store/presenterStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { NodeText } from './NodeText';
import { stripSemanticMarkers } from '../utils/stripSemanticMarkers';

/**
 * Phase 3 slice (docs/framework-migration-plan.md): Presenter Mode, built directly on
 * PreviewPane's node rendering. Deliberately scoped way down from legacy's real Presenter Mode:
 * slides are always grouped by top-level (depth 0) nodes -- no `slideDivider` node field for
 * manual slide breaks, no configurable slide-break depth, no fullscreen API. Just Prev/Next
 * buttons plus left/right arrow-key navigation over the resulting slide deck.
 *
 * §6.6 slice (docs/phase6-full-parity-plan.md) adds five more pieces of legacy's real chrome,
 * direct ports of `enterPresenterMode`/`startPresenterTimer`/`setPresenterBlank`/
 * `previewSetLaser`/`openPresenterOverview` (legacy/index.html:38514-38689): the elapsed timer
 * (a plain running clock from mount, matching `startPresenterTimer`'s h:mm:ss/m:ss format
 * exactly), blackout (`B` key or button -- a pure screen-level overlay, the slide underneath is
 * untouched), the laser pointer (`previewSetLaser` -- a `position:fixed` dot tracking the
 * mouse while active, native cursor hidden, same size/color/glow as legacy's `#preview-laser-
 * dot`), the slide overview grid (`G` key or button -- every slide's number+label, click to
 * jump, matches `openPresenterOverview`'s label-based-not-thumbnail approach and its own
 * comment on why: a live screenshot per slide is a lot of machinery for what's really just a
 * faster way to jump around during Q&A), and the closing slide (a real extra slide appended
 * after the last content slide, included in slide count/navigation/overview exactly like
 * legacy's own `previewSlideList.push({nodeId:null,...})` -- text/subtitle hardcoded to
 * legacy's own real defaults, "Thank you"/"Questions?", since no Settings panel exists yet to
 * hold `previewClosingSlideText`/`previewClosingSlideSubtitle`, same "no silent default for a
 * live user-preference toggle that doesn't exist here yet" deferral used elsewhere in this
 * project).
 *
 * Deliberately still not ported, each a real architectural gap rather than a small omission:
 * Audience View / dual-screen (legacy's real implementation is a genuine second navigation of
 * the same page with a query param telling it which mode to boot into -- `web/` has no
 * client-side routing at all, a Phase 0 decision, so there is no page for a second window to
 * load); Whiteboard mirroring (its own poll loop only starts once Audience View is live, so it
 * inherits that same blocker, on top of Whiteboard/diagram-editing itself being its own
 * separately-scoped §6.3 concern).
 *
 * A later §6.6 slice adds the branding wordmark (`BRANDING_TEXT` below) to the presenter bar
 * itself, matching legacy's real always-on `#presenter-branding` element -- the same mark this
 * export domain's Word/PDF/PowerPoint exports show (`ExportButtons.tsx`).
 *
 * A still-later §6.6 slice adds the floating Notes/Q&A panel (`N` key or button), a direct port
 * of legacy's real `openPresenterNotes`/`togglePresenterNotes` (legacy/index.html:39015-39096)
 * -- deliberately scoped down: legacy relocates the actual Pad DOM nodes (`#pad-editor`, its
 * toolbar, `#qa-body`) into the floating panel, so its version is fully editable while
 * presenting and mode-switches between Notes/Q&A/Remarks via separate N/Q/R keys. `web/`'s React
 * architecture has no DOM-node-relocation equivalent, and there is no per-node "speaker notes"
 * concept to switch between here regardless -- so this port instead reads `usePadStore`'s
 * `notesText`/`qaItems` directly into one combined, read-only panel (no live edit-while-
 * presenting, no separate N/Q mode-switch, no drag-to-reposition -- each a real, separately-
 * scoped follow-up if ever wanted), toggled by the same `N` key legacy's own Notes shortcut
 * uses, closed by `N` again or `Escape` (joining the same close-priority chain `B`/`G` already
 * use).
 *
 * §6.6 slice: presenting state (slide index, blanked, laser, overview, notes, elapsed timer)
 * moved from this component's own local `useState` into `usePresenterStore.ts` -- a pure
 * refactor, no behavior change, but a real prerequisite for the Audience View work
 * phase6-full-parity-plan.md's §6.6 section now scopes concretely: a second window's own React
 * tree needs something external to actually be driven through (a future audience-window bridge
 * will read/drive this store directly), which local component state can never provide. See that
 * store's own header comment for the full reasoning.
 */
export function groupIntoSlides(nodes: OutlineNode[]): OutlineNode[][] {
  const slides: OutlineNode[][] = [];
  for (const node of nodes) {
    if (node.depth === 0 || slides.length === 0) slides.push([node]);
    else slides[slides.length - 1].push(node);
  }
  return slides;
}

// Legacy's own real closing-slide defaults (`previewClosingSlideText`/`previewClosingSlideSubtitle`
// top-level globals) -- hardcoded here, see this file's header for why. Exported so
// `ExportButtons.tsx`'s PowerPoint export can append the same real closing slide legacy's own
// `buildPptxPresentation` does (as the genuine last slide in the deck), without duplicating
// these two strings in a second place.
export const CLOSING_SLIDE_TEXT = 'Thank you';
export const CLOSING_SLIDE_SUBTITLE = 'Questions?';

// Legacy's own real branding wordmark default (`getBrandingDisplayText`'s fallback when no
// custom `previewBrandingText` is set) -- exported so `ExportButtons.tsx`'s Word/PDF/PowerPoint
// exports show the exact same mark as this file's own presenter-bar branding below, one source
// of truth instead of four hardcoded copies. Legacy's real `previewPresenterBranding` toggle
// defaults to `true` in the code (`let previewPresenterBranding=true`, and `loadPrefs`'s own
// `d.previewPresenterBranding===undefined?true:...` fallback agrees) -- the Settings panel's own
// description text claims "Off by default," a real, pre-existing doc/code mismatch in legacy
// itself; the actual code default (on) is what this hardcodes, same "trust the real behavior,
// not the description" precedent already used elsewhere in this port. No Settings panel exists
// in `web/` yet to make this toggleable or to hold a custom `previewBrandingText` override.
export const BRANDING_TEXT = 'S A K U R A';

/** Pure: matches legacy's own real per-slide label logic exactly (legacy/index.html:37507) --
 * the slide's first node's text, semantic markers stripped, brackets stripped (a `[Section]`
 * node's own label shouldn't keep its brackets), falling back to "Untitled" when empty. */
export function slideLabel(node: OutlineNode): string {
  const bracketless = String(node.text || '').trim().replace(/^\[|\]$/g, '');
  return stripSemanticMarkers(bracketless).trim() || 'Untitled';
}

/** Pure: matches legacy's own real `updatePresenterTimerDisplay` format exactly -- h:mm:ss once
 * past an hour, m:ss before that. */
export function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export function PresenterMode() {
  const nodes = useOutlineStore((s) => s.nodes);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const slides = useMemo(() => groupIntoSlides(nodes), [nodes]);
  const totalSlides = slides.length + 1; // +1 for the closing slide, always on -- see header
  const index = usePresenterStore((s) => s.slideIndex);
  const setIndex = usePresenterStore((s) => s.setSlideIndex);
  const clampedIndex = Math.min(index, Math.max(0, totalSlides - 1));
  const onClosingSlide = slides.length > 0 && clampedIndex === slides.length;

  const blanked = usePresenterStore((s) => s.blanked);
  const setBlanked = usePresenterStore((s) => s.setBlanked);
  const laserOn = usePresenterStore((s) => s.laserOn);
  const setLaserOn = usePresenterStore((s) => s.setLaserOn);
  const laserPos = usePresenterStore((s) => s.laserPos);
  const setLaserPos = usePresenterStore((s) => s.setLaserPos);
  const overviewOpen = usePresenterStore((s) => s.overviewOpen);
  const setOverviewOpen = usePresenterStore((s) => s.setOverviewOpen);
  const notesOpen = usePresenterStore((s) => s.notesOpen);
  const setNotesOpen = usePresenterStore((s) => s.setNotesOpen);
  const elapsedSec = usePresenterStore((s) => s.elapsedSec);
  const enterPresenting = usePresenterStore((s) => s.enterPresenting);
  const tickElapsed = usePresenterStore((s) => s.tickElapsed);
  const notesText = usePadStore((s) => s.notesText);
  const qaItems = usePadStore((s) => s.qaItems);

  // Elapsed timer -- a plain running clock from the moment this component mounts (App.tsx only
  // mounts it while `mode === 'present'`, the same "entering presenter mode" moment legacy's own
  // `startPresenterTimer` fires at), not tied to slide count or paced against anything.
  useEffect(() => {
    enterPresenting();
    const handle = setInterval(tickElapsed, 1000);
    return () => clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function goTo(i: number) {
      setIndex(Math.max(0, Math.min(totalSlides - 1, i)));
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (overviewOpen) {
          e.preventDefault();
          setOverviewOpen(false);
        } else if (notesOpen) {
          e.preventDefault();
          setNotesOpen(false);
        } else if (blanked) {
          e.preventDefault();
          setBlanked(false);
        }
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setOverviewOpen(!overviewOpen);
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setBlanked(!blanked);
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setNotesOpen(!notesOpen);
        return;
      }
      if (overviewOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goTo(clampedIndex + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        goTo(clampedIndex - 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(totalSlides - 1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [totalSlides, clampedIndex, overviewOpen, blanked, notesOpen, setIndex, setOverviewOpen, setNotesOpen, setBlanked]);

  if (!slides.length) {
    return <div style={{ color: t.mutedText, fontStyle: 'italic' }}>This document is empty.</div>;
  }

  function jumpTo(i: number) {
    setIndex(Math.max(0, Math.min(totalSlides - 1, i)));
    setOverviewOpen(false);
  }

  const slide = onClosingSlide ? null : slides[clampedIndex];
  const minDepth = slide ? slide[0].depth : 0;

  return (
    <div>
      <div
        onMouseMove={laserOn ? (e) => setLaserPos({ x: e.clientX, y: e.clientY }) : undefined}
        style={{
          position: 'relative',
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '2rem',
          minHeight: 240,
          background: t.background,
          color: t.text,
          fontFamily: 'sans-serif',
          cursor: laserOn ? 'none' : undefined
        }}
      >
        {blanked ? (
          <div style={{ position: 'absolute', inset: 0, background: '#000', borderRadius: 8 }} />
        ) : onClosingSlide ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: '4rem' }}>
            <div style={{ width: 52, height: 5, borderRadius: 3, background: 'var(--accent)', marginBottom: 28 }} />
            <div style={{ font: "700 2.2em/1.25 'Inter', sans-serif", marginBottom: 14 }}>{CLOSING_SLIDE_TEXT}</div>
            {CLOSING_SLIDE_SUBTITLE && (
              <div style={{ font: "500 1.1em 'Inter', sans-serif", color: t.mutedText }}>{CLOSING_SLIDE_SUBTITLE}</div>
            )}
          </div>
        ) : (
          slide!.map((node) => (
            <div
              key={node.id}
              style={{
                paddingLeft: `${(node.depth - minDepth) * 24}px`,
                marginBottom: 8,
                fontSize: node.depth === minDepth ? 24 : 16
              }}
            >
              {node.text ? <NodeText text={node.text} /> : <span style={{ color: t.mutedText }}>(empty)</span>}
            </div>
          ))
        )}
        {laserOn && laserPos && (
          <div
            style={{
              position: 'fixed',
              left: laserPos.x,
              top: laserPos.y,
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,70,60,1) 0%, rgba(255,70,60,1) 65%, rgba(224,49,47,0) 100%)',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              boxShadow: '0 0 5px 1px rgba(224,49,47,.6)',
              zIndex: 5001
            }}
          />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontFamily: 'sans-serif', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => jumpTo(clampedIndex - 1)} disabled={clampedIndex === 0}>
          ← Prev
        </button>
        <span style={{ color: t.mutedText, fontSize: 13 }}>
          {clampedIndex + 1} / {totalSlides}
        </span>
        <button type="button" onClick={() => jumpTo(clampedIndex + 1)} disabled={clampedIndex === totalSlides - 1}>
          Next →
        </button>
        <span style={{ color: t.mutedText, fontSize: 13, marginLeft: 12 }}>⏱ {formatElapsed(elapsedSec)}</span>
        <button type="button" onClick={() => setLaserOn(!laserOn)} aria-pressed={laserOn}>
          {laserOn ? 'Laser: on' : 'Laser'}
        </button>
        <button type="button" onClick={() => setBlanked(!blanked)} aria-pressed={blanked}>
          {blanked ? 'Unblank (B)' : 'Blank (B)'}
        </button>
        <button type="button" onClick={() => setOverviewOpen(!overviewOpen)} aria-pressed={overviewOpen}>
          Overview (G)
        </button>
        <button type="button" onClick={() => setNotesOpen(!notesOpen)} aria-pressed={notesOpen}>
          Notes (N)
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, letterSpacing: '.22em', color: t.hintText }}>
          {BRANDING_TEXT}
        </span>
      </div>
      {notesOpen && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            width: 320,
            maxHeight: '60vh',
            overflowY: 'auto',
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: 12,
            background: t.background,
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            fontFamily: 'sans-serif',
            zIndex: 5002
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: t.mutedText }}>
              Notes
            </span>
            <button type="button" onClick={() => setNotesOpen(false)} style={{ fontSize: 11 }}>
              Close
            </button>
          </div>
          {notesText.trim() ? (
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: t.text, marginBottom: 12 }}>{notesText}</div>
          ) : (
            <div style={{ fontSize: 13, fontStyle: 'italic', color: t.mutedText, marginBottom: 12 }}>No notes.</div>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: t.mutedText, marginBottom: 6 }}>
            Q&amp;A
          </div>
          {qaItems.length === 0 ? (
            <div style={{ fontSize: 13, fontStyle: 'italic', color: t.mutedText }}>No Q&amp;A items.</div>
          ) : (
            qaItems.map((item) => (
              <div key={item.id} style={{ marginBottom: 8, fontSize: 13 }}>
                <div style={{ fontWeight: 700, color: t.text }}>{item.question}</div>
                <div style={{ color: item.answer.trim() ? t.mutedText : t.hintText, fontStyle: item.answer.trim() ? undefined : 'italic' }}>
                  {item.answer.trim() || 'No answer provided'}
                </div>
              </div>
            ))
          )}
        </div>
      )}
      {overviewOpen && (
        <div
          style={{
            marginTop: 12,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: 12,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 8,
            fontFamily: 'sans-serif'
          }}
        >
          {slides.map((s, i) => (
            <button
              key={s[0].id}
              type="button"
              onClick={() => jumpTo(i)}
              style={{
                textAlign: 'left',
                padding: 8,
                borderRadius: 6,
                border: `1px solid ${i === clampedIndex ? 'var(--accent)' : t.border}`,
                background: t.background,
                color: t.text,
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: 11, color: t.mutedText }}>
                {i + 1} / {totalSlides}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {slideLabel(s[0])}
              </div>
            </button>
          ))}
          <button
            type="button"
            onClick={() => jumpTo(slides.length)}
            style={{
              textAlign: 'left',
              padding: 8,
              borderRadius: 6,
              border: `1px solid ${onClosingSlide ? 'var(--accent)' : t.border}`,
              background: t.background,
              color: t.text,
              cursor: 'pointer'
            }}
          >
            <div style={{ fontSize: 11, color: t.mutedText }}>
              {totalSlides} / {totalSlides}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{CLOSING_SLIDE_TEXT}</div>
          </button>
        </div>
      )}
    </div>
  );
}
