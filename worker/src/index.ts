// Placeholder entry point — proves the build/typecheck/lint/test pipeline works end to end
// before any real logic lands. See docs/ai-hosted-vault-design.md for what this Worker will
// actually do: POST /vault/key and POST /ai/complete, neither implemented yet.

export interface Env {
  SAKURA_VAULT_KV: KVNamespace;
  FIREBASE_PROJECT_ID: string;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response('ok', { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }
};
