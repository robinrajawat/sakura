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
 *   Query                one per row, "name=value" or "name: value"
 *   Parameter            one per row, "name: what it means" -- documents a path or query
 *                        parameter (a "name=value" Parameter / Param row is a Query row, as before)
 *   Header               one per row, "Name: value"
 *   Auth                 how to authenticate, e.g. "Bearer token (OAuth 2.0, scope orders.read)";
 *                        when missing the card reads it from the headers (apiDetectedAuth)
 *   Body                 request body; JSON and XML are formatted on the card
 *   Status               starts a response, e.g. "201 Created"; repeat Status + Response for
 *                        each case (200, 404, 422...) -- owner 2026-10-31: errors are what
 *                        readers look for
 *   Response             the body of the response above it
 *   Description / Notes  a line of text under the request line
 * Any other field shows as a labelled extra. A table is an API request when it has a Method
 * with a known verb and a URL. Parameters are not typed in a list of their own: the card finds
 * them in the URL (path variables, the query string) and the Query rows (apiParameters).
 *
 * Wired into index.html via scripts/generate-index-blocks.mjs's `apiRequest` block.
 */

export const API_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/** One documented response: its status line ("404 Not Found") and example body. */
export interface ApiResponse {
  status: string;
  body: string;
}

export interface ApiRequest {
  method: string;
  url: string;
  query: [string, string][];
  /** Parameter descriptions, name -> what it means. */
  paramNotes: [string, string][];
  headers: [string, string][];
  /** How to authenticate, as written; '' to read it from the headers. */
  auth: string;
  body: string;
  responses: ApiResponse[];
  description: string;
  extras: [string, string][];
}

/** An empty request (GET, nothing filled in). */
export function emptyApiRequest(): ApiRequest {
  return { method: 'GET', url: '', query: [], paramNotes: [], headers: [], auth: '', body: '', responses: [], description: '', extras: [] };
}

type FieldKey = 'method' | 'url' | 'query' | 'param' | 'header' | 'auth' | 'body' | 'status' | 'response' | 'description';

const FIELD_ALIASES: Record<string, FieldKey> = {
  method: 'method', verb: 'method',
  url: 'url', endpoint: 'url', path: 'url',
  query: 'query', 'query param': 'query',
  param: 'param', params: 'param', parameter: 'param', parameters: 'param',
  header: 'header', headers: 'header',
  auth: 'auth', authentication: 'auth', 'auth type': 'auth',
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
  const req: ApiRequest = { ...emptyApiRequest(), method: '' };
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
      case 'param': {
        // "name: what it means" documents a parameter; "name=value" (= before any :) is a query
        // value, which is what Param / Parameter rows meant before descriptions existed.
        const colon = value.indexOf(':'), eq = value.indexOf('=');
        if (eq >= 0 && (colon < 0 || eq < colon)) req.query.push(splitPair(value));
        else { const [n, d] = splitPair(value); if (n) req.paramNotes.push([n, d]); }
        break;
      }
      case 'header': req.headers.push(splitPair(value)); break;
      case 'auth': req.auth = value; break;
      case 'body': req.body = req.body ? req.body + '\n' + value : value; break;
      case 'status': req.responses.push({ status: value, body: '' }); break;
      case 'response': {
        const last = req.responses[req.responses.length - 1];
        if (last) last.body = last.body ? last.body + '\n' + value : value; else req.responses.push({ status: '', body: value });
        break;
      }
      case 'description': req.description = value; break;
    }
  });
  // Each Status starts a response. A body with no status followed by a status with no body is one
  // response written the other way round (Response, then Status), as it always read.
  for (let i = 0; i < req.responses.length - 1; i++) {
    const a = req.responses[i], b = req.responses[i + 1];
    if (!a.status && a.body && b.status && !b.body) { a.status = b.status; req.responses.splice(i + 1, 1); }
  }
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

/**
 * XML indented two spaces per level: one tag per line, an element holding only text kept on one
 * line (<a>text</a>), comments / CDATA / the <?xml?> prolog kept as they are. Returns null when the
 * text isn't well-formed enough to indent safely (not starting with "<", or tags that don't
 * balance), so callers can leave it untouched. No DOM needed, so it runs in tests and workers.
 */
