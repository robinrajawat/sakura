// Phase 1 (docs/architecture-plan.md): pure, leaf utilities extracted so far — escapeHtml,
// generateId, formatRelativeTime, stripSemanticMarkers/getNodePlainText, and the
// computeOutlineNumbers/serializeMarkdown pair. Re-exported here as the package's public
// surface for anything that wants to import from 'src' as a whole rather than reaching into
// individual util files directly. NOT yet imported by index.html or hub.html — see each
// util's own header comment for why (script-execution-order semantics, a deliberate later
// cutover step, not something to solve piecemeal per extracted function).
export { escapeHtml } from './utils/escapeHtml';
export { generateId } from './utils/generateId';
export { formatRelativeTime } from './utils/formatRelativeTime';
export { stripSemanticMarkers, getNodePlainText, type PlainTextNode } from './utils/stripSemanticMarkers';
export { computeOutlineNumbers, serializeMarkdown, type OutlineNode } from './utils/serializeMarkdown';
