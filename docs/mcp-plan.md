# Read-only MCP server

**Status (2026-11-25): built (owner: 3–4 target users consulted, the gate below is met).** As built: OAuth 2.1 through `@cloudflare/workers-oauth-provider` 1.2.4 in the existing Worker (one Worker as authorization server and resource; `/register`, `/token`, `/authorize`, discovery documents), the MCP endpoint at `POST /mcp` (plain JSON answers, no sessions; `worker/src/mcpServer.ts`), tools in `worker/src/mcpNotes.ts`, Firestore REST in `worker/src/firestoreRest.ts`, consent in `worker/src/connect.ts` plus `web/public/connect.html`, Settings → Account → AI assistants in index.html. Changes from the design below: the refresh token is kept in the grant's props, which the library encrypts with a key only the assistant's token unwraps (stronger than the vault KEK, and nothing to manage); the library's store is a second binding (`OAUTH_KV`) to the same KV namespace; the rate limit is per isolate (60 calls a minute per person) rather than in KV, to stay inside the free plan's 1k KV writes a day. The rest of this file is the original discussion.

**Status (2026-11-22): parked idea, not approved for building.** Owner asked whether Sakura should
have an MCP server so people can use their notes from an AI assistant (Claude, ChatGPT, Cursor and
other MCP clients). This file records the discussion and the design so a later session doesn't
start from scratch. Build only after the validation step below says yes.

## Why

People increasingly work through an AI assistant, and an outliner that the assistant can't see
risks feeling dated. The value an MCP server adds over what exists today is reading **across** a
person's notes ("what did I decide about the auth design last month?"), not one document at a time.
A single document already reaches any assistant through Share → Export as Markdown
(`docs/markdown-plan.md`, built 2026-11-19).

## Gate before building

Positioning (handoff, 2026-11-17) says: test the pitch with 3–5 target users before building in
a new direction. Add one question to that round: "Would you want Claude/ChatGPT to read your Sakura
notes directly?" Build if at least 2 say yes with a concrete use, not just "sounds nice".
Wanting it because "a new-generation app shouldn't miss AI" is not by itself a reason.

## Scope

- **Read-only.** No writes, so it can't clash with sync (the riskiest area; see
  `docs/data-safety-audit.md`). Writes would be a separate decision.
- **Opt-in per person**, off by default, with a visible list of connected assistants and a
  Disconnect in Settings that revokes access at once.
- Tools (first cut): `list_documents` (titles, folders, updated dates), `get_document`
  (one document as Markdown, reusing the Markdown export code), `search` (text across the
  person's documents).
- Signed-in people only. Guests (no account) have no cloud copy to read.

## Cost: free

Fits the free plans Sakura already uses (numbers as known 2026-11-22; recheck before building):

- **Cloudflare Workers** (free plan, ~100k requests/day). Sakura already runs one Worker
  (`worker/`, `ai.sakura-notes.com`); the MCP server is either new routes there or a second
  Worker. Cloudflare publishes a free OAuth provider library for MCP servers on Workers.
- **Workers KV** for the sign-in grants. Free plan allows ~1k writes/day: fine at launch scale,
  the first limit to be hit as usage grows.
- **Firebase Auth / Firestore reads**: within the current plan's free allowance.

## Security: same access model as today

The core rule: **the server never uses Firebase admin credentials.** It reads Firestore through the
REST API with **the person's own Firebase sign-in token**, so the existing owner-only rules
(`firebase/firestore.rules`, `match /users/{userId}/docs/{docId}`) decide what it can read,
exactly as in the browser. A bug in the server can't expose another person's documents, because
the token it holds can't read them.

- Sign-in: OAuth 2.1 (what the MCP spec requires for remote servers). The person signs in with
  Firebase on a Sakura page; the Worker verifies the ID token (reuse `worker/src/auth.ts`,
  `verifyFirebaseIdToken`) and issues the assistant its own MCP access token.
- The Worker keeps the person's Firebase refresh token **encrypted** (reuse the existing
  encryption in `worker/src/vault.ts`), to get fresh ID tokens. This is the one new place a secret
  lives; Disconnect deletes it.
- Short-lived MCP tokens; rate limit per person; no logging of note content.
- Security review before merge (same standard as the 2026-11-03 review in the handoff).

**What can't be removed:** once a person connects an assistant, the notes it reads go to that AI
provider (Anthropic, OpenAI, …) under that provider's terms. That's the person's choice, but
`web/public/privacy.html` must say so plainly, with a new "Effective" date, in the same PR.

## Effort

Rough estimate: a few days of work plus a careful security review. Merging anything under
`worker/` redeploys the live Worker, so the owner merges it on purpose.

## Alternative considered

A local MCP server that reads exported files on the person's own computer: no server or sign-in
work, but needs a manual export and a technical person to set it up. Useful only as a private
prototype to feel out the workflow, not as a feature.
