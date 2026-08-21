/**
 * Templates index storage — the localStorage-backed list of saved templates (id, title,
 * updatedAt, icon, trashedAt) that Templates menu/sidebar/trash all read from and write to.
 *
 * Phase 3 (docs/architecture-plan.md) — first feature-domain slice, using the same
 * dependency-injected generator pipeline as Phase 2's state modules
 * (src/state/admin.ts/notifications.ts/presence.ts/vault.ts). Deliberately scoped narrow,
 * following the "extract only the pure, testable core; leave orchestration alone" pattern
 * the architecture doc describes for the vault extraction: this module owns index CRUD and
 * trash-state toggling only.
 *
 * Explicitly NOT extracted here, and why:
 * - renderTemplatesList/openTemplatesMenu/renderSidebarTemplates — DOM construction, stays
 *   hand-written, same reasoning as renderNotifList staying out of notifications.ts.
 * - applyTemplateNodes/applyBuiltinDefaultTemplate/applyDefaultTemplate — genuinely coupled to
 *   the ambient node-id counter: `makeNode()` mutates the shared `nextId` global as it
 *   constructs each node (`id: nextId++`), so cleanly extracting these means either injecting
 *   the real `makeNode` as a dependency (safe, but not yet attempted) or reimplementing node
 *   construction from scratch (risky — could drift from the real field set). Left for a future,
 *   deliberately scoped pass rather than folded in here. **Correction:** this is a narrower,
 *   different coupling than the original note below about `stampTemplateDateAuthor` — see that
 *   function's own inclusion below for why the same "core-outline coupling, no `core/` boundary
 *   yet" reasoning doesn't actually apply to every node-touching function equally.
 * - applyIncomingTemplateData — Firestore sync, explicitly Phase 4 territory (extracted last
 *   on purpose, per the architecture doc's own reasoning: this area has produced the most
 *   bugs historically).
 * - permanentlyDeleteTemplateCore — investigated and deliberately left out: unlike
 *   moveTemplateToTrashCore/restoreTemplateFromTrashCore (which only touch the templates
 *   index itself, and so ARE included below), permanentlyDeleteTemplateCore also reaches into
 *   a sibling, not-yet-extracted domain (the template/folder map storage) and fires a
 *   real Firestore delete — genuinely cross-domain, not this module's narrow scope.
 *
 * Deliberately no module-level constants for the storage key strings / built-in-template
 * version number (TEMPLATES_INDEX_KEY, TEMPLATE_KEY_PREFIX, BUILTIN_TEMPLATES_VERSION):
 * index.html already declares these as top-level `const`s, still read directly by sibling
 * template functions that remain hand-written (e.g. BUILTIN_TEMPLATES_SEEDED_KEY derives from
 * BUILTIN_TEMPLATES_VERSION, getSyncMetaKeys() reads TEMPLATES_INDEX_KEY). Since every
 * generated block shares one script scope with the rest of index.html, redeclaring the same
 * names here would be a duplicate `const` — a hard SyntaxError. The literal values are inlined
 * below instead, with this comment as the single place documenting that they must stay in
 * sync with index.html's own copies if either ever changes.
 */

export interface TemplateIndexEntry {
  id: string;
  title?: string;
  updatedAt?: number;
  icon?: string | null;
  trashedAt?: number;
  [key: string]: unknown;
}

export interface TemplatesIndexDeps {
  getLocalStorage: () => Storage | null;
  markMetaChanged: (metaKey: string) => void;
  scheduleBackupWrite: () => void;
  setLastAnyDataChangeAt: (ts: number) => void;
  now: () => number;
}

// Private to this module (deliberately NOT the same name as index.html's own top-level
// TEMPLATES_INDEX_KEY — see this file's header comment for why they can't be shared).
const _TEMPLATES_INDEX_STORAGE_KEY = 'sakura_templates_index_v1';

let tplIndexDeps: TemplatesIndexDeps | null = null;

/** Called once to provide real (or fake, in tests) dependencies before any other function here is used. */
export function initTemplatesIndexState(injected: TemplatesIndexDeps): void {
  tplIndexDeps = injected;
}

function requireTplIndexDeps(): TemplatesIndexDeps {
  if (!tplIndexDeps) throw new Error('templatesIndex state used before initTemplatesIndexState() was called');
  return tplIndexDeps;
}

/** Pure: the localStorage key a single template document's own content is stored under. */
export function templateKey(id: string): string {
  return 'sakura_template_v1_' + id;
}

/** Pure: the stable id a built-in template gets for a given key, versioned so a shipped-content
 * change re-seeds cleanly rather than silently patching a user's already-customized copy. The
 * version number (10) must stay in sync with index.html's own BUILTIN_TEMPLATES_VERSION — see
 * this file's header comment for why it can't be a shared constant. */
export function builtinTemplateId(key: string): string {
  return 't_builtin_' + key + '_v10';
}

/** Reads the full templates index (active + trashed). Never throws — a missing or corrupt
 * localStorage entry behaves the same as an empty list. */
