/**
 * Template application — the node-construction core of loading a saved template's raw node
 * data into the live outline (`applyTemplateNodes` in index.html).
 *
 * Phase 3 (docs/architecture-plan.md) — first of the "most promising, most novel" candidates
 * flagged in the architecture doc and in templatesIndex.ts's own header: `applyTemplateNodes`
 * is coupled to the ambient node-id counter because `makeNode()` mutates the shared `nextId`
 * global as it constructs each node (`id: nextId++`). Unlike every prior generated block,
 * which references already-extracted pure logic via the `declare function` ambient-global
 * pattern, `makeNode` is hand-written and used in ~30 other places in index.html unrelated to
 * templates (paste, drag-and-drop, import) — it isn't itself a candidate for extraction here,
 * and the `declare function` pattern is reserved for already-generated blocks (see
 * nodeMutations.ts / nodeSelection.ts's own use of it against nodeQueries.ts). So this module
 * takes the real `makeNode` (and `emptyStyles`) as injected dependencies instead — the same
 * `initXState(deps)` shape every other Phase 2/3 module uses, just injecting a hand-written
 * function rather than a storage/DOM primitive.
 *
 * Explicitly NOT extracted here, and why:
 * - applyBuiltinDefaultTemplate — reuses THIS module's applyTemplateNodesCore directly (see
 *   index.html's DEFAULT_TEMPLATE_RAW_NODES + docs/architecture-plan.md's ninth-slice
 *   follow-up), rather than needing its own core: investigation found its original explicit
 *   `.id`-based parenting was dead code, unconditionally overwritten by its own trailing
 *   rebuildParentIds() call, which derives every parentId purely from depth. Once that's true,
 *   its ~20 sequential makeNode calls collapse to the exact same flat-data shape this module
 *   already handles — no new source needed.
 * - applyDefaultTemplate — trivial branching orchestration (custom-template path via
 *   applyTemplateNodes, or built-in path via applyBuiltinDefaultTemplate), no logic of its own
 *   to extract.
 * - The post-construction selection reset (`selectedId`/`editingId`/`selectAllMode`/
 *   `clearMultiSelection()`/`selectionAnchorId`/`flashNodeId`) and the `rebuildParentIds()`
 *   call — same "orchestration wrapper does the side-effecting/DOM-adjacent part by hand"
 *   split every prior slice has used (e.g. nodeSelection.ts, hubTodos.ts).
 */

/** The subset of a real outline node this module constructs and reads back the `id` of.
 * Intentionally loose (not importing nodeQueries.ts's BaseOutlineNode) since the real object
 * shape is owned by index.html's own `makeNode`, not this module — this module only needs to
 * know that whatever `makeNodeFn` returns has a numeric `id`, and otherwise treats it opaquely. */
export interface AppliedTemplateNode {
  id: number;
  checked: boolean;
  tags: string[];
  [key: string]: unknown;
}

/** Shape of one raw node entry as stored in a saved template's JSON (`{nodes:[...]}`). All
 * fields optional/loosely-typed to mirror the original's defensive `n.text||''` etc. handling
 * of whatever was actually in localStorage. */
export interface RawTemplateNode {
  text?: string;
  depth?: number;
  styles?: unknown;
  note?: string;
  isCheckbox?: boolean;
  checked?: boolean;
  tags?: unknown;
}

export interface TemplatesApplyDeps {
  /** The real, ambient `makeNode` — mints a fresh node with a fresh id from the shared
   * `nextId` counter (`nextId++`) and a real `Date.now()` timestamp, exactly as it does for
   * every other caller (paste, drag-and-drop, import). Injected rather than reimplemented so
   * this module can never drift from the real field set. */
  makeNode: (
    text: string,
    depth: number,
    parentId: number | null,
    styles: unknown,
    note: string,
    isCheckbox: boolean
  ) => AppliedTemplateNode;
  /** The real, ambient `emptyStyles` — used as the styles fallback for a raw node with no
   * `styles` field, exactly as the original inlined `n.styles||emptyStyles()` did. */
  emptyStyles: () => unknown;
}

export interface AppliedTemplateResult {
  nodes: AppliedTemplateNode[];
  nextId: number;
}

/** Pure given its injected dependencies: constructs one fresh node per raw template node
 * (always as a flat, depth-preserving, parent-less list — matching the original, which never
 * set a `parentId` here and instead relied on the caller's `rebuildParentIds()` to derive
 * parentage from `depth`), then computes the next free id the same way the original did
 * (`max existing id + 1`, or `1` for an empty template). Every `makeNode` call happens through
 * the injected function, so id minting and the `nextId` global it mutates behave identically
 * to every other real call site — this function only reads back the ids afterward to compute
 * the returned `nextId`, never mutates any global itself. */
export function applyTemplateNodesCore(
  rawNodes: RawTemplateNode[] | null | undefined,
  deps: TemplatesApplyDeps
): AppliedTemplateResult {
  const nodes = (rawNodes || []).map((n) => {
    const nd = deps.makeNode(
      n.text || '',
      n.depth || 0,
      null,
      n.styles || deps.emptyStyles(),
      n.note || '',
      !!n.isCheckbox
    );
    nd.checked = !!n.checked;
    nd.tags = Array.isArray(n.tags) ? (n.tags as string[]) : [];
    return nd;
  });
  const nextId = nodes.reduce((max, n) => Math.max(max, n.id), 0) + 1;
  return { nodes, nextId };
}
