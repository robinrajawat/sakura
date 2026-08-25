import { useMemo } from 'react';
import { useOutlineStore } from '../store/outlineStore';
import { usePresenterStore } from '../store/presenterStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { NodeText } from './NodeText';
import { groupIntoSlides, CLOSING_SLIDE_TEXT, CLOSING_SLIDE_SUBTITLE } from '../state/presenterSlides';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md), Audience View step 3: the passive slide-content
 * block extracted out of `PresenterMode.tsx` (which still renders this internally, unchanged),
 * so `AudienceWindow.tsx` can show the exact same presenting surface WITHOUT also getting
 * `PresenterMode.tsx`'s own independent Prev/Next buttons and keyboard shortcuts -- legacy's real
 * Audience window has none of that (legacy/index.html:38966-39003's own `SAKURA_AUDIENCE_MODE`
 * boot block shows only the plain presenting surface plus a click-to-fullscreen hint, never its
 * own copy of the presenter's controls), and it shouldn't have any in `web/` either: a second
 * window with its own live Prev/Next buttons would fight the state a future cross-window bridge
 * pushes into it, rather than being a purely driven display.
 *
 * `interactive`: when true (the presenter's own window, via `PresenterMode.tsx`), a real
 * mousemove handler on the slide container updates `laserPos` as the presenter's own mouse
 * moves, matching legacy's real `previewSetLaser` mouse-tracking. When false (a driven window,
 * via `AudienceWindow.tsx`), no mousemove handler is attached at all -- `laserPos` there only
 * ever changes because something ELSE (the bridge, once built) pushed a new value into
 * `usePresenterStore`, and this component simply renders wherever the dot currently is.
 */
export function PresenterSlideView({ interactive = false }: { interactive?: boolean }) {
  const nodes = useOutlineStore((s) => s.nodes);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const slides = useMemo(() => groupIntoSlides(nodes), [nodes]);
  const totalSlides = slides.length + 1; // +1 for the closing slide, always on

  const slideIndex = usePresenterStore((s) => s.slideIndex);
  const clampedIndex = Math.min(slideIndex, Math.max(0, totalSlides - 1));
  const onClosingSlide = slides.length > 0 && clampedIndex === slides.length;
  const blanked = usePresenterStore((s) => s.blanked);
  const laserOn = usePresenterStore((s) => s.laserOn);
  const laserPos = usePresenterStore((s) => s.laserPos);
  const setLaserPos = usePresenterStore((s) => s.setLaserPos);

  if (!slides.length) {
    return <div style={{ color: t.mutedText, fontStyle: 'italic' }}>This document is empty.</div>;
  }

  const slide = onClosingSlide ? null : slides[clampedIndex];
  const minDepth = slide ? slide[0].depth : 0;

  return (
    <div
      onMouseMove={interactive && laserOn ? (e) => setLaserPos({ x: e.clientX, y: e.clientY }) : undefined}
      style={{
        position: 'relative',
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        padding: '2rem',
        minHeight: 240,
        background: t.background,
        color: t.text,
        fontFamily: 'sans-serif',
        cursor: interactive && laserOn ? 'none' : undefined
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
  );
}
