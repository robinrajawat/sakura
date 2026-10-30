import { describe, it, expect } from 'vitest';
import {
  apiFieldKey, splitPair, apiRequestFromGrid, apiFullUrl, prettyJson, shellQuote, apiRequestToCurl, apiRequestToGrid, isValidJson
} from '../../src/utils/apiRequest';

const sample = [
  ['Field', 'Value'],
  ['Method', 'post'],
  ['URL', 'https://api.example.com/v1/orders'],
  ['Query', 'dryRun=true'],
  ['Header', 'Content-Type: application/json'],
  ['Header', 'Authorization: Bearer {{token}}'],
  ['Body', '{"orderId":"4711"}'],
  ['Status', '201 Created'],
  ['Response', '{"id":"4711","status":"accepted"}'],
  ['Description', 'Creates an express order'],
  ['Owner', 'Team Pricing']
];

describe('apiFieldKey', () => {
  it('reads labels in any case, with or without a colon, and aliases', () => {
    expect(apiFieldKey('Method')).toBe('method');
    expect(apiFieldKey(' url: ')).toBe('url');
    expect(apiFieldKey('Endpoint')).toBe('url');
    expect(apiFieldKey('Headers')).toBe('header');
    expect(apiFieldKey('Response body')).toBe('response');
    expect(apiFieldKey('Owner')).toBeNull();
  });
});

describe('splitPair', () => {
  it('splits at the first colon or equals sign', () => {
    expect(splitPair('Content-Type: application/json')).toEqual(['Content-Type', 'application/json']);
    expect(splitPair('page=2')).toEqual(['page', '2']);
    expect(splitPair('filter=a:b')).toEqual(['filter', 'a:b']);
    expect(splitPair('X-Flag')).toEqual(['X-Flag', '']);
  });
});

describe('apiRequestFromGrid', () => {
  it('reads every field, skips the header row and keeps unknown fields as extras', () => {
    const r = apiRequestFromGrid(sample)!;
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://api.example.com/v1/orders');
    expect(r.query).toEqual([['dryRun', 'true']]);
    expect(r.headers).toEqual([['Content-Type', 'application/json'], ['Authorization', 'Bearer {{token}}']]);
    expect(r.body).toBe('{"orderId":"4711"}');
    expect(r.status).toBe('201 Created');
    expect(r.response).toBe('{"id":"4711","status":"accepted"}');
    expect(r.description).toBe('Creates an express order');
    expect(r.extras).toEqual([['Owner', 'Team Pricing']]);
  });
  it('works without a header row', () => {
    expect(apiRequestFromGrid([['Method', 'GET'], ['URL', '/health']])?.method).toBe('GET');
  });
  it('is not a request without a known method and a URL, or with other than two columns', () => {
    expect(apiRequestFromGrid([['Method', 'FETCH'], ['URL', '/x']])).toBeNull();
    expect(apiRequestFromGrid([['Method', 'GET'], ['URL', '']])).toBeNull();
    expect(apiRequestFromGrid([['Pros', 'Cons'], ['Fast', 'Costly']])).toBeNull();
    expect(apiRequestFromGrid([['Method', 'GET', 'x'], ['URL', '/a', 'y']])).toBeNull();
    expect(apiRequestFromGrid([])).toBeNull();
  });
});

describe('apiFullUrl', () => {
  it('appends query rows with ? or &, keeping variables raw', () => {
    expect(apiFullUrl({ url: '{{base}}/orders', query: [['page', '2'], ['flag', '']] })).toBe('{{base}}/orders?page=2&flag');
    expect(apiFullUrl({ url: '/orders?x=1', query: [['page', '2']] })).toBe('/orders?x=1&page=2');
    expect(apiFullUrl({ url: '/orders', query: [] })).toBe('/orders');
  });
});

describe('prettyJson', () => {
  it('pretty-prints valid JSON and leaves anything else alone', () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson('not json')).toBe('not json');
    expect(prettyJson('{broken')).toBe('{broken');
  });
});

describe('apiRequestToCurl', () => {
  it('builds a pasteable command with method, headers and body', () => {
    const curl = apiRequestToCurl(apiRequestFromGrid(sample)!);
    expect(curl).toBe([
      'curl',
      '-X POST',
      "'https://api.example.com/v1/orders?dryRun=true'",
      "-H 'Content-Type: application/json'",
      "-H 'Authorization: Bearer {{token}}'",
      "--data-raw '{\"orderId\":\"4711\"}'"
    ].join(' \\\n  '));
  });
  it('leaves out -X for a plain GET and escapes single quotes', () => {
    const curl = apiRequestToCurl(apiRequestFromGrid([['Method', 'GET'], ['URL', "/search?q=it's"]])!);
    expect(curl).toBe("curl \\\n  '/search?q=it'\\''s'");
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
});

describe('apiRequestToGrid', () => {
  it('round-trips a request through the table rows', () => {
    const r = apiRequestFromGrid(sample)!;
    expect(apiRequestFromGrid(apiRequestToGrid(r))).toEqual(r);
  });
  it('leaves out empty parts and blank query/header names', () => {
    const r = apiRequestFromGrid([['Method', 'GET'], ['URL', '/x']])!;
    r.query.push(['', 'orphan']); r.headers.push(['Accept', 'application/json']);
    expect(apiRequestToGrid(r)).toEqual([['Field', 'Value'], ['Method', 'GET'], ['URL', '/x'], ['Header', 'Accept: application/json']]);
  });
});

describe('isValidJson', () => {
  it('tells JSON from other text', () => {
    expect(isValidJson('{"a":[1,2]}')).toBe(true);
    expect(isValidJson('{a:1}')).toBe(false);
  });
});