export function loadTemplatesIndex(): TemplateIndexEntry[] {
  const ls = requireTplIndexDeps().getLocalStorage();
  try {
    const raw = ls ? ls.getItem(_TEMPLATES_INDEX_STORAGE_KEY) : null;
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Writes the full templates index and fires the same side effects the original did:
 * bumping the last-changed timestamp, scheduling a backup write, and marking the
 * `templatesIndex` sync meta key dirty. All three real effects, injected — this module
 * doesn't reimplement backup/sync logic, only triggers it the same way the original did. */
export function saveTemplatesIndex(list: TemplateIndexEntry[]): void {
  const d = requireTplIndexDeps();
  const ls = d.getLocalStorage();
  try {
    if (ls) ls.setItem(_TEMPLATES_INDEX_STORAGE_KEY, JSON.stringify(list));
    d.setLastAnyDataChangeAt(d.now());
    d.scheduleBackupWrite();
    d.markMetaChanged('templatesIndex');
  } catch {
    // Original swallowed localStorage write failures (e.g. quota exceeded, private browsing) —
    // preserved exactly: a failed save is silently a no-op, not a thrown error.
  }
}

/** Sets (or clears, via `icon: null`) one template's icon override. Returns the updated list,
 * matching the original's return value even though most callers use it for the side effect. */
export function setTemplateIcon(id: string, icon: string | null | undefined): TemplateIndexEntry[] {
  const list = loadTemplatesIndex();
  const i = list.findIndex((t) => t.id === id);
  if (i >= 0) {
    list[i] = { ...list[i], icon: icon || null };
    saveTemplatesIndex(list);
  }
  return list;
}

/** Looks up a built-in template's icon by its (already-versioned) id. Always returns `null`
 * now — Sakura no longer ships prebuilt template content (see getBuiltinTemplateDefs's own
 * comment in index.html), but the lookup itself is kept working rather than deleted, since
 * performBuiltinTemplateSeed and the legacy-id cleanup still call through it. */
export function getBuiltinTemplateIconById(_id: string): string | null {
  return null;
}

/** Upserts a template's index entry (creating one if it doesn't exist yet) with a fresh title
 * and updatedAt timestamp. Returns the updated list. */
export function touchTemplateIndex(id: string, title: string | null | undefined): TemplateIndexEntry[] {
  const d = requireTplIndexDeps();
  const list = loadTemplatesIndex();
  const i = list.findIndex((t) => t.id === id);
  const entry: TemplateIndexEntry = i >= 0
    ? { ...list[i], title: title || 'Untitled template', updatedAt: d.now() }
    : { id, title: title || 'Untitled template', updatedAt: d.now() };
  if (i >= 0) list[i] = entry;
  else list.push(entry);
  saveTemplatesIndex(list);
  return list;
}

/** Templates not currently in the trash. */
export function loadActiveTemplatesIndex(): TemplateIndexEntry[] {
  return loadTemplatesIndex().filter((t) => !t.trashedAt);
}

/** Trashed templates, most-recently-trashed first. */
export function loadTrashedTemplatesIndex(): TemplateIndexEntry[] {
  return loadTemplatesIndex()
    .filter((t) => t.trashedAt)
    .sort((a, b) => (b.trashedAt || 0) - (a.trashedAt || 0));
}

/** Marks a template trashed (soft delete) by stamping `trashedAt`. A no-op if the id isn't
 * found in the index. */
export function moveTemplateToTrashCore(id: string): void {
  const d = requireTplIndexDeps();
  const list = loadTemplatesIndex();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return;
  list[i] = { ...list[i], trashedAt: d.now() };
  saveTemplatesIndex(list);
}

/** Un-trashes a template by removing `trashedAt`. Returns whether it actually did anything
 * (false if the id wasn't found), matching the original's boolean return used by its callers
 * to decide whether to show a success toast. */
export function restoreTemplateFromTrashCore(id: string): boolean {
  const list = loadTemplatesIndex();
  const i = list.findIndex((t) => t.id === id);
  if (i < 0) return false;
  const rest = { ...list[i] };
  delete rest.trashedAt;
  list[i] = rest;
  saveTemplatesIndex(list);
  return true;
}

/** A node shape narrow enough for `stampTemplateDateAuthorCore`: just the mutable `text` field
 * it reads and rewrites. Re-investigated and included here (unlike `applyTemplateNodes` etc.,
 * still excluded above): this function only mutates existing nodes' `text` fields in place —
 * no node construction, no ambient id-counter involvement, no selection-state side effects. The
 * original "core-outline coupling" reasoning that excluded this function turned out to be too
 * broad, the same over-broad-original-judgment shape as `nodeSearch.ts`'s and `tabOrder.ts`'s
 * own revisits: "touches `nodes`" isn't automatically the same risk as "constructs new nodes"
 * or "resets selection state." */
export interface TemplateStampableNode {
  text: string;
}

/** Mutates `nodes` in place (same convention as `nodeMutations.ts`'s own `nodes.splice`
 * pattern): any node whose text is EXACTLY `"Date:"`, `"Author:"`, or `"Date · Author"` gets
 * that placeholder auto-filled — matching the original's generic, template-agnostic behavior
 * (works for any template with these exact lines, not just a specific named one; never touches
 * a line that already has real content, since the match is exact-string, not prefix). `dateStr`
 * and `authorName` are passed in already-formatted/already-trimmed rather than computed here,
 * since formatting a date and reading a DOM input's value are both presentation-layer concerns
 * that stay with the hand-written caller — this function's only job is the placeholder logic. */
export function stampTemplateDateAuthorCore(nodes: TemplateStampableNode[], dateStr: string, authorName: string): void {
  nodes.forEach((n) => {
    const t = String(n.text || '').trim();
    if (t === 'Date:') n.text = 'Date: ' + dateStr;
    else if (t === 'Author:' && authorName) n.text = 'Author: ' + authorName;
    else if (t === 'Date · Author') n.text = authorName ? dateStr + ' · ' + authorName : dateStr;
  });
}
