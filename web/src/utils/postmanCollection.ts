/**
 * One API request as a Postman collection file (owner, 2026-10-30: API requests move one at a
 * time -- in by pasting a cURL command, out from the card).
 *
 * Right-click an API card › Export this request (.json) saves the request as a Postman v2.1
 * collection holding just that request, named after its row. Unlike Copy for Postman (cURL) it
 * keeps the description and the example response (status and body) as a saved example.
 * There is deliberately no collection import and no document-wide export (owner decisions).
 *
 * Pure data in and out; index.html does the download.
 * Wired into index.html via scripts/generate-index-blocks.mjs's `postmanCollection` block.
 */

import type { ApiRequest } from './apiRequest';

type Json = Record<string, unknown>;

export const POSTMAN_SCHEMA = 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json';

/** One API request as a Postman v2.1 item (request + its example response, if any). */
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

/** A Postman v2.1 collection holding just this request, both named `name`. */
export function apiRequestToPostmanCollection(name: string, r: ApiRequest): Json {
  const title = name.trim() || r.method + ' ' + r.url;
  return { info: { name: title, schema: POSTMAN_SCHEMA }, item: [apiRequestToPostmanItem(title, r)] };
}
