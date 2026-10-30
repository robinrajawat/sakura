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
  return { method, url: base, query, headers, body, status: '', response: '', description: '', extras: [] };
}
