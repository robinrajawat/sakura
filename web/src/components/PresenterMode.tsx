import { useEffect, useMemo, useState } from 'react';
import { useOutlineStore, type OutlineNode } from '../store/outlineStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { NodeText } from './NodeText';

/**
 * Phase 3 slice (docs/framework-migration-plan.md): Presenter Mode, built directly on
 * PreviewPane's node rendering. Deliberately scoped way down from legacy's real Presenter Mode:
 * slides are always grouped by top-level (depth 0) nodes -- no `slideDivider` node field for
 * manual slide breaks, no configurable slide-break depth, no fullscreen API. Just Prev/Next
 * buttons plus left/right arrow-key navigation over the resulting slide deck.
 */
export function groupIntoSlides(nodes: OutlineNode[]): OutlineNode[][] {
  const slides: OutlineNode[][] = [];
  for (const node of nodes) {
    if (node.depth === 0 || slides.length === 0) slides.push([node]);
    else slides[slides.length - 1].push(node);
  }
  return slides;
}

export function PresenterMode() {
  const nodes = useOutlineStore((s) => s.nodes);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const slides = useMemo(() => groupIntoSlides(nodes), [nodes]);
  const [index, setIndex] = useState(0);
  const clampedIndex = Math.min(index, Math.max(0, slides.length - 1));

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, slides.length - 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [slides.length]);

  if (!slides.length) {
    return <div style={{ color: t.mutedText, fontStyle: 'italic' }}>This document is empty.</div>;
  }

  const slide = slides[clampedIndex];
  const minDepth = slide[0].depth;

  return (
    <div>
      <div
        style={{
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          padding: '2rem',
          minHeight: 240,
          background: t.background,
          color: t.text,
          fontFamily: 'sans-serif'
        }}
      >
        {slide.map((node) => (
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
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontFamily: 'sans-serif' }}>
        <button type="button" onClick={() => setIndex((i) => Math.max(i - 1, 0))} disabled={clampedIndex === 0}>
          ← Prev
        </button>
        <span style={{ color: t.mutedText, fontSize: 13 }}>
          {clampedIndex + 1} / {slides.length}
        </span>
        <button
          type="button"
          onClick={() => setIndex((i) => Math.min(i + 1, slides.length - 1))}
          disabled={clampedIndex === slides.length - 1}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