export function prettyXml(raw: string): string | null {
  const s = String(raw || '').trim();
  if (!s.startsWith('<')) return null;
  const tokens = s.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/g);
  if (!tokens || tokens.join('') !== s) return null;
  const lines: string[] = [];
  const stack: string[] = [];
  const pad = () => '  '.repeat(stack.length);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.startsWith('<') || t.startsWith('<![CDATA[')) {
      const text = t.startsWith('<![CDATA[') ? t : t.trim();
      if (text) lines.push(pad() + text);
      continue;
    }
    if (t.startsWith('<?') || t.startsWith('<!')) { lines.push(pad() + t); continue; }
    if (t.startsWith('</')) {
      const name = t.slice(2, -1).trim();
      if (stack.pop() !== name) return null;
      lines.push(pad() + t);
      continue;
    }
    if (t.endsWith('/>')) { lines.push(pad() + t); continue; }
    const name = (/^<([^\s/>]+)/.exec(t) || [])[1];
    if (!name) return null;
    // <a>text</a> stays on one line.
    const next = tokens[i + 1], after = tokens[i + 2];
    if (next !== undefined && !next.startsWith('<') && after === '</' + name + '>') {
      lines.push(pad() + t + next.trim() + after);
      i += 2;
      continue;
    }
    lines.push(pad() + t);
    stack.push(name);
  }
  return stack.length ? null : lines.join('\n');
}

/**
 * A request or response body formatted for reading: JSON pretty-printed, else XML indented, else
 * unchanged. `ok` is false when the text looks like JSON or XML but isn't valid, so the API form
 * can say so.
 */
export function formatPayload(raw: string): { text: string; ok: boolean; kind: 'json' | 'xml' | 'text' } {
  const s = String(raw || '').trim();
  if (/^[[{]/.test(s)) return isValidJson(s) ? { text: prettyJson(s), ok: true, kind: 'json' } : { text: String(raw || ''), ok: false, kind: 'json' };
  if (s.startsWith('<')) {
    const x = prettyXml(s);
    return x === null ? { text: String(raw || ''), ok: false, kind: 'xml' } : { text: x, ok: true, kind: 'xml' };
  }
  return { text: String(raw || ''), ok: true, kind: 'text' };
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
  req.paramNotes.forEach(([k, v]) => { if (k.trim() && v.trim()) grid.push(['Parameter', k.trim() + ': ' + v.trim()]); });
  req.headers.forEach(([k, v]) => { if (k.trim()) grid.push(['Header', v ? k + ': ' + v : k]); });
  if (req.auth.trim()) grid.push(['Auth', req.auth.trim()]);
  if (req.body.trim()) grid.push(['Body', req.body]);
  req.responses.forEach(({ status, body }) => {
    if (status.trim()) grid.push(['Status', status.trim()]);
    if (body.trim()) grid.push(['Response', body]);
  });
  if (req.description.trim()) grid.push(['Description', req.description.trim()]);
  req.extras.forEach(([k, v]) => { if (k.trim() && v.trim()) grid.push([k, v]); });
  return grid;
}

/** Whether text is valid JSON (for the editor's Format button and its warning). */
export function isValidJson(raw: string): boolean {
  try { JSON.parse(String(raw)); return true; } catch { return false; }
}

/**
 * Splits a shell command into words the way bash would for the cURL snippets Postman and browsers
 * produce: single quotes (literal), double quotes (with \" \\ \$ escapes), backslash-newline
 * continuations, and Windows cmd's ^ line continuations.
 */
export function shellWords(cmd: string): string[] {
  const s = String(cmd || '').replace(/\^\r?\n/g, ' ').replace(/\\\r?\n/g, ' ');
  const words: string[] = [];
  let cur = '';
  let has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      cur += s.slice(i + 1, end < 0 ? s.length : end); has = true; i = end < 0 ? s.length : end;
    } else if (c === '"') {
      i++; has = true;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) { cur += s[i + 1]; i += 2; } else { cur += s[i]; i++; }
      }
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[i + 1]; i++; has = true;
    } else if (/\s/.test(c)) {
      if (has) { words.push(cur); cur = ''; has = false; }
    } else { cur += c; has = true; }
  }
  if (has) words.push(cur);
  return words;
}

const SECRET_HEADER = /^(authorization|proxy-authorization|cookie|x-api-key|api-key|apikey|x-auth-token|x-access-token)$/i;

/**
 * A header value with any literal secret swapped for a {{variable}} (the same rule as Postman
 * import): Bearer/Basic keep their scheme, other secret headers become {{name}}.
 */
export function maskSecretHeader(name: string, value: string): string {
  if (!SECRET_HEADER.test(name) || /\{\{[^}]+\}\}/.test(value)) return value;
  const m = /^(Bearer|Basic|Token|Digest)\s+/i.exec(value);
  if (m) return m[1] + ' ' + (m[1].toLowerCase() === 'basic' ? '{{username}}:{{password}}' : '{{token}}');
  if (/^cookie$/i.test(name)) return '{{cookie}}';
  return /key/i.test(name) ? '{{apiKey}}' : '{{token}}';
}

