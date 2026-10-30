/**
 * Postman collections <-> API request rows (owner, 2026-10-30: Phase 2 of documenting APIs).
 *
 * Import reads a Postman Collection v2.0/v2.1 file into outline rows: a folder becomes a row
 * with its requests (and sub-folders) under it, and each request becomes a row named like the
 * request with an API request table (see apiRequest.ts) holding its method, URL, query, headers,
 * body, description and the first saved example response. Disabled query rows and headers are
 * left out. Collection variables ({{baseUrl}}) stay as typed in the URL. Auth (the request's,
 * else the nearest folder's or the collection's) becomes an Authorization header or API key row,
 * with any literal secret replaced by a {{variable}} so a spec never carries a real token.
 *
 * Export is the reverse: rows holding an API request table become requests, and their ancestor
 * rows become folders, so a spec's outline round-trips into Postman.
 *
 * Pure data in and out; index.html does the file picking, row creation and download.
 * Wired into index.html via scripts/generate-index-blocks.mjs's `postmanCollection` block.
 */

import { apiRequestFromGrid, type ApiRequest } from './apiRequest';

export interface OutlineApiRow {
  depth: number;
  text: string;
  /** Field | Value rows for an API request table, header row included; null for a folder row. */
  grid: string[][] | null;
}

export interface PostmanImport {
  title: string;
  rows: OutlineApiRow[];
  requestCount: number;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** Postman descriptions may be a string or {content}. */
function descriptionText(d: unknown): string {
  if (isObj(d)) return str(d.content).trim();
  return str(d).trim();
}

/** A Postman url (string or object) as the address without its query, plus the enabled query rows. */
export function postmanUrl(url: unknown): { url: string; query: [string, string][] } {
  if (!isObj(url)) {
    const raw = str(url);
    return { url: raw, query: [] };
  }
  const raw = str(url.raw);
  const query: [string, string][] = Array.isArray(url.query)
    ? (url.query as unknown[]).filter(q => isObj(q) && !q.disabled && str(q.key)).map(q => [str((q as Json).key), str((q as Json).value)])
    : [];
  let base = raw;
  if (!base) {
    const host = Array.isArray(url.host) ? (url.host as unknown[]).map(str).join('.') : str(url.host);
    const path = Array.isArray(url.path) ? (url.path as unknown[]).map(str).join('/') : str(url.path);
    const proto = str(url.protocol);
    base = (proto ? proto + '://' : '') + host + (path ? '/' + path : '');
  }
  // The structured query wins over the raw string's, so drop the raw query when there is one.
  if (query.length || (Array.isArray(url.query) && (url.query as unknown[]).length)) base = base.split('?')[0];
  return { url: base, query };
}

/** A Postman request body as text: raw as is, form fields one per line. */
function bodyText(body: unknown): string {
  if (!isObj(body)) return '';
  const mode = str(body.mode);
  if (mode === 'raw') return str(body.raw);
  if (mode === 'urlencoded' || mode === 'formdata') {
    const list = Array.isArray(body[mode]) ? (body[mode] as unknown[]) : [];
    return list.filter(f => isObj(f) && !f.disabled && str(f.key))
      .map(f => str((f as Json).key) + '=' + (str((f as Json).type) === 'file' ? '<file>' : str((f as Json).value)))
      .join(mode === 'urlencoded' ? '&' : '\n');
  }
  if (mode === 'graphql' && isObj(body.graphql)) return str(body.graphql.query);
  return '';
}

/** A Postman auth list ([{key, value}]) as a lookup. */
function authValues(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  (Array.isArray(list) ? list : []).forEach(e => { if (isObj(e)) out[str(e.key)] = str(e.value); });
  return out;
}

/**
 * A literal secret is never written into a spec: anything that isn't already a {{variable}}
 * becomes one named after its field ({{token}}, {{password}}), so the card shows where it goes.
 */
function asVariable(value: string, name: string): string {
  return /\{\{[^}]+\}\}/.test(value) ? value : '{{' + name + '}}';
}

/**
 * The rows a Postman auth block adds: Bearer and Basic as an Authorization header, an API key
 * as a header or query row (with its name kept, its value a variable), and any other kind
 * (OAuth 2.0, Digest...) as an "Auth" extra naming it. "noauth" adds nothing.
 */
export function postmanAuthRows(auth: unknown): string[][] {
  if (!isObj(auth)) return [];
  const type = str(auth.type);
  const v = authValues(auth[type]);
  if (!type || type === 'noauth') return [];
  if (type === 'bearer') return [['Header', 'Authorization: Bearer ' + asVariable(v.token || '', 'token')]];
  if (type === 'basic') return [['Header', 'Authorization: Basic ' + asVariable(v.username || '', 'username') + ':' + asVariable(v.password || '', 'password')]];
  if (type === 'apikey') {
    const name = v.key || 'X-API-Key';
    const value = asVariable(v.value || '', 'apiKey');
    return v.in === 'query' ? [['Query', name + '=' + value]] : [['Header', name + ': ' + value]];
  }
  return [['Auth', type]];
}

