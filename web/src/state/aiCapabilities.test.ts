import { describe, it, expect, vi } from 'vitest';
import { callAiApi, callAiApiBatchChunk, callAiApiBatch, buildBatchUserContent, parseBatchResponse } from './aiCapabilities';
import * as aiCall from './aiCall';

function ctx(overrides: Partial<Parameters<typeof callAiApi>[2]> = {}) {
  return { providerId: 'gemini', model: 'gemini-3.5-flash', apiKey: 'sk-test', ...overrides };
}

describe('callAiApi', () => {
  it('calls callAiByShape with the resolved provider shape/baseUrl, maxTokens=1024', async () => {
    const spy = vi.spyOn(aiCall, 'callAiByShape').mockResolvedValue('rewritten text');
    const result = await callAiApi('original text', 'a system prompt', ctx());
    expect(result).toBe('rewritten text');
    const call = spy.mock.calls[0][0];
    expect(call.shape).toBe('gemini');
    expect(call.systemPrompt).toBe('a system prompt');
    expect(call.userContent).toBe('original text');
    expect(call.maxTokens).toBe(1024);
    expect(call.apiKey).toBe('sk-test');
    spy.mockRestore();
  });

  it('resolves extraHeaders per provider (e.g. GitHub Models)', async () => {
    const spy = vi.spyOn(aiCall, 'callAiByShape').mockResolvedValue('x');
    await callAiApi('t', 'p', ctx({ providerId: 'seed_github_models', model: 'openai/gpt-4o-mini' }));
    expect(spy.mock.calls[0][0].extraHeaders).toEqual({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
    spy.mockRestore();
  });
});

describe('buildBatchUserContent / parseBatchResponse (pure)', () => {
  it('builds one sentinel-marked block per item', () => {
    expect(buildBatchUserContent(['a', 'b'])).toBe('<<<SAKURA-ITEM-1>>>\na\n<<<SAKURA-ITEM-2>>>\nb');
  });

  it('parses a well-formed batch response back into the original order', () => {
    const raw = '<<<SAKURA-ITEM-1>>>\ncorrected a\n<<<SAKURA-ITEM-2>>>\ncorrected b';
    expect(parseBatchResponse(raw, ['a', 'b'])).toEqual(['corrected a', 'corrected b']);
  });

  it('falls back to the original text for an item whose marker is missing', () => {
    const raw = '<<<SAKURA-ITEM-1>>>\ncorrected a';
    expect(parseBatchResponse(raw, ['a', 'b'])).toEqual(['corrected a', 'b']);
  });

  it('falls back to every original when the response has no markers at all', () => {
    expect(parseBatchResponse('the model ignored the format', ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('trims whitespace around each parsed item', () => {
    const raw = '<<<SAKURA-ITEM-1>>>\n  corrected a  \n<<<SAKURA-ITEM-2>>>\n  corrected b  ';
    expect(parseBatchResponse(raw, ['a', 'b'])).toEqual(['corrected a', 'corrected b']);
  });

  it('handles items out of numeric order in the response', () => {
    const raw = '<<<SAKURA-ITEM-2>>>\ncorrected b\n<<<SAKURA-ITEM-1>>>\ncorrected a';
    expect(parseBatchResponse(raw, ['a', 'b'])).toEqual(['corrected a', 'corrected b']);
  });
});

describe('callAiApiBatchChunk', () => {
  it('sends one call for the whole chunk and parses the response back per item', async () => {
    const spy = vi.spyOn(aiCall, 'callAiByShape').mockResolvedValue('<<<SAKURA-ITEM-1>>>\nA\n<<<SAKURA-ITEM-2>>>\nB');
    const result = await callAiApiBatchChunk(['a', 'b'], 'sys', ctx());
    expect(result).toEqual(['A', 'B']);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].userContent).toBe('<<<SAKURA-ITEM-1>>>\na\n<<<SAKURA-ITEM-2>>>\nb');
    spy.mockRestore();
  });
});

describe('callAiApiBatch', () => {
  it('makes one call for a batch under the chunk size', async () => {
    const spy = vi.spyOn(aiCall, 'callAiByShape').mockResolvedValue('<<<SAKURA-ITEM-1>>>\nA');
    const result = await callAiApiBatch(['a'], 'sys', ctx());
    expect(result).toEqual(['A']);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('splits into multiple sequential calls when texts exceed the chunk size (30)', async () => {
    const texts = Array.from({ length: 35 }, (_, i) => `item-${i}`);
    const spy = vi.spyOn(aiCall, 'callAiByShape').mockImplementation(async ({ userContent }) => {
      const count = (userContent.match(/<<<SAKURA-ITEM-/g) || []).length;
      return Array.from({ length: count }, (_, i) => `<<<SAKURA-ITEM-${i + 1}>>>\nresult-${i}`).join('\n');
    });
    const result = await callAiApiBatch(texts, 'sys', ctx());
    expect(spy).toHaveBeenCalledTimes(2); // 30 + 5
    expect(result).toHaveLength(35);
    spy.mockRestore();
  });

  it('reports progress after each chunk completes', async () => {
    const texts = Array.from({ length: 35 }, (_, i) => `item-${i}`);
    vi.spyOn(aiCall, 'callAiByShape').mockImplementation(async ({ userContent }) => {
      const count = (userContent.match(/<<<SAKURA-ITEM-/g) || []).length;
      return Array.from({ length: count }, (_, i) => `<<<SAKURA-ITEM-${i + 1}>>>\nr`).join('\n');
    });
    const progress: [number, number][] = [];
    await callAiApiBatch(texts, 'sys', ctx(), (done, total) => progress.push([done, total]));
    expect(progress).toEqual([
      [30, 35],
      [35, 35]
    ]);
    vi.restoreAllMocks();
  });
});
