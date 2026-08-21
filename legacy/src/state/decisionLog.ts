/**
 * Pure validation/normalization layer for the Decision Log domain — first slice of a domain not
 * touched elsewhere in this migration (see docs/architecture-plan.md for the wider project).
 * `normalizeDecisionLog` validates and coerces an arbitrary object (an imported/restored
 * document's raw JSON, or legacy data from before decision logs were split into their own
 * top-level array — see `migrateNodeDecisionLogsToArray`'s own comment) into a safe, well-typed
 * DecisionLog shape: every string field defaults to `''` if not a string, `status` is
 * whitelisted against the three known statuses (defaulting to `'proposed'`), and `timestamp`
 * defaults to `null` unless it's a genuine finite number. Returns `null` for anything that isn't
 * a real object to begin with — the same "safe to store, safe to render" contract
 * `normalizeStyles`/`normalizeCodeBlock`/`normalizeTags` (this decision log's sibling
 * node-field normalizers, still hand-written, not part of this slice) already provide.
 *
 * Called from `normalizeNode` (index.html) when normalizing a node's legacy embedded
 * `decisionLog` field during load/restore/import — the one real call site, unchanged after this
 * extraction.
 *
 * Zero dependencies on any other function or constant — genuinely standalone, no
 * `declare function` ambient references needed.
 *
 * Lives in `src/state/` — Decision-Log-domain logic, not outline-mutation-domain logic (matches
 * `diagramAnchor.ts`'s own placement reasoning: reads/validates its own domain's data, never
 * touches the outline `nodes` array as a mutation target).
 */

const _DECISION_STATUSES = ['proposed', 'approved', 'rejected'];

export interface RawDecisionLog {
  context?: unknown;
  decision?: unknown;
  rationale?: unknown;
  alternatives?: unknown;
  impact?: unknown;
  status?: unknown;
  author?: unknown;
  timestamp?: unknown;
}

export interface NormalizedDecisionLog {
  context: string;
  decision: string;
  rationale: string;
  alternatives: string;
  impact: string;
  status: string;
  author: string;
  timestamp: number | null;
}

/** Pure: matches index.html's own `normalizeDecisionLog` exactly. Returns `null` for anything
 * that isn't a real object; otherwise coerces every field to a safe type, defaulting `status` to
 * `'proposed'` when missing or unrecognized and `timestamp` to `null` unless it's a genuine
 * finite number. */
export function normalizeDecisionLogCore(dl: RawDecisionLog | null | undefined): NormalizedDecisionLog | null {
  if (!dl || typeof dl !== 'object') return null;
  const status = _DECISION_STATUSES.includes(String(dl.status || '').toLowerCase())
    ? String(dl.status).toLowerCase()
    : 'proposed';
  return {
    context: typeof dl.context === 'string' ? dl.context : '',
    decision: typeof dl.decision === 'string' ? dl.decision : '',
    rationale: typeof dl.rationale === 'string' ? dl.rationale : '',
    alternatives: typeof dl.alternatives === 'string' ? dl.alternatives : '',
    impact: typeof dl.impact === 'string' ? dl.impact : '',
    status,
    author: typeof dl.author === 'string' ? dl.author : '',
    timestamp: Number.isFinite(dl.timestamp) ? (dl.timestamp as number) : null
  };
}
