/**
 * One API request as a Postman collection file (owner, 2026-10-30: API requests move one at a
 * time -- in by pasting a cURL command, out from the card).
 *
 * Right-click an API card › Export this request (.json) saves the request as a Postman v2.1
 * collection holding just that request, named after its row. Unlike Copy for Postman (cURL) it
 * keeps the description, parameter notes and every documented response as a saved example.
 * There is deliberately no collection import and no document-wide export (owner decisions).
 *
 * Pure data in and out; index.html does the download.
 * Wired into index.html via scripts/generate-index-blocks.mjs's `postmanCollection` block.
 */

import { apiParameters, splitApiUrl, type ApiRequest } from './apiRequest';

type Json = Record<string, unknown>;

export const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

/**
 * One API request as a Postman v2.1 item: the request (query parameters and :path variables with
 * their descriptions, headers, body, description with the Auth note) and one saved example per
 * documented response.
 */
export function apiRequestToPostmanItem(name: string, r: ApiRequest): Json {
  const params = apiParameters(r);
  const query = params.filter(p => p.in === 'query');
  const raw = r.query.length ? r.url + (r.url.includes('?') ? '&' : '?') + r.query.map(([k, v]) => (v ? k + '=' + v : k)).join('&') : r.url;
  // Postman's path variables are the :name kind; {{name}} is its environment variable.
  const pathVars = params.filter(p => p.in === 'path' && new RegExp('(^|/):' + p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=/|$)').test(splitApiUrl(r.url).path));
  const withNote = <T extends Json>(o: T, note: string): T => (note ? { ...o, description: note } : o);
  const request: Json = {
    method: r.method,
    header: r.headers.map(([key, value]) => ({ key, value })),
    url: {
      raw,
      ...(query.length ? { query: query.map(p => withNote({ key: p.name, value: p.value }, p.note)) } : {}),
      ...(pathVars.length ? { variable: pathVars.map(p => withNote({ key: p.name, value: '' }, p.note)) } : {})
    }
  };
  if (r.body) request.body = { mode: 'raw', raw: r.body, ...(/^\s*[[{]/.test(r.body) ? { options: { raw: { language: 'json' } } } : /^\s*</.test(r.body) ? { options: { raw: { language: 'xml' } } } : {}) };
  const description = [r.description, r.auth ? 'Auth: ' + r.auth : ''].filter(Boolean).join('\n\n');
  if (description) request.description = description;
  const item: Json = { name: name || r.method + ' ' + r.url, request };
  const examples = r.responses.filter(x => x.status || x.body);
  if (examples.length) {
    item.response = examples.map(x => {
      const m = /^\s*(\d{3})\s*(.*)$/.exec(x.status);
      return {
        name: x.status || 'Example',
        originalRequest: request,
        ...(m ? { code: Number(m[1]), status: m[2] || '' } : x.status ? { status: x.status } : {}),
        body: x.body
      };
    });
  }
  return item;
}

/** A Postman v2.1 collection holding just this request, both named `name`. */
export function apiRequestToPostmanCollection(name: string, r: ApiRequest): Json {
  const title = name.trim() || r.method + ' ' + r.url;
  return { info: { name: title, schema: POSTMAN_SCHEMA }, item: [apiRequestToPostmanItem(title, r)] };
}
