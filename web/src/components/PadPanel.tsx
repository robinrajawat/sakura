import { useState } from 'react';
import { usePadStore, PAD_ATTACH_MAX_BYTES } from '../store/padStore';
import type { DecisionStatus, DecisionTextField } from '../store/padStore';
import { useMindMapStore } from '../store/mindMapStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { useOutlineStore } from '../store/outlineStore';
import { qaVisibleItems, qaIsUnanswered } from '../state/qaFilter';
import { decisionVisibleItems, decisionIsOpen } from '../state/decisionFilter';
import { decisionLogAnchorLabelCore, decisionStatusLabelCore } from '../state/decisionLogQueries';
import { generateDiagramXmlFromOutline } from '../state/diagramGenScope';
import { formatRemarkDateDisplay } from '../utils/remarkDate';
import { formatFileSize } from '../utils/formatFileSize';
import { DiagramEditor } from './DiagramEditor';
import { MindMapCanvas } from './MindMapCanvas';

type PadTab = 'notes' | 'decision' | 'qa' | 'remarks' | 'files' | 'diagrams' | 'mindmap';

const TABS: { id: PadTab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'decision', label: 'Decision Log' },
  { id: 'qa', label: 'Q&A' },
  { id: 'remarks', label: 'Remarks' },
  { id: 'files', label: 'Files' },
  { id: 'diagrams', label: 'Diagrams' },
  { id: 'mindmap', label: 'Mind Map' }
];

