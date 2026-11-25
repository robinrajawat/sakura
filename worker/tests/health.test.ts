import { describe, it, expect } from 'vitest';
import { router as worker, type Env } from '../src/index';

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

describe('icon for this address', () => {
  it('favicon requests go to the app-icon tile, and the home page links it', async () => {
    const res = await worker.fetch(new Request('https://example.com/favicon.ico'), fakeEnv);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://www.sakura-notes.com/icon-512-pwa.png');
    const home = await worker.fetch(new Request('https://example.com/'), fakeEnv);
    expect(await home.text()).toContain('rel="icon"');
  });
});
