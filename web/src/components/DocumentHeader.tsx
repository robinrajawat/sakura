import { useState } from 'react';
import { useDocumentsStore, DOC_STATUSES, type DocStatus } from '../store/documentsStore';
import { docStatusLabelCore, docStatusColorKeyCore, normalizeDocLinkedUrlCore, docLinkUrlLabelCore } from '../state/docHeader';
import { DropdownMenu } from './DropdownMenu';
import { DocChip, type DocChipColor } from './ui/Chip';
import { LinkIcon } from '../icons';

/** legacy/index.html:11294's own real status->color mapping, re-expressed against `DocChip`'s
 * `data-color` values (`docStatusColorKeyCore`'s `ThemeTokens`-preset-key shape predates §8.3 and
 * still returns those keys for other callers, so this is a small translation, not a duplicate
 * source of truth). */
const STATUS_COLOR_KEY_TO_DOC_CHIP: Record<'fcGray' | 'fcOrange' | 'fcGreen' | 'fcRed', DocChipColor> = {
  fcGray: 'gray',
  fcOrange: 'orange',
  fcGreen: 'green',
  fcRed: 'red'
};

/**
 * Phase 7.4 slice (docs/phase7-app-shell-and-dashboard-plan.md): the per-document header row --
 * direct port of legacy's real `#editor-title-row`/`#editor-meta-row` (legacy/index.html:6505-6530).
 * Always rendered for any open document, including the empty-state one -- mounted in `App.tsx`
 * directly above wherever the outline/preview/presenter content renders, matching legacy's real
 * DOM order (`#editor-title-row` is the first child of `#editor-wrap`).
 *
 * **One real correction to this plan's own text, found by checking the actual code rather than
 * trusting the prose**: this section's own intro says the meta-row "sits directly under the
 * (already-existing) title input" -- but `web/` never had a standalone title input anywhere; the
 * only way to rename a document was double-clicking its tab in `DocumentTabs.tsx`. This slice adds
 * the real title input too (an uncontrolled input, `defaultValue`/`onBlur`-commits via the
 * already-existing `renameDocument`, matching `DocumentTabs.tsx`'s own inline-rename input's exact
 * pattern -- not a new one invented for this component), since legacy's real `#editor-title-row`
 * genuinely is one structural unit (title + meta chips together), not two separately-scoped pieces.
 *
 * **Status chip**: a real `role="menu"` popover with 5 `role="menuitemradio"` options, matching
 * legacy's real `#doc-status-menu` exactly -- a SECOND correction: this plan's own text claims this
 * reuses "the same interaction pattern `HubTodosPanel.tsx`'s own status chip already established,"
 * but that component's real status control is a plain cycle-button (click advances through
 * none→...→done in a fixed order), not a popover with direct-select options -- checked directly in
 * `HubTodosPanel.tsx` before writing this. A cycle button would need up to 4 clicks to reach
 * "Rejected" from "Draft," a real regression from legacy's actual one-click direct-select UX for a
 * 5-option field -- so this component ports legacy's own real popover instead, using the same
 * click-outside/Escape dismiss mechanics `AnchorPicker.tsx` already established (this file's own
 * `DropdownMenu`), not a plain cycle button.
 *
 * **Author chip**: a plain inline `<input>` styled as a chip, matching legacy's real `#sb-author`
 * -- committing on blur/Enter via `setDocAuthor` (legacy mirrors its own visible chip into a
 * second hidden `#doc-author` input for internal plumbing reasons that don't apply to a single
 * React-controlled field, so this is the simpler, behaviorally-equivalent single-input port).
 *
 * **Link chip**: a button + popover with two fields (display label, URL) and Remove/Open/Save
 * actions, matching legacy's real `#doc-link-chip`/`#doc-link-menu` exactly, including
 * `normalizeDocLinkedUrlCore`'s real bare-host/tracker-key `https://`-prepending behavior and
 * `docLinkUrlLabelCore`'s real host-based fallback display text when no explicit label is set.
 *
 * **Presence and share chips are deliberately NOT built in this slice** -- both real legacy
 * elements, both `style="display:none"` in legacy's own markup by default (confirmed by directly
 * reading the markup, not assumed), so no real legacy user ever sees either for a document that
 * isn't already synced/shared. This plan's own text additionally justified deferring them by
 * citing "§6.8's Account/Sync work being still not started" -- a THIRD correction: §6.8 is actually
 * complete except real-time presence tracking itself (`docs/phase6-full-parity-plan.md`'s own §6.8
 * section shows autosave/sharing/sync-status-dot/backup/export-import/Version-History all shipped;
 * `docs/post-cutover-backlog.md`'s Account/Sync section names only "real-time presence
 * (`state/presence.ts` exists but is unwired)" as the actual remaining gap). The real reason these
 * two chips stay out of this slice is unchanged despite that correction: `docSyncStore.ts`/
 * `sharingStore.ts`/`state/presence.ts` all exist, but none has ever been wired into a
 * per-document-header UI surface like this one -- `DocSyncPanel.tsx`'s own real Share dialog still
 * renders as a bottom-of-page block, not a header chip -- a real, separately-scoped follow-up once
 * §7.6 docks that panel properly, not a backend gap.
 */