/**
 * Phase 3 slice (docs/framework-migration-plan.md), Pad part 2 -- completes Phase 3. All 7 real
 * tabs from legacy's Pad exist here, but only 5 are functional: Notes, Decision Log, Q&A,
 * Remarks, and Files are simple document-level CRUD lists backed by padStore.ts (see that
 * file's own header for how this first pass deliberately differs from legacy's real,
 * node-anchored schema). Diagrams and Mind Map are honest placeholders -- both are real visual-
 * editor features (a canvas-based diagram tool, a node-graph mind map) that need substantial,
 * separately-scoped work of their own; showing a clearly-labeled "not yet built" tab here is
 * more honest than a fake or token implementation that doesn't actually do anything useful.
 *
 * Phase 6.3 slice (docs/phase6-full-parity-plan.md §6.3, "Pad tabs to real depth"), first piece:
 * Q&A search/filter. `QaTab` now has a filter input (substring match over question+answer) and
 * an "N unanswered" quick-filter chip, both via `state/qaFilter.ts` -- ported from legacy's
 * `qaMatchesSearch`/`qaIsUnanswered`, but only those two: legacy's real Q&A tab also groups by
 * section headers and filters on Unlinked/Follow-up, neither possible yet against this app's
 * flat `QaItem` (no section-header items, no `sourceNodeId`, no follow-up flag). AI-assisted
 * answering, bulk actions, PDF export, and node-linking are each their own separately-scoped
 * later slice.
 *
 * Second piece: Decision Log status. `Decision` gains a real `status` field
 * (proposed/approved/rejected, defaulting to proposed on creation) via `padStore.ts`'s
 * `setDecisionStatus`, plus an "N open" quick-filter chip (status === proposed), both via
 * `state/decisionFilter.ts` -- the Decision Log counterpart to `qaFilter.ts`. Legacy's real
 * Decision Log tab also filters by author (a dropdown of distinct authors present) and does
 * search-text matching over title/description -- author filtering needs an `author` field this
 * app's `Decision` doesn't have yet, so it's deferred alongside node-linking, structured fields
 * (context/rationale/alternatives/impact), card rendering, and Excel export.
 *
 * Third piece: Remarks date field. `Remark` gains a `date` field (YYYY-MM-DD, defaulting to
 * today on creation via `utils/remarkDate.ts`'s `todayDateStr`), displayed per-row through that
 * same file's `formatRemarkDateDisplay` (Today/Yesterday/short date -- direct port of legacy's
 * function of the same name). The list also now renders newest-first, matching legacy's own
 * `renderRemarksList` ordering. Node-linking (an `anchorNodeId` + anchor picker) and export
 * inclusion (wiring into a docx/pptx/PDF export pipeline) are deferred -- this app has no
 * node-linking infrastructure for Pad items generally, and no export pipeline at all yet.
 *
 * Fourth piece, item 11 of §6.3's own tracked list: Files real upload/storage. `FileRef` gains
 * `size`/`dataUrl`/`mimeType`/`addedAt` fields via `padStore.ts`'s `addFile`, which now reads the
 * selected `File` through `FileReader.readAsDataURL` rather than just recording its name -- a
 * direct port of legacy's own `addFileAttachment` (legacy/index.html:41986-42004), including the
 * 5MB-per-file cap (`PAD_ATTACH_MAX_BYTES`, matching legacy's own limit exactly) and its rejection
 * message. Each row is now a real download link (`<a href={dataUrl} download={name}>`) with a
 * real formatted size (`utils/formatFileSize.ts`, a direct port of legacy's `formatAttachSize`).
 * "Real upload/storage" turns out not to need a backend at all -- legacy's own implementation
 * has never had one either; the base64 data URI lives inline in the document's own persisted
 * JSON, same tier as every other Pad list. Deliberately NOT ported, same "flat, document-level
 * list first pass" convention as Decision Log/Remarks/Q&A above: node-linking (`anchorNodeId` +
 * the anchor-picker UI), `addedBy`, `note`, and per-mime-type icons (a generic file link stands
 * in for now) -- each a real, separately-scoped follow-up if still wanted.
 *
 * Fifth piece, item 11's Diagrams sub-slice: a real draw.io editor. `Diagram` (padStore.ts) is a
 * flat document-level list, same convention as the tabs above -- `title`/`xml` only, no
 * node-linking/status/thumbnail yet. Two entry points: "+" creates a blank diagram and opens it
 * immediately (`DiagramEditor.tsx`, a real draw.io embed via its official `postMessage` protocol
 * -- see that file's own header for the full scoping); "Generate" builds one from the outline
 * instead, via `state/diagramGenScope.ts` -- a selected node's subtree, or the whole document if
 * nothing's selected, using the already-ported (Phase 1) `diagramGen*.ts` layout/color/XML
 * engine. Deliberately no AI classification pass or review screen (this project has no AI
 * features yet -- §6.9 not started), so Generate always renders in "plain tree mode" directly,
 * matching legacy's own documented AI-unavailable fallback rather than a lesser imitation of it.
 *
 * Sixth piece, item 11's Mind Map sub-slice -- closes out §6.3. A real freeform canvas
 * (`MindMapCanvas.tsx`: pan/zoom/drag/connect/edit nodes, all hand-rolled mouse events), backed
 * by its own dedicated `store/mindMapStore.ts` rather than folded into `padStore.ts` -- a
 * genuinely separate subsystem (nodes/links/pan/zoom), same reasoning the Hub panels each get
 * their own store file. Deliberately a simpler data model than legacy's real one: no parentId
 * tree, no branch colors, no auto-layout modes -- see that store's own header for the full
 * reasoning. `MindMapsTab` here is the same list-of-named-canvases shape as `DiagramsTab` above.
 *
 * §6.7 slice: `QaTab`/`RemarksTab`'s own generic "+ New" now passes the currently-selected
 * outline node's id (`useOutlineStore`'s `selectedId`) as the new item's `anchorNodeId` -- the
 * prerequisite for `OutlineTree.tsx`'s inline remark/Q&A previews to have anything real to show.
 * For Remarks this matches legacy's own real `addRemark()` exactly (`anchorNodeId:
 * selectedId??null`, legacy/index.html:42375). For Q&A it's a deliberate, documented divergence:
 * legacy's own generic `addQaRow` (bound to this same panel's "+ New") never auto-anchors --
 * only a SEPARATE per-node entry point (`saveNodeQuestion`, a right-click "Ask a question about
 * this node" action this project hasn't built) does. Auto-anchoring here too gives this panel's
 * one real "+ New" a working, testable path to an anchored Q&A item without first building that
 * separate entry point -- a real product-shape difference from legacy, not silently copied, and
 * worth revisiting if the right-click entry point is ever built (it would let this stay
 * unanchored, matching legacy exactly, while the new action carries the anchoring).
 */