/** The Field | Value grid for one Postman item that has a request; `inheritedAuth` is the nearest folder's or the collection's. */
export function postmanItemToGrid(item: Json, inheritedAuth?: unknown): string[][] {
  const req = isObj(item.request) ? item.request : { url: str(item.request) };
  const method = (str(req.method) || 'GET').toUpperCase();
  const { url, query } = postmanUrl(req.url);
  const grid: string[][] = [['Field', 'Value'], ['Method', method], ['URL', url]];
  query.forEach(([k, v]) => grid.push(['Query', v ? k + '=' + v : k]));
  (Array.isArray(req.header) ? (req.header as unknown[]) : [])
    .filter(h => isObj(h) && !h.disabled && str(h.key))
    .forEach(h => grid.push(['Header', str((h as Json).key) + ': ' + str((h as Json).value)]));
  // A request's own auth wins; without one (or "inherit") it takes its folder's or the collection's.
  const ownAuth = isObj(req.auth) && str(req.auth.type) !== 'inherit' ? req.auth : inheritedAuth;
  postmanAuthRows(ownAuth).forEach(r => grid.push(r));
  const body = bodyText(req.body);
  if (body) grid.push(['Body', body]);
  const example = Array.isArray(item.response) ? (item.response as unknown[]).find(isObj) : null;
  if (example) {
    const code = str(example.code);
    const status = [code, str(example.status)].filter(Boolean).join(' ');
    if (status) grid.push(['Status', status]);
    if (str(example.body)) grid.push(['Response', str(example.body)]);
  }
  const desc = descriptionText(req.description) || descriptionText(item.description);
  if (desc) grid.push(['Description', desc]);
  return grid;
}

/**
 * Reads a Postman collection (already JSON-parsed) as outline rows starting at depth 0.
 * Throws an Error with a user-facing message when the file isn't a collection.
 */
export function postmanToOutline(json: unknown): PostmanImport {
  if (!isObj(json) || !Array.isArray(json.item)) throw new Error('This file isn’t a Postman collection (no requests found).');
  const info = isObj(json.info) ? json.info : {};
  const rows: OutlineApiRow[] = [];
  let requestCount = 0;
  const authOf = (o: Json, fallback: unknown) => (isObj(o.auth) && str(o.auth.type) !== 'inherit' ? o.auth : fallback);
  const walk = (items: unknown[], depth: number, auth: unknown) => {
    items.forEach(it => {
      if (!isObj(it)) return;
      const name = str(it.name).trim();
      if (Array.isArray(it.item)) {
        rows.push({ depth, text: name || 'Folder', grid: null });
        walk(it.item as unknown[], depth + 1, authOf(it, auth));
      } else if (it.request !== undefined) {
        requestCount++;
        rows.push({ depth, text: name || 'Request', grid: postmanItemToGrid(it, auth) });
      }
    });
  };
  walk(json.item as unknown[], 0, authOf(json, null));
  if (!requestCount) throw new Error('This Postman collection has no requests.');
  return { title: str(info.name).trim() || 'Postman collection', rows, requestCount };
}

const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

/** One API request as a Postman v2.1 item. */
export function apiRequestToPostmanItem(name: string, r: ApiRequest): Json {
  const request: Json = {
    method: r.method,
    header: r.headers.map(([key, value]) => ({ key, value })),
    url: {
      raw: r.query.length ? r.url + (r.url.includes('?') ? '&' : '?') + r.query.map(([k, v]) => (v ? k + '=' + v : k)).join('&') : r.url,
      ...(r.query.length ? { query: r.query.map(([key, value]) => ({ key, value })) } : {})
    }
  };
  if (r.body) request.body = { mode: 'raw', raw: r.body, ...(/^\s*[[{]/.test(r.body) ? { options: { raw: { language: 'json' } } } : {}) };
  if (r.description) request.description = r.description;
  const item: Json = { name: name || r.method + ' ' + r.url, request };
  if (r.status || r.response) {
    const m = /^\s*(\d{3})\s*(.*)$/.exec(r.status);
    item.response = [{
      name: r.status || 'Example',
      originalRequest: request,
      ...(m ? { code: Number(m[1]), status: m[2] || '' } : r.status ? { status: r.status } : {}),
      body: r.response
    }];
  }
  return item;
}

/**
 * Outline rows (depth order) as a Postman v2.1 collection: rows with an API request become
 * requests, their ancestor rows become folders; other rows and empty folders are left out.
 */
export function outlineToPostman(title: string, rows: OutlineApiRow[]): { collection: Json; requestCount: number } {
  type Folder = { name: string; item: Json[] };
  const root: Folder = { name: title, item: [] };
  const stack: { depth: number; folder: Folder; used: boolean; parent: Folder | null }[] = [];
  let requestCount = 0;
  rows.forEach(row => {
    while (stack.length && stack[stack.length - 1].depth >= row.depth) stack.pop();
    const parentFolder = stack.length ? stack[stack.length - 1].folder : root;
    const req = row.grid ? apiRequestFromGrid(row.grid) : null;
    if (req) {
      // Attach every not-yet-attached ancestor folder on the way down.
      stack.forEach((s, i) => {
        if (!s.used) { (i ? stack[i - 1].folder : root).item.push(s.folder as unknown as Json); s.used = true; }
      });
      parentFolder.item.push(apiRequestToPostmanItem(row.text.trim(), req));
      requestCount++;
    }
    stack.push({ depth: row.depth, folder: { name: row.text.trim() || 'Folder', item: [] }, used: false, parent: parentFolder });
  });
  return { collection: { info: { name: title, schema: POSTMAN_SCHEMA }, item: root.item }, requestCount };
}