export function DocumentHeader() {
  const activeDocId = useDocumentsStore((s) => s.activeDocId);
  const doc = useDocumentsStore((s) => s.docsIndex.find((d) => d.id === s.activeDocId));
  const renameDocument = useDocumentsStore((s) => s.renameDocument);
  const setDocStatus = useDocumentsStore((s) => s.setDocStatus);
  const setDocAuthor = useDocumentsStore((s) => s.setDocAuthor);
  const setDocLink = useDocumentsStore((s) => s.setDocLink);

  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [linkMenuOpen, setLinkMenuOpen] = useState(false);
  const [linkLabelDraft, setLinkLabelDraft] = useState('');
  const [linkUrlDraft, setLinkUrlDraft] = useState('');

  if (!activeDocId || !doc) return null;

  const statusColorKey = docStatusColorKeyCore(doc.status);

  function openLinkMenu(): void {
    setLinkLabelDraft(doc!.link?.label ?? '');
    setLinkUrlDraft(doc!.link?.url ?? '');
    setLinkMenuOpen(true);
  }

  function saveLink(): void {
    const url = normalizeDocLinkedUrlCore(linkUrlDraft);
    setDocLink(activeDocId!, url ? { label: linkLabelDraft.trim(), url } : null);
    setLinkMenuOpen(false);
  }

  const linkShownLabel = doc.link ? doc.link.label || docLinkUrlLabelCore(doc.link.url) : '';
  const docChipColor = statusColorKey ? STATUS_COLOR_KEY_TO_DOC_CHIP[statusColorKey] : undefined;

  return (
    <div className="editor-title-row">
      <input
        key={activeDocId}
        className="editor-title-input"
        defaultValue={doc.title}
        placeholder="Untitled"
        aria-label="Title"
        autoComplete="off"
        onBlur={(e) => renameDocument(activeDocId, e.currentTarget.value || 'Untitled')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      <div className="editor-meta-row">
        <div style={{ position: 'relative' }}>
          <DocChip
            color={docChipColor}
            unset={!doc.status}
            aria-haspopup="true"
            aria-expanded={statusMenuOpen}
            onClick={() => setStatusMenuOpen((open) => !open)}
            title="Document status"
          >
            {docStatusLabelCore(doc.status)}
          </DocChip>
          {statusMenuOpen && (
            <DropdownMenu onClose={() => setStatusMenuOpen(false)}>
              {DOC_STATUSES.map((s) => (
                <button
                  key={s || 'none'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={doc.status === s}
                  onClick={() => {
                    setDocStatus(activeDocId, s as DocStatus);
                    setStatusMenuOpen(false);
                  }}
                  className={doc.status === s ? 'todo-dd-item selected' : 'todo-dd-item'}
                >
                  {docStatusLabelCore(s)}
                  {doc.status === s && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </DropdownMenu>
          )}
        </div>
        <input
          key={`author-${activeDocId}`}
          className={doc.author ? 'doc-status-chip doc-author-chip' : 'doc-status-chip unset doc-author-chip'}
          defaultValue={doc.author}
          placeholder="+ Add author"
          title="Document author"
          autoComplete="off"
          spellCheck={false}
          onBlur={(e) => setDocAuthor(activeDocId, e.currentTarget.value.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <div style={{ position: 'relative' }}>
          <DocChip
            unset={!doc.link}
            aria-haspopup="true"
            aria-expanded={linkMenuOpen}
            onClick={() => (linkMenuOpen ? setLinkMenuOpen(false) : openLinkMenu())}
            title="Link this document to a URL — e.g. a JIRA story or Epic"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <LinkIcon width={10} height={10} strokeWidth={2.4} />
            {doc.link ? linkShownLabel : 'Add link'}
          </DocChip>
          {linkMenuOpen && (
            <DropdownMenu onClose={() => setLinkMenuOpen(false)} width={260}>
              <div className="doc-link-menu-inner">
                <input
                  autoFocus
                  className="meta-input"
                  value={linkLabelDraft}
                  onChange={(e) => setLinkLabelDraft(e.currentTarget.value)}
                  placeholder="Display text (optional) — e.g. PROJ-1234"
                  aria-label="Link display text"
                />
                <input
                  className="meta-input"
                  value={linkUrlDraft}
                  onChange={(e) => setLinkUrlDraft(e.currentTarget.value)}
                  placeholder="https://yourteam.atlassian.net/browse/PROJ-123"
                  aria-label="Document URL"
                />
                <div className="doc-link-menu-actions">
                  {doc.link && (
                    <button
                      type="button"
                      className="doc-link-menu-btn"
                      onClick={() => {
                        setDocLink(activeDocId, null);
                        setLinkMenuOpen(false);
                      }}
                    >
                      Remove
                    </button>
                  )}
                  {doc.link && (
                    <button
                      type="button"
                      className="doc-link-menu-btn"
                      onClick={() => window.open(doc.link!.url, '_blank', 'noopener,noreferrer')}
                    >
                      Open
                    </button>
                  )}
                  <button type="button" className="doc-link-menu-btn primary" onClick={saveLink}>
                    Save
                  </button>
                </div>
              </div>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