export function PadPanel() {
  const [tab, setTab] = useState<PadTab>('notes');
  const theme = useThemeStore((s) => s.theme);
  const t = THEME_TOKENS[theme];

  return (
    <div style={{ fontFamily: 'sans-serif', border: `1px solid ${t.border}`, borderRadius: 8, padding: '0.75rem' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(tb.id)}
            disabled={tab === tb.id}
            style={{ fontSize: 12, padding: '3px 8px' }}
          >
            {tb.label}
          </button>
        ))}
      </div>
      {tab === 'notes' && <NotesTab t={t} />}
      {tab === 'decision' && <DecisionTab t={t} />}
      {tab === 'qa' && <QaTab t={t} />}
      {tab === 'remarks' && <RemarksTab t={t} />}
      {tab === 'files' && <FilesTab t={t} />}
      {tab === 'diagrams' && <DiagramsTab t={t} />}
      {tab === 'mindmap' && <MindMapsTab t={t} />}
    </div>
  );
}

type Tokens = (typeof THEME_TOKENS)['light'];

function NotesTab({ t }: { t: Tokens }) {
  const notesText = usePadStore((s) => s.notesText);
  const setNotesText = usePadStore((s) => s.setNotesText);
  return (
    <textarea
      defaultValue={notesText}
      onBlur={(e) => setNotesText(e.currentTarget.value)}
      rows={8}
      placeholder="Free-form notes for this document..."
      style={{ width: '100%', font: 'inherit', fontSize: 13, border: `1px solid ${t.border}`, borderRadius: 4 }}
    />
  );
}

// Matches legacy's real `DL_FIELDS` exactly (legacy/index.html:8313-8319) -- both the field set
// and this order, including the ghost-text prompts.
const DECISION_FIELDS: { key: DecisionTextField; label: string; placeholder: string }[] = [
  { key: 'context', label: 'Context', placeholder: 'What prompted this decision?' },
  { key: 'decision', label: 'Decision', placeholder: 'What was decided?' },
  { key: 'rationale', label: 'Rationale', placeholder: 'Why was this option chosen?' },
  { key: 'alternatives', label: 'Alternatives', placeholder: 'What other options were considered?' },
  { key: 'impact', label: 'Impact', placeholder: 'What systems or people are affected?' }
];

