import { describe, it, expect } from 'vitest';
import worker, { type Env } from '../src/index';

const fakeEnv = {} as Env;

describe('worker scaffold', () => {
  it('responds ok on /health', async () => {
    const res = await worker.fetch(new Request('https://example.com/health'), fakeEnv);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });

  it('404s on an unknown path', async () => {
    const res = await worker.fetch(new Request('https://example.com/nope'), fakeEnv);
    expect(res.status).toBe(404);
  });
});
