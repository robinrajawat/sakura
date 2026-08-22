import { useState } from 'react';
import { usePadStore } from '../store/padStore';
import { useThemeStore, THEME_TOKENS } from '../store/themeStore';

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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  return (
    <div>
      {decisions.map((d) => (
        <div key={d.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}>
          <strong>{d.title}</strong> — {d.description}{' '}
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
  return (
    <div>
      {qaItems.map((q) => (
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
  return (
    <div>
      {remarks.map((r) => (
        <div key={r.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}>
          <strong>{r.person}:</strong> {r.text}{' '}
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
  return (
    <div>
      {files.map((f) => (
        <div key={f.id} style={{ borderBottom: `1px solid ${t.border}`, padding: '4px 0', fontSize: 13 }}>
          {f.name}{' '}
          <button type="button" onClick={() => removeFile(f.id)} style={{ fontSize: 11 }}>
            remove
          </button>
        </div>
      ))}
      {/* Name-only -- no real upload/storage layer exists yet, see this file's own header. */}
      <input
        type="file"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) addFile(file.name);
          e.currentTarget.value = '';
        }}
        style={{ fontSize: 12, marginTop: 6 }}
      />
    </div>
  );
}