// Matches legacy's real status-cycle order (legacy/index.html:35483-35495): clicking the status
// pill advances proposed -> approved -> rejected -> proposed.
const DECISION_STATUS_CYCLE: Record<DecisionStatus, DecisionStatus> = {
  proposed: 'approved',
  approved: 'rejected',
  rejected: 'proposed'
};

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): rebuilt for `padStore.ts`'s real Decision Log
 * schema (see that file's own header). Still a real, deliberate simplification of legacy's full
 * panel (that file's own header has the complete list of what's ported vs. not) -- this slice's
 * own scope: collapsed rows that expand in place into the 5 real fields + author + a
 * click-to-cycle status pill, "+ New" auto-anchoring to the currently-selected outline node if
 * it's free (matching legacy's real `createDecisionLog` behavior), and delete. Deliberately NOT
 * yet built: an anchor-picker UI to change/set a link after creation (`setDecisionAnchor` exists
 * on the store already, just has no UI entry point here yet), rich-text fields (plain
 * `<textarea>`s for now, matching this project's own "plain first, rich text later if genuinely
 * needed" precedent for smaller surfaces), per-field undo, author autocomplete, drag-reorder
 * (`reorderDecision` exists on the store already too), copy/paste, and the author filter
 * dropdown (`decisionFilter.ts`'s own header already explains why that one needs a real
 * `author` field -- which now exists -- but the filter UI itself is still a separate follow-up).
 */
function DecisionTab({ t }: { t: Tokens }) {
  const decisions = usePadStore((s) => s.decisions);
  const createDecision = usePadStore((s) => s.createDecision);
  const removeDecision = usePadStore((s) => s.removeDecision);
  const setDecisionStatus = usePadStore((s) => s.setDecisionStatus);
  const setDecisionField = usePadStore((s) => s.setDecisionField);
  const setDecisionAuthor = usePadStore((s) => s.setDecisionAuthor);
  const nodes = useOutlineStore((s) => s.nodes);
  const selectedId = useOutlineStore((s) => s.selectedId);
  const [openOnly, setOpenOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openCount = decisions.filter(decisionIsOpen).length;
  const visibleDecisions = decisionVisibleItems(decisions, openOnly);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setExpandedId(createDecision(selectedId))}
          style={{ fontSize: 11, padding: '2px 8px' }}
        >
          + New
        </button>
        <button
          type="button"
          disabled={!openOnly && (decisions.length === 0 || openCount === 0)}
          onClick={() => setOpenOnly(!openOnly)}
          title="Show open (proposed) decisions only"
          style={{
            fontSize: 11,
            padding: '2px 6px',
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            background: openOnly ? t.text : 'transparent',
            color: openOnly ? t.background : t.text,
            cursor: 'pointer'
          }}
        >
          {openCount} open
        </button>
      </div>
      {visibleDecisions.length === 0 && decisions.length > 0 && (
        <div style={{ color: t.mutedText, fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>No open decisions.</div>
      )}
      {decisions.length === 0 && (
        <div style={{ color: t.mutedText, fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>No decisions logged yet.</div>
      )}
      {visibleDecisions.map((d) => {
        const isExpanded = d.id === expandedId;
        return (
          <div key={d.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '6px 0', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : d.id)}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDecisionStatus(d.id, DECISION_STATUS_CYCLE[d.status]);
                }}
                style={{ fontSize: 11 }}
              >
                {decisionStatusLabelCore(d.status)}
              </button>
              <span style={{ flex: 1, color: t.mutedText, fontSize: 12 }}>{decisionLogAnchorLabelCore(d, nodes)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeDecision(d.id);
                  if (isExpanded) setExpandedId(null);
                }}
                style={{ fontSize: 11 }}
              >
                delete
              </button>
            </div>
            {isExpanded && (
              <div style={{ display: 'grid', gap: 6, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                {DECISION_FIELDS.map((f) => (
                  <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: t.mutedText }}>{f.label}</span>
                    <textarea
                      defaultValue={d[f.key]}
                      placeholder={f.placeholder}
                      rows={2}
                      onBlur={(e) => setDecisionField(d.id, f.key, e.currentTarget.value)}
                      style={{ width: '100%', font: 'inherit', fontSize: 12, border: `1px solid ${t.border}`, borderRadius: 4 }}
                    />
                  </label>
                ))}
                <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: t.mutedText }}>Author</span>
                  <input
                    defaultValue={d.author}
                    onBlur={(e) => setDecisionAuthor(d.id, e.currentTarget.value)}
                    style={{ fontSize: 12, border: `1px solid ${t.border}`, borderRadius: 4 }}
                  />
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function QaTab({ t }: { t: Tokens }) {
  const qaItems = usePadStore((s) => s.qaItems);
  const addQaItem = usePadStore((s) => s.addQaItem);
  const removeQaItem = usePadStore((s) => s.removeQaItem);
  const selectedId = useOutlineStore((s) => s.selectedId);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [search, setSearch] = useState('');
  const [unansweredOnly, setUnansweredOnly] = useState(false);

  const unansweredCount = qaItems.filter(qaIsUnanswered).length;
  const visibleItems = qaVisibleItems(qaItems, search, unansweredOnly);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
        <input
          placeholder="Filter Q&A rows…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setSearch('');
          }}
          style={{ fontSize: 12, flex: 1 }}
        />
        <button
          type="button"
          disabled={!unansweredOnly && (qaItems.length === 0 || unansweredCount === 0)}
          onClick={() => setUnansweredOnly(!unansweredOnly)}
          title="Show unanswered only"
          style={{
            fontSize: 11,
            padding: '2px 6px',
            border: `1px solid ${t.border}`,
            borderRadius: 4,
            background: unansweredOnly ? t.text : 'transparent',
            color: unansweredOnly ? t.background : t.text,
            cursor: 'pointer'
          }}
        >
          {unansweredCount} unanswered
        </button>
      </div>
      {visibleItems.length === 0 && qaItems.length > 0 && (
        <div style={{ color: t.mutedText, fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>
          No Q&A rows match{search.trim() ? ` "${search.trim()}"` : ''}
          {unansweredOnly ? ' (unanswered only)' : ''}.
        </div>
      )}
      {visibleItems.map((q) => (
        <div key={q.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}>
          <strong>{q.question}</strong>
          <div style={{ color: t.mutedText }}>{q.answer || 'No answer provided'}</div>
          <button type="button" onClick={() => removeQaItem(q.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <input
          placeholder="Question"
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <input
          placeholder="Answer"
          value={answer}
          onChange={(e) => setAnswer(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => {
            if (!question.trim()) return;
            addQaItem(question, answer, selectedId);
            setQuestion('');
            setAnswer('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function RemarksTab({ t }: { t: Tokens }) {
  const remarks = usePadStore((s) => s.remarks);
  const addRemark = usePadStore((s) => s.addRemark);
  const removeRemark = usePadStore((s) => s.removeRemark);
  const selectedId = useOutlineStore((s) => s.selectedId);
  const [person, setPerson] = useState('');
  const [text, setText] = useState('');
  // Newest first, matching legacy's own renderRemarksList ordering ("a remarks log reads
  // naturally most-recent-on-top"). Slice a copy -- reversing in place would mutate the store's
  // array reference on every render.
  const orderedRemarks = [...remarks].reverse();
  return (
    <div>
      {orderedRemarks.map((r) => (
        <div key={r.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}>
          <strong>{r.person}:</strong> {r.text}{' '}
          <span style={{ color: t.mutedText, fontSize: 11 }}>{formatRemarkDateDisplay(r.date)}</span>{' '}
          <button type="button" onClick={() => removeRemark(r.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <input
          placeholder="Person"
          value={person}
          onChange={(e) => setPerson(e.currentTarget.value)}
          style={{ fontSize: 12, width: 100 }}
        />
        <input
          placeholder="Remark"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <button
          type="button"
          onClick={() => {
            if (!text.trim()) return;
            addRemark(person || 'Anonymous', text, selectedId);
            setPerson('');
            setText('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function FilesTab({ t }: { t: Tokens }) {
  const files = usePadStore((s) => s.files);
  const addFile = usePadStore((s) => s.addFile);
  const removeFile = usePadStore((s) => s.removeFile);
  const [error, setError] = useState<string | null>(null);

  // Direct port of legacy's own addFileAttachment (legacy/index.html:41986-42004): reject over
  // the 5MB cap with a message naming the file, otherwise read via FileReader.readAsDataURL and
  // store the resulting base64 data: URI. Errors on the reader itself (rare -- a genuinely
  // unreadable file) are swallowed same as legacy's own `reader.onerror=()=>resolve()`, since
  // there's nothing actionable to tell the user beyond "that didn't work."
  function handleFileSelect(file: File): void {
    if (file.size > PAD_ATTACH_MAX_BYTES) {
      setError(`"${file.name}" is over the 5 MB attachment limit`);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = typeof evt.target?.result === 'string' ? evt.target.result : '';
      if (dataUrl) addFile(file.name, file.size, dataUrl, file.type || '');
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      {files.map((f) => (
        <div key={f.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}>
          <a href={f.dataUrl} download={f.name} style={{ color: t.text }}>
            {f.name}
          </a>{' '}
          <span style={{ color: t.mutedText, fontSize: 11 }}>{formatFileSize(f.size)}</span>{' '}
          <button type="button" onClick={() => removeFile(f.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      {error && (
        <div style={{ color: '#b02020', fontSize: 12, marginTop: 6 }}>{error}</div>
      )}
      <input
        type="file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) handleFileSelect(file);
          e.currentTarget.value = '';
        }}
        style={{ fontSize: 12, marginTop: 6 }}
      />
    </div>
  );
}

function DiagramsTab({ t }: { t: Tokens }) {
  const diagrams = usePadStore((s) => s.diagrams);
  const addDiagram = usePadStore((s) => s.addDiagram);
  const addDiagramFromXml = usePadStore((s) => s.addDiagramFromXml);
  const removeDiagram = usePadStore((s) => s.removeDiagram);
  const renameDiagram = usePadStore((s) => s.renameDiagram);
  const duplicateDiagram = usePadStore((s) => s.duplicateDiagram);
  const updateDiagramXml = usePadStore((s) => s.updateDiagramXml);
  const theme = useThemeStore((s) => s.theme);
  const nodes = useOutlineStore((s) => s.nodes);
  const selectedIds = useOutlineStore((s) => s.selectedIds);

  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openDiagram = diagrams.find((d) => d.id === openId) || null;

  function handleCreate(): void {
    const id = addDiagram();
    setOpenId(id);
  }

  // Direct port of the scope-picking half of legacy's own generateDiagramFromOutline
  // (legacy/index.html:23885-23911) via state/diagramGenScope.ts -- see that file's own header
  // for what's deliberately not ported yet (AI classification/review screen, regenerate-in-place).
  function handleGenerate(): void {
    setError(null);
    const result = generateDiagramXmlFromOutline(nodes, selectedIds());
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const id = addDiagramFromXml(result.xml);
    setOpenId(id);
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" onClick={handleCreate} style={{ fontSize: 12 }}>
          + New diagram
        </button>
        <button type="button" onClick={handleGenerate} style={{ fontSize: 12 }}>
          Generate from outline
        </button>
      </div>
      {error && <div style={{ color: '#b02020', fontSize: 12, marginBottom: 8 }}>{error}</div>}
      {diagrams.length === 0 && (
        <div style={{ color: t.mutedText, fontStyle: 'italic', fontSize: 13 }}>
          No diagrams yet. Click + to create one in draw.io, or Generate to build one from the
          outline (a selected node's subtree, or the whole document if nothing's selected).
        </div>
      )}
      {diagrams.map((d) => (
        <div
          key={d.id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}
        >
          <button
            type="button"
            onClick={() => setOpenId(d.id)}
            style={{ flex: 1, textAlign: 'left', fontSize: 13, color: t.text, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            {d.title || 'Untitled diagram'}
          </button>
          <span style={{ color: t.mutedText, fontSize: 11 }}>{new Date(d.modifiedAt).toLocaleDateString()}</span>
          <button type="button" onClick={() => duplicateDiagram(d.id)} style={{ fontSize: 11 }}>
            duplicate
          </button>
          <button type="button" onClick={() => removeDiagram(d.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      {openDiagram && (
        <DiagramEditor
          diagram={openDiagram}
          dark={theme === 'dark'}
          onSave={(xml) => updateDiagramXml(openDiagram.id, xml)}
          onRename={(title) => renameDiagram(openDiagram.id, title)}
          onClose={() => setOpenId(null)}
          t={t}
        />
      )}
    </div>
  );
}

function MindMapsTab({ t }: { t: Tokens }) {
  const maps = useMindMapStore((s) => s.maps);
  const addMap = useMindMapStore((s) => s.addMap);
  const removeMap = useMindMapStore((s) => s.removeMap);
  const renameMap = useMindMapStore((s) => s.renameMap);
  const duplicateMap = useMindMapStore((s) => s.duplicateMap);

  const [openId, setOpenId] = useState<number | null>(null);
  const openMap = maps.find((m) => m.id === openId) || null;

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" onClick={() => setOpenId(addMap())} style={{ fontSize: 12 }}>
          + New map
        </button>
      </div>
      {maps.length === 0 && (
        <div style={{ color: t.mutedText, fontStyle: 'italic', fontSize: 13 }}>
          No mind maps yet. Click + to start a freeform brainstorming canvas for this document.
        </div>
      )}
      {maps.map((m) => (
        <div
          key={m.id}
          style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}
        >
          <button
            type="button"
            onClick={() => setOpenId(m.id)}
            style={{ flex: 1, textAlign: 'left', fontSize: 13, color: t.text, background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            {m.title || 'Untitled map'}
          </button>
          <span style={{ color: t.mutedText, fontSize: 11 }}>
            {m.nodes.length ? `${m.nodes.length} node${m.nodes.length === 1 ? '' : 's'}` : 'Empty'}
          </span>
          <button type="button" onClick={() => duplicateMap(m.id)} style={{ fontSize: 11 }}>
            duplicate
          </button>
          <button type="button" onClick={() => removeMap(m.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      {openMap && (
        <MindMapCanvas
          map={openMap}
          onClose={() => setOpenId(null)}
          onRename={(title) => renameMap(openMap.id, title)}
          t={t}
        />
      )}
    </div>
  );
}
