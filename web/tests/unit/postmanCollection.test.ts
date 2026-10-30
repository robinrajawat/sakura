import { describe, it, expect } from 'vitest';
import { apiRequestToPostmanItem, apiRequestToPostmanCollection, POSTMAN_SCHEMA } from '../../src/utils/postmanCollection';
import { apiRequestFromGrid } from '../../src/utils/apiRequest';

const req = apiRequestFromGrid([
  ['Field', 'Value'],
  ['Method', 'POST'],
  ['URL', '{{baseUrl}}/orders'],
  ['Query', 'dryRun=true'],
  ['Header', 'Content-Type: application/json'],
  ['Body', '{"id":"4711"}'],
  ['Status', '201 Created'],
  ['Response', '{"status":"accepted"}'],
  ['Description', 'Creates an order']
])!;

describe('apiRequestToPostmanItem', () => {
  it('writes method, URL with query, headers, JSON body, description and the example', () => {
    const item = apiRequestToPostmanItem('Create order', req) as any;
    expect(item.name).toBe('Create order');
    expect(item.request.method).toBe('POST');
    expect(item.request.url).toEqual({ raw: '{{baseUrl}}/orders?dryRun=true', query: [{ key: 'dryRun', value: 'true' }] });
    expect(item.request.header).toEqual([{ key: 'Content-Type', value: 'application/json' }]);
    expect(item.request.body).toEqual({ mode: 'raw', raw: '{"id":"4711"}', options: { raw: { language: 'json' } } });
    expect(item.request.description).toBe('Creates an order');
    expect(item.response[0]).toMatchObject({ code: 201, status: 'Created', body: '{"status":"accepted"}' });
  });
  it('leaves out what the request does not have', () => {
    const item = apiRequestToPostmanItem('', apiRequestFromGrid([['Method', 'GET'], ['URL', '/health']])!) as any;
    expect(item.name).toBe('GET /health');
    expect(item.request.url).toEqual({ raw: '/health' });
    expect(item.request.body).toBeUndefined();
    expect(item.response).toBeUndefined();
  });
  it('keeps a status that is not a code as text', () => {
    const item = apiRequestToPostmanItem('X', apiRequestFromGrid([['Method', 'GET'], ['URL', '/x'], ['Status', 'Accepted']])!) as any;
    expect(item.response[0]).toMatchObject({ status: 'Accepted' });
    expect(item.response[0].code).toBeUndefined();
  });
});

describe('apiRequestToPostmanCollection', () => {
  it('wraps one request in a v2.1 collection named after the row', () => {
    const c = apiRequestToPostmanCollection('Create order', req) as any;
    expect(c.info).toEqual({ name: 'Create order', schema: POSTMAN_SCHEMA });
    expect(c.item).toHaveLength(1);
    expect(c.item[0].name).toBe('Create order');
  });
});
