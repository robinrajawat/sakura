import { describe, it, expect } from 'vitest';
import {
  apiFieldKey, splitPair, apiRequestFromGrid, apiFullUrl, prettyJson, shellQuote, apiRequestToCurl, apiRequestToGrid, isValidJson, shellWords, maskSecretHeader, curlToApiRequest, prettyXml, formatPayload, splitApiVariables, urlWrapPieces,
  apiParameters, apiDetectedAuth, splitApiUrl, apiStatusClass, emptyApiRequest
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
    expect(r.responses).toEqual([{ status: '201 Created', body: '{"id":"4711","status":"accepted"}' }]);
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

describe('shellWords', () => {
  it('handles quotes, escapes and line continuations', () => {
    expect(shellWords(`curl 'a b' "c \\"d\\"" e\\ f \\\n --x`)).toEqual(['curl', 'a b', 'c "d"', 'e f', '--x']);
    expect(shellWords('curl ^\n "x"')).toEqual(['curl', 'x']);
  });
});

describe('maskSecretHeader', () => {
  it('replaces literal secrets, keeps variables and ordinary headers', () => {
    expect(maskSecretHeader('Authorization', 'Bearer eyJ.real')).toBe('Bearer {{token}}');
    expect(maskSecretHeader('Authorization', 'Basic dXNlcjpwdw==')).toBe('Basic {{username}}:{{password}}');
    expect(maskSecretHeader('X-API-Key', 'abc123')).toBe('{{apiKey}}');
    expect(maskSecretHeader('Authorization', 'Bearer {{token}}')).toBe('Bearer {{token}}');
    expect(maskSecretHeader('Content-Type', 'application/json')).toBe('application/json');
  });
});

describe('curlToApiRequest', () => {
  it("reads Postman's Code › cURL snippet", () => {
    const r = curlToApiRequest(`curl --location 'https://erp.example.com/sap/opu/odata/ZSD_SHIPPING_SRV/PostalCodes?$format=json&country=DK' \\
--header 'Content-Type: application/json' \\
--header 'Authorization: Bearer eyJhbGciOi.secret' \\
--data '{
    "PostalCode": "2300"
}'`)!;
    expect(r.method).toBe('POST');
    expect(r.url).toBe('https://erp.example.com/sap/opu/odata/ZSD_SHIPPING_SRV/PostalCodes');
    expect(r.query).toEqual([['$format', 'json'], ['country', 'DK']]);
    expect(r.headers).toEqual([['Content-Type', 'application/json'], ['Authorization', 'Bearer {{token}}']]);
    expect(r.body).toBe('{\n    "PostalCode": "2300"\n}');
  });
  it('reads -X, -H, -d short forms, -u and a plain GET', () => {
    expect(curlToApiRequest("curl -X PATCH https://a/b -H 'Accept: */*' -d x=1")).toMatchObject({ method: 'PATCH', url: 'https://a/b', headers: [['Accept', '*/*']], body: 'x=1' });
    expect(curlToApiRequest('curl -u robin:hunter2 https://a/b')!.headers).toEqual([['Authorization', 'Basic {{username}}:{{password}}']]);
    expect(curlToApiRequest('curl https://a/health')).toMatchObject({ method: 'GET', body: '' });
  });
  it("reads a browser's Windows cmd copy", () => {
    const r = curlToApiRequest('curl "https://a/b" ^\n  -H "Accept: application/json" ^\n  --data-raw "{\\"a\\":1}"')!;
    expect(r).toMatchObject({ method: 'POST', url: 'https://a/b', body: '{"a":1}' });
  });
  it("round-trips Sakura's own cURL button", () => {
    const r = apiRequestFromGrid(sample)!;
    const back = curlToApiRequest(apiRequestToCurl(r))!;
    expect(back.method).toBe(r.method);
    expect(back.url).toBe(r.url);
    expect(back.query).toEqual(r.query);
    expect(back.body).toBe(r.body);
    expect(back.headers[0]).toEqual(['Content-Type', 'application/json']);
  });
  it('is null for text that is not a cURL command', () => {
    expect(curlToApiRequest('GET https://a/b')).toBeNull();
    expect(curlToApiRequest('curl --silent')).toBeNull();
  });
});

describe('prettyXml', () => {
  it('indents nested elements and keeps text-only elements on one line', () => {
    expect(prettyXml('<?xml version="1.0"?><entry><id>4711</id><content type="xml"><m:properties><d:Country>DK</d:Country><d:Empty/></m:properties></content></entry>')).toBe([
      '<?xml version="1.0"?>',
      '<entry>',
      '  <id>4711</id>',
      '  <content type="xml">',
      '    <m:properties>',
      '      <d:Country>DK</d:Country>',
      '      <d:Empty/>',
      '    </m:properties>',
      '  </content>',
      '</entry>'
    ].join('\n'));
  });
  it('re-indents already formatted XML and keeps comments and CDATA', () => {
    expect(prettyXml('<a>\n      <!-- note -->\n   <b><![CDATA[x < y]]></b>\n</a>')).toBe('<a>\n  <!-- note -->\n  <b>\n    <![CDATA[x < y]]>\n  </b>\n</a>');
  });
  it('is null for text that is not well-formed XML', () => {
    expect(prettyXml('<a><b></a>')).toBeNull();
    expect(prettyXml('<a>')).toBeNull();
    expect(prettyXml('plain')).toBeNull();
  });
});

describe('formatPayload', () => {
  it('formats JSON, then XML, and leaves other text alone', () => {
    expect(formatPayload('{"a":1}')).toEqual({ text: '{\n  "a": 1\n}', ok: true, kind: 'json' });
    expect(formatPayload('<a><b>1</b></a>')).toEqual({ text: '<a>\n  <b>1</b>\n</a>', ok: true, kind: 'xml' });
    expect(formatPayload('name=value')).toEqual({ text: 'name=value', ok: true, kind: 'text' });
  });
  it('flags invalid JSON or XML and keeps it as typed', () => {
    expect(formatPayload('{broken')).toMatchObject({ text: '{broken', ok: false, kind: 'json' });
    expect(formatPayload('<a><b></a>')).toMatchObject({ text: '<a><b></a>', ok: false, kind: 'xml' });
  });
});

describe('splitApiVariables', () => {
  it('separates {{variables}} from plain text', () => {
    expect(splitApiVariables('{{baseUrl}}/orders?key={{apiKey}}')).toEqual([['{{baseUrl}}', true], ['/orders?key=', false], ['{{apiKey}}', true]]);
    expect(splitApiVariables('Basic {{username}}:{{password}}')).toEqual([['Basic ', false], ['{{username}}', true], [':', false], ['{{password}}', true]]);
    expect(splitApiVariables('plain')).toEqual([['plain', false]]);
    expect(splitApiVariables('')).toEqual([]);
  });
});

describe('urlWrapPieces', () => {
  it('breaks after / ? & = but not inside the scheme', () => {
    expect(urlWrapPieces('https://a.b/sap/API_X/Set?x=1&y=2')).toEqual(['https://a.b/', 'sap/', 'API_X/', 'Set?', 'x=', '1&', 'y=', '2']);
    expect(urlWrapPieces('https://a.b/sap/opu').join('')).toBe('https://a.b/sap/opu');
  });
});

describe('responses', () => {
  const base = [['Method', 'GET'], ['URL', '/orders/{{id}}']];
  it('reads each Status + Response pair as its own response, in order', () => {
    const r = apiRequestFromGrid([...base, ['Status', '200 OK'], ['Response', '{"id":1}'], ['Status', '404 Not Found'], ['Response', '{"error":"no such order"}'], ['Status', '401 Unauthorized']])!;
    expect(r.responses).toEqual([
      { status: '200 OK', body: '{"id":1}' },
      { status: '404 Not Found', body: '{"error":"no such order"}' },
      { status: '401 Unauthorized', body: '' }
    ]);
  });
  it('keeps old tables reading as before: Response then Status is one response, extra Response rows join', () => {
    expect(apiRequestFromGrid([...base, ['Response', 'a'], ['Status', '200 OK']])!.responses).toEqual([{ status: '200 OK', body: 'a' }]);
    expect(apiRequestFromGrid([...base, ['Status', '200 OK'], ['Response', 'a'], ['Response', 'b']])!.responses).toEqual([{ status: '200 OK', body: 'a\nb' }]);
    expect(apiRequestFromGrid([...base, ['Response', 'only a body']])!.responses).toEqual([{ status: '', body: 'only a body' }]);
  });
  it('writes every response back to the grid and reads it again unchanged', () => {
    const r = apiRequestFromGrid([...base, ['Status', '200 OK'], ['Response', 'x'], ['Status', '404 Not Found'], ['Response', 'y']])!;
    expect(apiRequestFromGrid(apiRequestToGrid(r))).toEqual(r);
  });
  it('colours 2xx as ok and 4xx/5xx as errors', () => {
    expect(apiStatusClass('201 Created')).toBe('ok');
    expect(apiStatusClass('404 Not Found')).toBe('err');
    expect(apiStatusClass('503')).toBe('err');
    expect(apiStatusClass('302 Found')).toBe('');
  });
});

describe('auth', () => {
  it('reads an Auth row as written and writes it back', () => {
    const r = apiRequestFromGrid([['Method', 'GET'], ['URL', '/x'], ['Authentication', 'OAuth 2.0, scope orders.read']])!;
    expect(r.auth).toBe('OAuth 2.0, scope orders.read');
    expect(apiRequestToGrid(r)).toContainEqual(['Auth', 'OAuth 2.0, scope orders.read']);
  });
  it('detects it from the headers or the query when there is no Auth row', () => {
    const d = (headers: [string, string][], url = '/x', query: [string, string][] = []) => apiDetectedAuth({ headers, url, query });
    expect(d([['Authorization', 'Bearer {{token}}']])).toBe('Bearer token');
    expect(d([['authorization', 'Basic {{username}}:{{password}}']])).toBe('Basic (username and password)');
    expect(d([['Authorization', 'Digest x']])).toBe('Digest (Authorization header)');
    expect(d([['X-API-Key', '{{apiKey}}']])).toBe('API key (X-API-Key header)');
    expect(d([['Cookie', '{{cookie}}']])).toBe('Session cookie');
    expect(d([], '/x?api_key={{apiKey}}')).toBe('API key (api_key query parameter)');
    expect(d([], '/x', [['access_token', '{{t}}']])).toBe('Token (access_token query parameter)');
    expect(d([['Accept', 'application/json']])).toBe('');
  });
});

describe('splitApiUrl', () => {
  it('separates the base (host or a leading {{variable}}), the path and the query', () => {
    expect(splitApiUrl('https://h.example.com:8443/v1/a?x=1#frag')).toEqual({ base: 'https://h.example.com:8443', path: '/v1/a', query: 'x=1' });
    expect(splitApiUrl('{{baseUrl}}/orders/{{id}}')).toEqual({ base: '{{baseUrl}}', path: '/orders/{{id}}', query: '' });
    expect(splitApiUrl('/health')).toEqual({ base: '', path: '/health', query: '' });
  });
});

describe('apiParameters', () => {
  const p = (url: string, query: [string, string][] = [], paramNotes: [string, string][] = []) => apiParameters({ url, query, paramNotes });
  it('finds path variables in all three styles, but not the base URL', () => {
    expect(p('{{baseUrl}}/orders/{{orderId}}/items/:itemId/{lineNo}').map(x => [x.name, x.in])).toEqual([
      ['orderId', 'path'], ['itemId', 'path'], ['lineNo', 'path']
    ]);
    expect(p('https://localhost:8080/health')).toEqual([]);
  });
  it('finds the query typed into the URL and the Query rows, once each', () => {
    expect(p("/sap/API_SO/A_SalesOrder?sap-client={{client}}&$filter=Status eq 'A'&$top", [['$top', '10'], ['page', '2']])).toEqual([
      { name: 'sap-client', in: 'query', value: '{{client}}', note: '' },
      { name: '$filter', in: 'query', value: "Status eq 'A'", note: '' },
      { name: '$top', in: 'query', value: '', note: '' },
      { name: 'page', in: 'query', value: '2', note: '' }
    ]);
  });
  it('attaches Parameter descriptions by name (any case) and keeps unmatched ones at the end', () => {
    const out = p('/orders/{{orderId}}?status=open', [], [['orderId', 'The order number'], ['STATUS', 'open or closed'], ['priority', 'Body field: standard or express']]);
    expect(out).toEqual([
      { name: 'orderId', in: 'path', value: '', note: 'The order number' },
      { name: 'status', in: 'query', value: 'open', note: 'open or closed' },
      { name: 'priority', in: '', value: '', note: 'Body field: standard or express' }
    ]);
  });
  it('reads "Parameter | name: meaning" as a description, and "Param | name=value" as a query value as before', () => {
    const r = apiRequestFromGrid([['Method', 'GET'], ['URL', '/x/{{id}}'], ['Param', 'page=2'], ['Parameter', 'id: The order number, required'], ['Parameter', 'filter=a:b']])!;
    expect(r.query).toEqual([['page', '2'], ['filter', 'a:b']]);
    expect(r.paramNotes).toEqual([['id', 'The order number, required']]);
    expect(apiRequestFromGrid(apiRequestToGrid(r))).toEqual(r);
  });
});

describe('emptyApiRequest', () => {
  it('is a GET with nothing filled in', () => {
    expect(emptyApiRequest()).toMatchObject({ method: 'GET', url: '', responses: [], auth: '', paramNotes: [] });
  });
});
