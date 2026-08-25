import { useEffect, useRef, useState } from 'react';
import { useOutlineStore } from '../store/outlineStore';
import { usePadStore } from '../store/padStore';
import type { DecisionTextField } from '../store/padStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { NodeText } from './NodeText';
import { sanitizeRichHtml } from '../utils/sanitizeRichHtml';
import { buildTocEntries } from '../state/previewToc';
import { PreviewToc } from './PreviewToc';
import { decisionStatusLabelCore, decisionStatusColorKeyCore } from '../state/decisionLogQueries';
import { stripHtmlToText } from '../utils/stripHtmlToText';

const PV_DL_FIELDS: { key: DecisionTextField; label: string }[] = [
  { key: 'context', label: 'Context' },
  { key: 'decision', label: 'Decision' },
  { key: 'rationale', label: 'Rationale' },
  { key: 'alternatives', label: 'Alternatives' },
  { key: 'impact', label: 'Impact' }
];

/**
 * Phase 3 slice (docs/framework-migration-plan.md): Preview Mode. A read-only rendered view of
 * the whole tree (every node, ignoring fold state -- unlike the editor, a folded subtree still
 * belongs in the document).
 *
 * §6.6 slice (docs/phase6-full-parity-plan.md): table of contents, scroll-spy, and a scroll
 * progress bar -- direct ports of legacy's real `#preview-toc`/`setupPreviewScrollSpy`/
 * `updatePreviewProgress` (legacy/index.html:38426-38449). TOC entries come from
 * `buildTocEntries` (`state/previewToc.ts`, see its own header for exact section/heading
 * matching and what's deliberately not ported). Scroll-spy matches legacy's real
 * `IntersectionObserver` setup exactly -- `root` the scrollable body, `rootMargin:'0px 0px
 * -70% 0px'`, `threshold:0` -- INCLUDING a real, deliberately-preserved quirk: the active entry
 * is picked from the current IntersectionObserver callback batch's own `entries` list (`entries[i]
 * for entries[i].isIntersecting`), not a persistent "currently intersecting" set accumulated
 * across calls, matching legacy's own actual `visible[0]` logic (legacy/index.html:38437-38441)
 * -- not "fixed" during this port, same as this project's established practice for other pinned
 * legacy quirks (e.g. `diagramAnchor.ts`'s own forward/backward drag asymmetry). Click-to-scroll
 * (`PreviewToc.tsx`'s `onSelect`) matches legacy's real `previewScrollToNode`
 * (legacy/index.html:38025-38031): `scrollIntoView({block:'start'})`, respecting
 * `prefers-reduced-motion`, plus a brief background flash on the target row.
 *
 * §6.7 slice: decision-log card rendering, direct port of legacy's real
 * `previewRenderDecisionCard` (legacy/index.html:37355-37388) -- a bordered/shaded card (status-
 * colored left accent + badge, matching `ThemeTokens.fcGreen`/`fcRed`/`fcGray`, the same real hex
 * values legacy's own status-color function uses) showing every non-empty field. Deliberately no
 * decision-log TOC-entry/grouping (a real, separately-scoped follow-up -- `previewToc.ts`'s own
 * header would need its own extension for this).
 *
 * Deliberately still scoped down from legacy's real Preview: no Presenter Mode slide deck, no
 * word-count/author/updated-at meta header, no TOC collapse/resize -- each a real,
 * separately-scoped follow-up (Presenter Mode itself is still §6.6's own unscoped remaining
 * item).
 */