/**
 * Reads a cURL command (as Postman's Code › cURL, a browser's "Copy as cURL" or Sakura's own
 * cURL button write it) as an API request: method, URL with its query split into rows, headers,
 * body and form fields. Literal secrets in auth headers and -u become {{variables}}. Returns null
 * when the text isn't a cURL command with a URL.
 */
export function curlToApiRequest(text: string): ApiRequest | null {
  const words = shellWords(String(text || '').trim());
  if (!words.length || !/^curl(\.exe)?$/i.test(words[0])) return null;
  let method = '';
  let url = '';
  const headers: [string, string][] = [];
  const data: string[] = [];
  const form: string[] = [];
  let getMode = false;
  const takesValue = new Set(['-X', '--request', '-H', '--header', '-d', '--data', '--data-raw', '--data-binary', '--data-ascii',
    '--data-urlencode', '-F', '--form', '--form-string', '-u', '--user', '--url', '-A', '--user-agent', '-e', '--referer',
    '-b', '--cookie', '-o', '--output', '-m', '--max-time', '--connect-timeout', '-x', '--proxy', '--cacert', '--cert', '--key']);
  for (let i = 1; i < words.length; i++) {
    let w = words[i];
    let v: string | undefined;
    const eq = w.startsWith('--') ? w.indexOf('=') : -1;
    if (eq > 0) { v = w.slice(eq + 1); w = w.slice(0, eq); }
    else if (/^-[XHdFuAeb]./.test(w)) { v = w.slice(2); w = w.slice(0, 2); }
    const val = () => (v !== undefined ? v : words[++i] ?? '');
    if (!w.startsWith('-')) { if (!url) url = w; continue; }
    if (!takesValue.has(w)) { if (w === '-G' || w === '--get') getMode = true; else if (w === '-I' || w === '--head') method = 'HEAD'; continue; }
    const value = val();
    switch (w) {
      case '-X': case '--request': method = value.toUpperCase(); break;
      case '--url': url = value; break;
      case '-H': case '--header': {
        const [k, hv] = splitPair(value.replace(/;$/, ''));
        if (k) headers.push([k, maskSecretHeader(k, hv)]);
        break;
      }
      case '-u': case '--user': headers.push(['Authorization', 'Basic {{username}}:{{password}}']); break;
      case '-A': case '--user-agent': headers.push(['User-Agent', value]); break;
      case '-e': case '--referer': headers.push(['Referer', value]); break;
      case '-b': case '--cookie': headers.push(['Cookie', '{{cookie}}']); break;
      case '-F': case '--form': case '--form-string': form.push(value); break;
      case '-d': case '--data': case '--data-raw': case '--data-binary': case '--data-ascii': case '--data-urlencode':
        data.push(value.startsWith('@') && w !== '--data-raw' ? '<file ' + value.slice(1) + '>' : value); break;
      default: break;
    }
  }
  if (!url) return null;
  const query: [string, string][] = [];
  const qAt = url.indexOf('?');
  let base = url;
  if (qAt >= 0) {
    base = url.slice(0, qAt);
    url.slice(qAt + 1).split('&').filter(Boolean).forEach(p => {
      const e = p.indexOf('=');
      query.push(e < 0 ? [p, ''] : [p.slice(0, e), p.slice(e + 1)]);
    });
  }
  let body = form.length ? form.join('\n') : data.join('&');
  if (getMode && data.length) { data.join('&').split('&').filter(Boolean).forEach(p => query.push(splitPair(p.replace('=', ':')))); body = ''; }
  if (!method) method = body ? 'POST' : 'GET';
  if (!(API_METHODS as readonly string[]).includes(method)) return null;
  return { ...emptyApiRequest(), method, url: base, query, headers, body };
}

/**
 * Text split into plain pieces and {{variable}} placeholders, in order, so the card can tint the
 * placeholders (the parts a reader fills in: {{baseUrl}}, {{token}}...). Never returns empty pieces.
 */
