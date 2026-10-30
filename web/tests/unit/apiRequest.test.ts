import { describe, it, expect } from 'vitest';
import {
  apiFieldKey, splitPair, apiRequestFromGrid, apiFullUrl, prettyJson, shellQuote, apiRequestToCurl, apiRequestToGrid, isValidJson, shellWords, maskSecretHeader, curlToApiRequest, prettyXml, formatPayload
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
