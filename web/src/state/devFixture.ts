/**
 * §8.5 slice (docs/phase8-design-system-parity-plan.md): a real, richly-populated verification
 * fixture. Every prior phase's own screenshot verification (Phase 6, 7, and every §8.4 retrofit
 * slice) reused the empty "Welcome" seed document, which never exercises tags, a set status
 * chip, an author/link chip, a decision log card, a checkbox with mixed-checked sub-items, or
 * nested sidebar folders -- exactly the content whose *styling* this whole phase is about. That
 * gap is this plan's own stated reason §8.4o (`EmptyDocState.tsx`) and §8.4p
 * (`QuickAssistBar.tsx`) needed a second, later pass to catch: a verification screenshot that
 * never renders a given piece of chrome can't ever catch a gap in how it's styled.
 *
 * Navigating to `?seedFixture=1` builds this once, before `App` renders (same "run before React
 * renders" precedent `main.tsx`'s own `installAudienceBridge()` call already established), and
 * is meant to be the standard screenshot subject for this phase's own verification and every
 * phase after it -- not committed as real user content, just a reproducible generator. Built
 * entirely out of already-public store actions (`useDocumentsStore`/`useOutlineStore`/
 * `usePadStore`), the same way a real user's own actions would build this content, plus one
 * direct `useOutlineStore.setState` for the node list itself -- the same technique
 * `documentsStore.ts`'s own `applyTabView`/`restoreDocRevision` already use for bulk content,
 * not a new pattern.
 *
 * Calls `useDocumentsStore.getState().init()` itself before seeding anything -- the same
 * precedent `AudienceWindow.tsx` already established for a branch that (like this one) never
 * mounts `DocumentTabs.tsx`, the component that normally calls `init()` on mount. This means any
 * documents already loaded from a real prior session are preserved and simply gain the fixture
 * folder/document alongside them, not replaced -- but since this is a dev-only screenshot tool,
 * it should still be run against a fresh/incognito browser profile in practice, matching this
 * project's own established verification convention (fresh profile, empty localStorage) for
 * every other real headless-Chrome check throughout Phase 6-8.
 */
import { useDocumentsStore } from '../store/documentsStore';
import { useOutlineStore, defaultNodeStyles, type OutlineNode } from '../store/outlineStore';
import { usePadStore } from '../store/padStore';
import { rebuildParentIdsCore } from '../core/nodeSelection';

const FIXTURE_AUTHOR = 'Ada Lovelace';

function buildFixtureNodes(): OutlineNode[] {
  const n = (id: number, depth: number, text: string, extra: Partial<OutlineNode> = {}): OutlineNode => ({
    id,
    depth,
    text,
    parentId: null,
    isCheckbox: false,
    checked: false,
    note: '',
    codeBlock: null,
    tags: [],
    styles: defaultNodeStyles(),
    ...extra
  });

  const nodes: OutlineNode[] = [
    n(1, 0, 'Design System Parity — Launch Plan', { tags: ['design-system'] }),
    n(2, 1, 'Goals'),
    n(3, 2, 'Ship pixel-close visual parity with legacy', { tags: ['priority'] }),
    n(4, 1, 'Launch checklist', { isCheckbox: true, checked: false }),
    n(5, 2, 'Audit legacy CSS classes', { isCheckbox: true, checked: true }),
    n(6, 2, 'Port the icon set', { isCheckbox: true, checked: true }),
    n(7, 2, 'Retrofit every call site', { isCheckbox: true, checked: true }),
    n(8, 2, 'Build a verification fixture document', { isCheckbox: true, checked: false, tags: ['in-progress'] }),
    n(9, 1, 'Open questions'),
    n(10, 2, 'Should highlight/color per-node styling ship in this phase?', { tags: ['needs-decision'] })
  ];
  rebuildParentIdsCore(nodes);
  return nodes;
}

/** Reads the query string (pass `window.location.search`) and, only when it carries
 * `?seedFixture=1`, builds the fixture document described above. A no-op otherwise -- safe to
 * call unconditionally at the top of boot, matching `isAudienceWindow`'s own query-param-gated
 * shape. */
export function seedFixtureIfRequested(search: string): void {
  if (new URLSearchParams(search).get('seedFixture') !== '1') return;

  const docs = useDocumentsStore.getState();
  docs.init();

  const projectsFolderId = docs.createFolder(null);
  docs.renameFolder(projectsFolderId, 'Projects');
  const designFolderId = docs.createFolder(projectsFolderId);
  docs.renameFolder(designFolderId, 'Design System');

  docs.newDocument(designFolderId);
  const docId = useDocumentsStore.getState().activeDocId;
  if (!docId) return;
  docs.renameDocument(docId, 'Design System Parity — Launch Plan');
  docs.setDocStatus(docId, 'review');
  docs.setDocAuthor(docId, FIXTURE_AUTHOR);
  docs.setDocLink(docId, { label: 'Design brief', url: 'https://example.com/design-brief' });

  const nodes = buildFixtureNodes();
  useOutlineStore.setState({
    nodes,
    nextId: Math.max(...nodes.map((node) => node.id)) + 1,
    selectedId: nodes[0]?.id ?? null,
    editingId: null,
    multiSelectedIds: [],
    selectionAnchorId: nodes[0]?.id ?? null,
    collapsedIds: new Set()
  });
  docs.saveActiveDocNodes();

  const anchorNode = nodes.find((node) => node.text?.startsWith('Should highlight/color'));
  const pad = usePadStore.getState();
  const decisionId = pad.createDecision(anchorNode?.id ?? null);
  pad.setDecisionField(
    decisionId,
    'context',
    'The design-system retrofit (§8) ported per-node bold/italic/underline/strike but never wired up highlight/color, even though NodeStyles already reserves both fields.'
  );
  pad.setDecisionField(decisionId, 'decision', 'Defer highlight/color to a follow-up phase; ship the rest of §8 without it.');
  pad.setDecisionField(
    decisionId,
    'rationale',
    "Building a real color-swatch picker UI is its own scoped slice, not a one-line CSS port like every other §8 primitive."
  );
  pad.setDecisionField(decisionId, 'alternatives', 'Rush a minimal color picker into this phase anyway.');
  pad.setDecisionField(decisionId, 'impact', "Tracked in docs/post-cutover-backlog.md's Core Editing section as a known, non-blocking gap.");
  pad.setDecisionStatus(decisionId, 'approved');
  pad.setDecisionAuthor(decisionId, FIXTURE_AUTHOR);
}