export function PreviewPane() {
  const nodes = useOutlineStore((s) => s.nodes);
  const decisions = usePadStore((s) => s.decisions);
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];
  const statusAccent = { green: t.fcGreen, red: t.fcRed, gray: t.fcGray };

  const bodyRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [activeTocId, setActiveTocId] = useState<number | null>(null);

  const tocEntries = buildTocEntries(nodes);

  const updateProgress = () => {
    const body = bodyRef.current;
    if (!body) return;
    const max = body.scrollHeight - body.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.max(0, (body.scrollTop / max) * 100)) : 0;
    setProgress(pct);
  };

  useEffect(() => {
    updateProgress();
  }, [nodes]);

  // Matches legacy's real setupPreviewScrollSpy exactly, including its own real quirk (see this
  // component's own header comment) -- re-observes whenever the TOC's own entry set changes,
  // same "rebuilt on every render" lifecycle legacy's own renderPreviewBody->
  // setupPreviewScrollSpy call chain has.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body || tocEntries.length === 0) return;
    const anchors = tocEntries
      .map((entry) => document.getElementById(`pv-anchor-${entry.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (anchors.length === 0) return;
    const observer = new IntersectionObserver(
      (entriesList) => {
        const visible = entriesList.filter((e) => e.isIntersecting).map((e) => e.target.id);
        if (visible.length === 0) return;
        const id = Number(visible[0].replace('pv-anchor-', ''));
        setActiveTocId(id);
      },
      { root: body, rootMargin: '0px 0px -70% 0px', threshold: 0 }
    );
    anchors.forEach((a) => observer.observe(a));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocEntries.map((e) => e.id).join(',')]);

  const scrollToEntry = (id: number) => {
    const target = document.getElementById(`pv-anchor-${id}`);
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    const originalBg = target.style.backgroundColor;
    target.style.backgroundColor = t.hoverBg;
    setTimeout(() => {
      target.style.backgroundColor = originalBg;
    }, 900);
  };

  if (!nodes.length) {
    return <div style={{ color: t.mutedText, fontStyle: 'italic' }}>This document is empty.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '60vh', border: `1px solid ${t.border}`, borderRadius: 6 }}>
      <div style={{ height: 2, flexShrink: 0, background: 'transparent' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width .08s linear' }} />
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <PreviewToc entries={tocEntries} activeId={activeTocId} onSelect={scrollToEntry} />
        <div ref={bodyRef} onScroll={updateProgress} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', fontFamily: 'sans-serif', color: t.text, lineHeight: 1.6 }}>
          {nodes.map((node) => {
            const isTocEntry = tocEntries.some((e) => e.id === node.id);
            return (
              <div key={node.id} id={isTocEntry ? `pv-anchor-${node.id}` : undefined} style={{ paddingLeft: `${node.depth * 24}px`, marginBottom: 4 }}>
                <div style={{ textDecoration: node.isCheckbox && node.checked ? 'line-through' : 'none' }}>
                  {node.isCheckbox && (
                    <input type="checkbox" checked={node.checked} disabled style={{ marginRight: 6 }} />
                  )}
                  {node.text ? <NodeText text={node.text} /> : <span style={{ color: t.mutedText }}>(empty)</span>}
                </div>
                {node.note && (
                  <div
                    style={{ fontSize: 13, color: t.mutedText, fontStyle: 'italic' }}
                    // node.note is real HTML now (Phase 6.3 rich-text slice) -- sanitized again here
                    // (belt-and-suspenders on top of the sanitize-on-write in NotePanel.tsx) since
                    // this is the one place it's rendered via dangerouslySetInnerHTML.
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(node.note) }}
                  />
                )}
                {node.codeBlock && (
                  <pre
                    style={{
                      background: t.codeBg,
                      padding: 6,
                      borderRadius: 4,
                      fontSize: 13,
                      overflowX: 'auto',
                      maxWidth: '90%'
                    }}
                  >
                    {node.codeBlock.code}
                  </pre>
                )}
                {/* §6.7 slice: the decision-log card -- direct port of legacy's own real
                    `previewRenderDecisionCard` (legacy/index.html:37355-37388), shared by both
                    the on-screen Preview and the PDF export (`ExportButtons.tsx`'s `exportPdf`
                    prints this same node list, so its own decision card is a separate but
                    visually-matching implementation -- see that file's own header for why this
                    project keeps two parallel renderers rather than one shared one, the same
                    established pattern its note/code rendering already uses). */}
                {(() => {
                  const dl = decisions.find((d) => d.anchorNodeId === node.id);
                  if (!dl) return null;
                  const colorKey = decisionStatusColorKeyCore(dl.status);
                  const accent = statusAccent[colorKey];
                  const fields = PV_DL_FIELDS.filter((f) => dl[f.key]?.trim());
                  let metaText = dl.author ? `— ${dl.author}` : '';
                  if (dl.timestamp) metaText += (metaText ? ' · ' : '— ') + new Date(dl.timestamp).toLocaleDateString();
                  return (
                    <div
                      style={{
                        border: `1px solid ${t.border}`,
                        borderLeft: `3px solid ${accent}`,
                        borderRadius: 4,
                        background: t.hoverBg,
                        padding: '8px 10px',
                        marginTop: 4,
                        marginBottom: 4,
                        maxWidth: '90%'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: fields.length ? 6 : 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: accent }}>Decision Log</span>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '.02em',
                            padding: '1px 6px',
                            borderRadius: 999,
                            background: `color-mix(in srgb, ${accent} 16%, transparent)`,
                            color: accent
                          }}
                        >
                          {decisionStatusLabelCore(dl.status)}
                        </span>
                      </div>
                      {fields.map((f) => (
                        <div key={f.key} style={{ marginBottom: 4 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.02em', color: t.mutedText }}>
                            {f.label}
                          </div>
                          <div style={{ fontSize: 13 }}>{stripHtmlToText(dl[f.key])}</div>
                        </div>
                      ))}
                      {metaText && <div style={{ fontSize: 11, fontStyle: 'italic', color: t.mutedText }}>{metaText}</div>}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