export function splitApiVariables(text: string): [string, boolean][] {
  const out: [string, boolean][] = [];
  const s = String(text || '');
  const re = /\{\{[^{}]+\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push([s.slice(last, m.index), false]);
    out.push([m[0], true]);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push([s.slice(last), false]);
  return out;
}

/**
 * A URL cut into the pieces it may wrap between: after each "/", "?", "&" and "=" (not inside
 * "://"), so a long address breaks at a path segment instead of mid-word.
 */
export function urlWrapPieces(url: string): string[] {
  const s = String(url || '');
  const pieces: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    cur += s[i];
    const c = s[i];
    const inScheme = c === '/' && (s[i + 1] === '/' || s[i - 1] === ':' || s[i - 1] === '/');
    if ((c === '/' || c === '?' || c === '&' || c === '=') && !inScheme) { pieces.push(cur); cur = ''; }
  }
  if (cur) pieces.push(cur);
  return pieces;
}

/** A parameter the request takes: where it goes, its example value and what it means. */
export interface ApiParam {
  name: string;
  /** 'path' or 'query'; '' for a description whose name the URL doesn't use. */
  in: 'path' | 'query' | '';
  value: string;
  note: string;
}

/** The URL's base (scheme + host, or a leading {{variable}} such as {{baseUrl}}), path and query. */
export function splitApiUrl(url: string): { base: string; path: string; query: string } {
  const s = String(url || '');
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/[^/?#]*|\{\{[^{}]+\}\})/i.exec(s);
  const base = m ? m[0] : '';
  const rest = s.slice(base.length).replace(/#.*$/, '');
  const q = rest.indexOf('?');
  return { base, path: q < 0 ? rest : rest.slice(0, q), query: q < 0 ? '' : rest.slice(q + 1) };
}

/**
 * The parameters a request takes, found where they already are (owner 2026-10-31: parameters
 * exist in the endpoint, so the card lists them itself): path variables in the URL's path --
 * {{orderId}}, :orderId or {orderId} -- then the query string typed into the URL, then the Query
 * rows. The base ({{baseUrl}}, the host) is not a parameter. Each picks up its Parameter row
 * description; a description whose name isn't used anywhere is kept at the end.
 */
export function apiParameters(req: Pick<ApiRequest, 'url' | 'query' | 'paramNotes'>): ApiParam[] {
  const notes = new Map<string, string>();
  (req.paramNotes || []).forEach(([k, v]) => { if (k && !notes.has(k)) notes.set(k, v); });
  const used = new Set<string>();
  const noteFor = (name: string) => {
    if (notes.has(name)) { used.add(name); return notes.get(name)!; }
    const k = [...notes.keys()].find(n => n.toLowerCase() === name.toLowerCase());
    if (k !== undefined) { used.add(k); return notes.get(k)!; }
    return '';
  };
  const out: ApiParam[] = [];
  const seen = new Set<string>();
  const add = (name: string, where: 'path' | 'query', value: string) => {
    const key = where + ':' + name;
    if (!name || seen.has(key)) return;
    seen.add(key);
    out.push({ name, in: where, value, note: noteFor(name) });
  };
  const { path, query } = splitApiUrl(req.url);
  const re = /\{\{([^{}]+)\}\}|\{([^{}]+)\}|(?:^|\/):([A-Za-z_][\w-]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) add((m[1] || m[2] || m[3]).trim(), 'path', '');
  query.split('&').filter(Boolean).forEach(p => {
    const e = p.indexOf('=');
    add(e < 0 ? p : p.slice(0, e), 'query', e < 0 ? '' : p.slice(e + 1));
  });
  (req.query || []).forEach(([k, v]) => add(k, 'query', v));
  notes.forEach((v, k) => { if (!used.has(k)) out.push({ name: k, in: '', value: '', note: v }); });
  return out;
}

/**
 * How the request authenticates, read from what it sends -- for a card whose Auth field is
 * empty: the Authorization header's scheme, an API key or token header, a session cookie, or an
 * API key in the query. '' when nothing says.
 */
export function apiDetectedAuth(req: Pick<ApiRequest, 'headers' | 'query' | 'url'>): string {
  for (const [k, v] of req.headers || []) {
    if (/^authorization$/i.test(k)) {
      if (/^bearer\b/i.test(v)) return 'Bearer token';
      if (/^basic\b/i.test(v)) return 'Basic (username and password)';
      const scheme = (/^([A-Za-z][\w-]*)\s/.exec(v) || [])[1];
      return scheme ? scheme + ' (Authorization header)' : 'Authorization header';
    }
  }
  for (const [k] of req.headers || []) {
    if (/^(x-api-key|api-key|apikey)$/i.test(k)) return 'API key (' + k + ' header)';
    if (/^(x-auth-token|x-access-token)$/i.test(k)) return 'Token (' + k + ' header)';
  }
  if ((req.headers || []).some(([k]) => /^cookie$/i.test(k))) return 'Session cookie';
  const q = apiParameters({ url: req.url, query: req.query || [], paramNotes: [] }).find(p => p.in === 'query' && /^(api[_-]?key|key|access_token|token)$/i.test(p.name));
  if (q) return (/token/i.test(q.name) ? 'Token' : 'API key') + ' (' + q.name + ' query parameter)';
  return '';
}

/** The status's class: 'ok' for 2xx, 'err' for 4xx/5xx, '' otherwise (for the card's colour). */
export function apiStatusClass(status: string): 'ok' | 'err' | '' {
  return /^\s*2/.test(status) ? 'ok' : /^\s*[45]/.test(status) ? 'err' : '';
}
