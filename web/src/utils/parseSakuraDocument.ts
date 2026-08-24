import type { OutlineNode, NodeStyles, CodeBlock } from '../store/outlineStore';

/**
 * §6.6 slice (docs/phase6-full-parity-plan.md): Sakura Document (`.sakura.json`) import -- the
 * read side of `exportSakuraDocument` (`ExportButtons.tsx`). Direct port of legacy's real
 * `importSakuraDocumentFile`'s validation (legacy/index.html:22077-22086) -- a payload is valid
 * only if it parses as JSON, is a real object, has `kind === 'sakura-document'`, and has an
 * array `nodes` field; anything else returns `null` and the caller treats it as "not a valid
 * Sakura Document file" (no toast infrastructure exists in `web/` yet, same silent-no-op
 * convention this file's own OPML import already uses).
 *
 * Real, deliberate scope reduction from legacy's real payload: legacy's own
 * `exportSakuraDocumentFile` bundles Pad content too (`pad`/`qa`/`diagrams`/`mindMaps`/
 * `decisionLogs`/`attachments`/`remarks`), because in legacy every one of those is genuinely
 * PER-DOCUMENT data. In `web/` today, none of them are: `usePadStore` (`padStore.ts`) is a
 * single flat, in-memory-only, app-wide store -- not scoped to any document at all, and not
 * persisted anywhere (`docStorageKey`'s own `StoredDoc` shape is just `{title, nodes}`, checked
 * directly against `documentsStore.ts`). There is no per-document Pad state in `web/` to export
 * or import yet -- a real, separately-scoped architectural gap (Pad's own real persistence and
 * doc-scoping, not built at all yet), not a small omission bundled quietly into this slice. This
 * import/export pair is scoped to exactly what IS real and document-scoped in `web/` today: the
 * outline itself, full-fidelity (unlike OPML export/import, which loses `styles`/`tags`/
 * `codeBlock` through OPML's own text-only format -- this format round-trips every field of a
 * real `OutlineNode` exactly, since the payload IS the store's own node shape, not a lossy
 * encoding of it).
 *
 * `parentId` is deliberately NOT trusted from the imported payload (unlike legacy, which does
 * trust it, matching legacy's whole document being byte-identical to how it exported) --
 * `rebuildParentIdsCore` derives it fresh from each node's own `depth`/position after import,
 * the same "build flat, then rebuild parentId" convention `parseOpml.ts`'s own OPML import
 * already established, since a hand-edited or corrupted file could have `parentId` fields that
 * disagree with `depth` and there is no reason to trust one over the other when `depth` alone is
 * sufficient to derive a consistent tree.
 */

export interface SakuraDocumentPayload {
  title: string;
  nodes: OutlineNode[];
}

function normalizeStyles(raw: unknown): NodeStyles {
  const s = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const heading = Number(s.heading);
  return {
    bold: !!s.bold,
    italic: !!s.italic,
    underline: !!s.underline,
    strike: !!s.strike,
    heading: Number.isInteger(heading) && heading >= 0 && heading <= 6 ? heading : 0,
    highlight: typeof s.highlight === 'string' ? s.highlight : false,
    color: typeof s.color === 'string' ? s.color : false
  };
}

function normalizeCodeBlock(raw: unknown): CodeBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.lang !== 'string' || typeof c.code !== 'string') return null;
  return { lang: c.lang, code: c.code };
}

/** Pure: coerces one raw JSON node into a safe, well-typed `OutlineNode` (`id`/`depth` must be
 * real finite numbers or the node is dropped entirely -- everything else defaults to a safe
 * empty value, the same "safe to store, safe to render" contract this project's other
 * normalizers already use, e.g. `normalizeDecisionLogCore`). `parentId` is always `null` here --
 * see this file's header for why. */
function normalizeImportedNode(raw: unknown): OutlineNode | null {
  if (!raw || typeof raw !== 'object') return null;
  const n = raw as Record<string, unknown>;
  const id = Number(n.id);
  const depth = Number(n.depth);
  if (!Number.isFinite(id) || !Number.isFinite(depth)) return null;
  return {
    id,
    depth: Math.max(0, Math.round(depth)),
    text: typeof n.text === 'string' ? n.text : '',
    parentId: null,
    isCheckbox: !!n.isCheckbox,
    checked: !!n.checked,
    note: typeof n.note === 'string' ? n.note : '',
    codeBlock: normalizeCodeBlock(n.codeBlock),
    tags: Array.isArray(n.tags) ? n.tags.filter((t): t is string => typeof t === 'string') : [],
    styles: normalizeStyles(n.styles)
  };
}

/** Pure: matches legacy's own real `importSakuraDocumentFile` validation exactly (JSON parse +
 * `kind`/`nodes` shape check), plus per-node normalization (see `normalizeImportedNode`).
 * Returns `null` for anything that isn't a valid, non-empty Sakura Document payload. */
export function parseSakuraDocumentCore(jsonText: string): SakuraDocumentPayload | null {
  let payload: unknown;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (p.kind !== 'sakura-document' || !Array.isArray(p.nodes)) return null;
  const nodes = p.nodes.map(normalizeImportedNode).filter((n): n is OutlineNode => n !== null);
  if (!nodes.length) return null;
  const title = typeof p.title === 'string' && p.title.trim() ? p.title.trim() : 'Untitled';
  return { title, nodes };
}
