import { useState } from 'react';
import { usePadStore, PAD_ATTACH_MAX_BYTES } from '../store/padStore';
import type { DecisionStatus } from '../store/padStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';
import { qaVisibleItems, qaIsUnanswered } from '../state/qaFilter';
import { decisionVisibleItems, decisionIsOpen } from '../state/decisionFilter';
import { formatRemarkDateDisplay } from '../utils/remarkDate';
import { formatFileSize } from '../utils/formatFileSize';

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
      {(tab === 'diagrams' || tab === 'mindmap') && (
        <div style={{ color: t.mutedText, fontStyle: 'italic', fontSize: 13 }}>
          {tab === 'diagrams' ? 'Diagrams' : 'Mind Map'} isn't built yet — it needs a real
          canvas/graph-visualization editor, a separately-scoped follow-up.
        </div>
      )}
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

function DecisionTab({ t }: { t: Tokens }) {
  const decisions = usePadStore((s) => s.decisions);
  const addDecision = usePadStore((s) => s.addDecision);
  const removeDecision = usePadStore((s) => s.removeDecision);
  const setDecisionStatus = usePadStore((s) => s.setDecisionStatus);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [openOnly, setOpenOnly] = useState(false);

  const openCount = decisions.filter(decisionIsOpen).length;
  const visibleDecisions = decisionVisibleItems(decisions, openOnly);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
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
        <div style={{ color: t.mutedText, fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>
          No open decisions.
        </div>
      )}
      {visibleDecisions.map((d) => (
        <div key={d.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}>
          <strong>{d.title}</strong> — {d.description}{' '}
          <select
            value={d.status}
            onChange={(e) => setDecisionStatus(d.id, e.currentTarget.value as DecisionStatus)}
            style={{ fontSize: 11 }}
          >
            <option value="proposed">Proposed</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>{' '}
          <button type="button" onClick={() => removeDecision(d.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 1 }}
        />
        <input
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          style={{ fontSize: 12, flex: 2 }}
        />
        <button
          type="button"
          onClick={() => {
            if (!title.trim()) return;
            addDecision(title, description);
            setTitle('');
            setDescription('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function QaTab({ t }: { t: Tokens }) {
  const qaItems = usePadStore((s) => s.qaItems);
  const addQaItem = usePadStore((s) => s.addQaItem);
  const removeQaItem = usePadStore((s) => s.removeQaItem);
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
            addQaItem(question, answer);
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
            addRemark(person || 'Anonymous', text);
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
