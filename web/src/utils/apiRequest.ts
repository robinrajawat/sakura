/**
 * API request tables (owner, 2026-10-30: document API calls in specs, not run them).
 *
 * An API request is an ordinary two-column table, Field | Value, shown with
 * data-table-display="api" as a request card. Keeping it a table means storage, undo, sync,
 * copy/paste and search work unchanged; this module is only the reading of the cells.
 *
 * Recognised fields (first column, any case, a trailing colon is ignored):
 *   Method               GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
 *   URL / Endpoint       the address; {{variables}} stay as typed
 *   Query / Param        one per row, "name=value" or "name: value"
 *   Header               one per row, "Name: value"
 *   Body                 request body; JSON is pretty-printed on the card
 *   Status               response status, e.g. "201 Created"
 *   Response             response body
 *   Description / Notes  a line of text under the request line
 * Any other field shows as a labelled extra. A table is an API request when it has a Method
 * with a known verb and a URL.
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `apiRequest` block.
 */

export const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export interface ApiRequest {
  method: string;
  url: string;
  query: [string, string][];
  headers: [string, string][];
  body: string;
  status: string;
  response: string;
  description: string;
  extras: [string, string][];
}

type FieldKey = 'method' | 'url' | 'query' | 'header' | 'body' | 'status' | 'response' | 'description';

const FIELD_ALIASES: Record<string, FieldKey> = {
  method: 'method', verb: 'method',
  url: 'url', endpoint: 'url', path: 'url',
  query: 'query', param: 'query', params: 'query', parameter: 'query', 'query param': 'query',
  header: 'header', headers: 'header',
  body: 'body', 'request body': 'body', payload: 'body',
  status: 'status', 'response status': 'status', 'status code': 'status',
  response: 'response', 'response body': 'response',
  description: 'description', notes: 'description', note: 'description'
};

/** The field a first-column label names, or null for an unknown label. */
export function apiFieldKey(label: string): FieldKey | null {
  const k = String(label || '').trim().replace(/:$/, '').trim().toLowerCase();
  return FIELD_ALIASES[k] || null;
}

/** "Name: value" or "name=value" split once, trimmed; a bare word is a name with no value. */
export function splitPair(raw: string): [string, string] {
  const s = String(raw || '').trim();
  const colon = s.indexOf(':');
  const eq = s.indexOf('=');
  const at = colon < 0 ? eq : eq < 0 ? colon : Math.min(colon, eq);
  if (at < 0) return [s, ''];
  return [s.slice(0, at).trim(), s.slice(at + 1).trim()];
}

/**
 * Reads a Field | Value grid (header row optional) as an API request, or null when it isn't one.
 * A grid with more or fewer than two columns is never a request.
 */
export function apiRequestFromGrid(grid: string[][]): ApiRequest | null {
  if (!grid.length || grid.some(r => r.length !== 2)) return null;
  const req: ApiRequest = { method: '', url: '', query: [], headers: [], body: '', status: '', response: '', description: '', extras: [] };
  grid.forEach((row, i) => {
    const [label, rawValue] = row;
    const value = String(rawValue || '').trim();
    const key = apiFieldKey(label);
    if (!key) {
      // The first row is a header ("Field | Value") unless it is a field itself.
      if (i > 0 && String(label || '').trim() && value) req.extras.push([String(label).trim().replace(/:$/, ''), value]);
      return;
    }
    if (!value) return;
    switch (key) {
      case 'method': req.method = value.toUpperCase(); break;
      case 'url': req.url = value; break;
      case 'query': req.query.push(splitPair(value)); break;
      case 'header': req.headers.push(splitPair(value)); break;
      case 'body': req.body = req.body ? req.body + '\n' + value : value; break;
      case 'status': req.status = value; break;
      case 'response': req.response = req.response ? req.response + '\n' + value : value; break;
      case 'description': req.description = value; break;
    }
  });
  if (!(API_METHODS as readonly string[]).includes(req.method) || !req.url) return null;
  return req;
}

/** The URL with the Query rows appended (raw, so {{variables}} survive). */
export function apiFullUrl(req: Pick<ApiRequest, 'url' | 'query'>): string {
  if (!req.query.length) return req.url;
  const qs = req.query.map(([k, v]) => (v ? k + '=' + v : k)).join('&');
  return req.url + (req.url.includes('?') ? (/[?&]$/.test(req.url) ? '' : '&') : '?') + qs;
}

/** JSON pretty-printed with two spaces when it parses; anything else unchanged. */
export function prettyJson(raw: string): string {
  const s = String(raw || '').trim();
  if (!/^[[{]/.test(s)) return String(raw || '');
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return String(raw || '');
  }
}

/** Single-quoted for a POSIX shell: a ' inside becomes '\''. */
export function shellQuote(s: string): string {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/**
 * The request as a cURL command (one option per line), for pasting into Postman's Import,
 * Insomnia, Bruno or a terminal. GET without a body leaves out -X; a body is sent as typed
 * (--data-raw), so JSON keeps its formatting.
 */
export function apiRequestToCurl(req: ApiRequest): string {
  const parts: string[] = ['curl'];
  const needsX = req.method !== 'GET' || !!req.body;
  if (needsX) parts.push('-X ' + req.method);
  parts.push(shellQuote(apiFullUrl(req)));
  req.headers.forEach(([k, v]) => parts.push('-H ' + shellQuote(v ? k + ': ' + v : k + ';')));
  if (req.body) parts.push('--data-raw ' + shellQuote(req.body));
  return parts.join(' \\\n  ');
}

/**
 * The request as Field | Value rows (header row first) in the standard order -- what the API
 * request editor saves back into the table. Empty parts are left out; extras keep their place at
 * the end. apiRequestFromGrid(apiRequestToGrid(r)) gives r back.
 */
export function apiRequestToGrid(req: ApiRequest): string[][] {
  const grid: string[][] = [['Field', 'Value'], ['Method', req.method], ['URL', req.url]];
  req.query.forEach(([k, v]) => { if (k.trim()) grid.push(['Query', v ? k + '=' + v : k]); });
  req.headers.forEach(([k, v]) => { if (k.trim()) grid.push(['Header', v ? k + ': ' + v : k]); });
  if (req.body.trim()) grid.push(['Body', req.body]);
  if (req.status.trim()) grid.push(['Status', req.status.trim()]);
  if (req.response.trim()) grid.push(['Response', req.response]);
  if (req.description.trim()) grid.push(['Description', req.description.trim()]);
  req.extras.forEach(([k, v]) => { if (k.trim() && v.trim()) grid.push([k, v]); });
  return grid;
}

/** Whether text is valid JSON (for the editor's Format button and its warning). */
export function isValidJson(raw: string): boolean {
  try { JSON.parse(String(raw)); return true; } catch { return false; }
}
