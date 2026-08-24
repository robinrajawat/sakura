import { useEffect, useRef, useState } from 'react';
import type { Diagram } from '../store/padStore';
import { THEME_TOKENS } from '../store/themeStore';

type Tokens = (typeof THEME_TOKENS)['light'];

/**
 * Phase 6.3 item 11 (docs/phase6-full-parity-plan.md), Diagrams sub-slice: the "full draw.io
 * embed" half. A real draw.io editor running in an iframe via its official embed mode
 * (https://www.drawio.com/doc/faq/embed-mode) -- direct port of legacy's own `openDiagramEditor`
 * (legacy/index.html:12042-12183), scoped down to what this project's simpler flat `Diagram`
 * model (padStore.ts) supports so far.
 *
 * The init/load/save/export/exit message handshake matches legacy's own exactly: on `init`,
 * push `{action:'load', xml}`; on `save`, capture `msg.xml` and persist it; on `exit`, close.
 * Deliberately NOT ported, each a real, separately-scoped follow-up: thumbnail/SVG export
 * (legacy piggybacks an `{action:'export', format:'xmlsvg'}` request on every save to feed the
 * list's thumbnail and Preview/PDF/PPTX/Word -- this project has none of those consumers yet),
 * IndexedDB-hydration polling (`d._hydrated` -- web/'s diagrams live in the same Zustand
 * store/JSON tier as everything else in Pad, no separate overflow store to wait on), multi-page
 * badge, Whiteboard/Audience-View sync (both Presenter-mode-only concepts this project's
 * Presenter mode doesn't have yet).
 *
 * Close-confirmation uses `window.confirm`, same stand-in convention
 * `SidebarFileExplorer.tsx`/`OutlineTree.tsx` already use in place of legacy's own custom
 * `sakuraConfirm` modal -- always shown (legacy skips it only while Presenter-mode presenting,
 * which this project doesn't have).
 */
export function DiagramEditor({
  diagram,
  dark,
  onSave,
  onRename,
  onClose,
  t
}: {
  diagram: Diagram;
  dark: boolean;
  onSave: (xml: string) => void;
  onRename: (title: string) => void;
  onClose: () => void;
  t: Tokens;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState('Loading draw.io…');
  const [title, setTitle] = useState(diagram.title);
  // Tracks the diagram's own xml across the 'save' event without waiting on a re-render.
  const xmlRef = useRef(diagram.xml);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow || e.source !== iframe.contentWindow) return;
      let msg: { event?: string; xml?: string };
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (!msg || !msg.event) return;

      if (msg.event === 'init') {
        iframe.contentWindow?.postMessage(JSON.stringify({ action: 'load', xml: diagram.xml || '' }), '*');
        setStatus('');
      } else if (msg.event === 'save') {
        const xml = msg.xml || xmlRef.current;
        xmlRef.current = xml;
        onSave(xml);
        setStatus(`Saved ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`);
      } else if (msg.event === 'exit') {
        onClose();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
    // Deliberately only depends on the diagram identity, not its xml/title -- reopening the
    // same diagram (component stays mounted while its own store row updates) shouldn't tear
    // down and rebuild the live draw.io session mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram.id]);

  function handleClose() {
    // No real "has this session changed since the last save" signal without the export-poll
    // machinery this slice deliberately doesn't port (see header) -- so, same as legacy, this
    // always asks rather than guessing: only a save *inside* draw.io itself is durable.
    const ok = window.confirm(
      'Only changes saved inside draw.io (Ctrl/Cmd+S, or its own Save button) are kept — if you made changes since the last save, closing now loses them.\n\nSaved this diagram already?'
    );
    if (!ok) return;
    onClose();
  }

  function commitTitle() {
    if (title !== diagram.title) onRename(title);
  }

  const src =
    'https://embed.diagrams.net/?embed=1&proto=json&spin=1&modified=unsavedChanges' + (dark ? '&ui=dark' : '');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: t.background, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 12px',
          borderBottom: `1px solid ${t.border}`,
          flexShrink: 0
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          }}
          placeholder="Untitled diagram"
          style={{ fontSize: 14, fontWeight: 600, flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: t.text }}
        />
        <span style={{ fontSize: 12, color: t.mutedText, whiteSpace: 'nowrap' }}>{status}</span>
        <button type="button" onClick={handleClose} style={{ fontSize: 12 }}>
          Close
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <iframe ref={iframeRef} title="draw.io diagram editor" src={src} style={{ width: '100%', height: '100%', border: 'none' }} />
      </div>
    </div>
  );
}
