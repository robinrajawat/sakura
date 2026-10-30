import { describe, it, expect } from 'vitest';
import { postmanUrl, postmanItemToGrid, postmanToOutline, outlineToPostman, apiRequestToPostmanItem } from '../../src/utils/postmanCollection';
import { apiRequestFromGrid } from '../../src/utils/apiRequest';

const collection = {
  info: { name: 'Orders API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'Orders',
      item: [
        {
          name: 'Create order',
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }, { key: 'X-Debug', value: '1', disabled: true }],
            url: { raw: '{{baseUrl}}/orders?dryRun=true', host: ['{{baseUrl}}'], path: ['orders'], query: [{ key: 'dryRun', value: 'true' }, { key: 'trace', value: 'x', disabled: true }] },
            body: { mode: 'raw', raw: '{"id":"4711"}' },
            description: 'Creates an order'
          },
          response: [{ name: 'Created', code: 201, status: 'Created', body: '{"status":"accepted"}' }]
        }
      ]
    },
    { name: 'Health', request: { method: 'GET', url: 'https://api.example.com/health' } }
  ]
};

describe('postmanUrl', () => {
  it('reads a plain string url', () => {
    expect(postmanUrl('https://a.b/c?x=1')).toEqual({ url: 'https://a.b/c?x=1', query: [] });
  });
  it('drops the raw query when there are query rows, and leaves out disabled ones', () => {
    expect(postmanUrl(collection.item[0].item![0].request!.url)).toEqual({ url: '{{baseUrl}}/orders', query: [['dryRun', 'true']] });
  });
  it('builds the address from parts when there is no raw', () => {
    expect(postmanUrl({ protocol: 'https', host: ['api', 'example', 'com'], path: ['v1', 'x'] }).url).toBe('https://api.example.com/v1/x');
  });
});

describe('postmanItemToGrid', () => {
  it('maps a request and its first example to Field | Value rows', () => {
    const grid = postmanItemToGrid(collection.item[0].item![0] as any);
    expect(grid).toEqual([
      ['Field', 'Value'], ['Method', 'POST'], ['URL', '{{baseUrl}}/orders'], ['Query', 'dryRun=true'],
      ['Header', 'Content-Type: application/json'], ['Body', '{"id":"4711"}'],
      ['Status', '201 Created'], ['Response', '{"status":"accepted"}'], ['Description', 'Creates an order']
    ]);
    expect(apiRequestFromGrid(grid)?.method).toBe('POST');
  });
  it('turns form bodies into name=value text', () => {
    const grid = postmanItemToGrid({ request: { method: 'post', url: '/login', body: { mode: 'urlencoded', urlencoded: [{ key: 'user', value: 'a' }, { key: 'pw', value: 'b' }] } } });
    expect(grid).toContainEqual(['Body', 'user=a&pw=b']);
  });
});

describe('postmanToOutline', () => {
  it('turns folders into parent rows and requests into rows with a table', () => {
    const r = postmanToOutline(collection);
    expect(r.title).toBe('Orders API');
    expect(r.requestCount).toBe(2);
    expect(r.rows.map(x => [x.depth, x.text, !!x.grid])).toEqual([[0, 'Orders', false], [1, 'Create order', true], [0, 'Health', true]]);
  });
  it('rejects files that are not collections, or have no requests', () => {
    expect(() => postmanToOutline({ foo: 1 })).toThrow(/isn.t a Postman collection/);
    expect(() => postmanToOutline({ info: {}, item: [{ name: 'Empty', item: [] }] })).toThrow(/no requests/);
  });
});

describe('outlineToPostman', () => {
  it('round-trips an imported collection: folders, requests, query, body and example', () => {
    const imported = postmanToOutline(collection);
    const { collection: out, requestCount } = outlineToPostman('Orders API', imported.rows);
    expect(requestCount).toBe(2);
    const back = postmanToOutline(out);
    expect(back.rows).toEqual(imported.rows);
    expect((out.info as any).schema).toContain('v2.1.0');
  });
  it('leaves out rows without requests and folders that hold none', () => {
    const { collection: out } = outlineToPostman('Spec', [
      { depth: 0, text: 'Intro', grid: null },
      { depth: 1, text: 'Background', grid: null },
      { depth: 0, text: 'APIs', grid: null },
      { depth: 1, text: 'Ping', grid: [['Method', 'GET'], ['URL', '/ping']] }
    ]);
    expect((out.item as any[]).map(i => i.name)).toEqual(['APIs']);
    expect((out.item as any[])[0].item[0].name).toBe('Ping');
  });
  it('writes the example status as code and text', () => {
    const item = apiRequestToPostmanItem('X', apiRequestFromGrid([['Method', 'GET'], ['URL', '/x'], ['Status', '404 Not Found']])!);
    expect((item.response as any[])[0]).toMatchObject({ code: 404, status: 'Not Found' });
  });
});
