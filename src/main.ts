// Phase 1 (docs/architecture-plan.md): three pure, leaf utilities extracted so far —
// escapeHtml, generateId, formatRelativeTime. Re-exported here as the package's public
// surface for anything that wants to import from 'src' as a whole rather than reaching into
// individual util files directly. NOT yet imported by index.html or hub.html — see each
// util's own header comment for why (script-execution-order semantics, a deliberate later
// cutover step, not something to solve piecemeal per extracted function).
export { escapeHtml } from './utils/escapeHtml';
export { generateId } from './utils/generateId';
export { formatRelativeTime } from './utils/formatRelativeTime';
