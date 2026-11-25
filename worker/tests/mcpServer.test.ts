import { describe, it, expect } from 'vitest';
import { handleMcpRequest, allowCall } from '../src/mcpServer';
import { SignInExpiredError, type FirestoreReader } from '../src/firestoreRest';

const db: FirestoreReader = { async get() { return null; }, async list() { return []; } };
const post = (body: unknown, raw = false) => new Request('https://x/mcp', { method: 'POST', body: raw ? String(body) : JSON.stringify(body) });

describe('mcpServer', () => {
  it('answers only POST', async () => {
    const res = await handleMcpRequest(new Request('https://x/mcp'), 'u', db);
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('POST');
  });
  it('bad JSON, unknown methods and unknown tools are JSON-RPC errors', async () => {
    expect(((await (await handleMcpRequest(post('{', true), 'u', db)).json()) as { error: { code: number } }).error.code).toBe(-32700);
    expect(((await (await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'resources/list' }), 'u', db)).json()) as { error: { code: number } }).error.code).toBe(-32601);
    expect(((await (await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_doc' } }), 'u', db)).json()) as { error: { code: number } }).error.code).toBe(-32602);
  });
  it('an unknown protocol version gets one the server speaks', async () => {
    const r = (await (await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } }), 'u', db)).json()) as { result: { protocolVersion: string } };
    expect(r.result.protocolVersion).toBe('2025-06-18');
  });
  it('batches answer each request and skip notifications', async () => {
    const r = (await (await handleMcpRequest(post([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }]), 'u', db)).json()) as unknown[];
    expect(r).toHaveLength(1);
  });
  it('an ended sign-in says how to reconnect; other failures never echo content', async () => {
    const expired: FirestoreReader = { async get() { throw new SignInExpiredError(); }, async list() { throw new SignInExpiredError(); } };
    const r = (await (await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_documents', arguments: {} } }), 'u2', expired)).json()) as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/connect again/);
    const broken: FirestoreReader = { async get() { throw new Error('secret row text'); }, async list() { return []; } };
    const b = (await (await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_documents', arguments: {} } }), 'u3', broken)).json()) as { result: { content: Array<{ text: string }> } };
    expect(b.result.content[0].text).not.toContain('secret');
  });
  it('limits calls per person per minute', () => {
    for (let i = 0; i < 60; i++) expect(allowCall('rate', 1000)).toBe(true);
    expect(allowCall('rate', 1000)).toBe(false);
    expect(allowCall('rate', 62_000)).toBe(true);
  });
});

describe('server icon', () => {
  it('initialize names the app-icon tile', async () => {
    const r = (await (await handleMcpRequest(post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }), 'u', db)).json()) as { result: { serverInfo: { icons: Array<{ src: string }> } } };
    expect(r.result.serverInfo.icons[0].src).toBe('https://www.sakura-notes.com/icon-512-pwa.png');
  });
});
