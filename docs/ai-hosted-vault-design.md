# Hosted AI (Cloudflare Worker) — design proposal

**Status: built and unit-tested (`worker/`), infra provisioned, deploy automation in place. Admin
UI shipped in `legacy/`.** Every Worker piece described below exists as real, tested code —
encryption (`vault.ts`), quota (`quota.ts`), Firebase auth + the admin check (`auth.ts`),
encrypted provider storage (`providers.ts`), the per-provider request/response adapters
(`providerShapes.ts`), and the two endpoints themselves (`index.ts`). `legacy/index.html` also
has a Settings → Account → Admin panel for managing the provider chain against those endpoints
(see "Admin UI" below). The Cloudflare side is provisioned — the `sakura-vault-kv` KV namespace
and the `sakura-vault` Worker exist, both Worker secrets are set — and
`.github/workflows/deploy-worker.yml` now deploys `worker/` on every push to `main` that touches
it, so the real first deploy happens the moment this lands. `AI_VAULT_WORKER_URL` in
`legacy/index.html` still needs to be pointed at the real deployed URL once that's confirmed
live. What's still missing: the *user-facing* `legacy/` client-side wiring (the `/ai/complete`
call and removing the old BYOK Settings surface), which is deliberately a separate, later pass.
See "Open decisions" below for what still needs an answer before that client wiring happens.

## Origin, and a real scope change since the first draft

This started as the "AI key vault (Cloudflare Worker)" appendix in
`docs/history/web-migration/phase6-full-parity-plan.md` — written while the `web/` React rewrite
was still active, filed there only because that was the live planning doc at the time. `web/` is
now discontinued; this proposal was never about `web/` specifically, and targets `legacy/` — the
only live app — instead.

**The first version of this doc proposed two goals: sync a user's own BYOK key across devices, and
add hosted/keyless AI alongside it.** That's been superseded. The actual driver, on reflection: no
user has ever gone and gotten their own AI provider API key just to use Sakura's AI features — the
friction of "go create a Groq/Gemini account, generate a key, paste it into Settings" is high
enough that BYOK has effectively gone unused since it shipped, regardless of how much of it is
built and tested. **Decision: BYOK is removed entirely, not kept alongside hosted AI.** Hosted AI,
authenticated the same way Sakura's existing document sync already is, is now the *only* AI path —
lower friction than BYOK ever was, since many users already sign in for sync. This is a real
narrowing, not just an addition, and it changes the architecture below substantially from the first
draft: there is no user-supplied key anywhere in this system anymore, so there is nothing left to
vault, encrypt, or sync per-user. The `/vault/key` endpoint and "vaulted-BYOK mode" from the first
draft are gone.

## The one goal now

Let a signed-in user use AI features with zero per-user setup — no provider to pick, no API key to
find or paste, ever. Sakura holds the provider credentials (Robin's own) and fronts the cost. There
is no client-only way to do this — granting AI access requires *some* party to hold a real
credential — so a server component is structurally required. This also means AI features move from
"works offline, no account needed" (today) to "requires sign-in" — a real change to how AI is
positioned, addressed in "Open decisions" below.

## Architecture

One Cloudflare Worker, two endpoints, backed by one KV namespace. **Revised from the original
plan below**: the first version of this section had the provider fallback chain as a hardcoded
source constant with one Worker secret per provider (`wrangler secret put <PROVIDER>_API_KEY`).
Built as admin-managed KV storage instead — `POST /admin/providers` to add/update a provider,
`GET` to list the current chain, `DELETE` to remove one — so the admin never touches `wrangler`
or redeploys just to rotate a key or add a provider after initial setup. Only two Worker secrets
remain: `VAULT_KEK` (encrypts provider keys at rest) and `ADMIN_UID` (gates the endpoint). No
separate bootstrapping step either — the very first provider goes in through the same endpoint as
every later one, once those two secrets exist.

### `GET/POST/DELETE /admin/providers`
- Auth: Firebase ID token, same verification as `/ai/complete` below, plus `isAdmin(uid,
  ADMIN_UID)` (`auth.ts`) — an exact match against a fixed admin UID, not a real roles system,
  since there's exactly one admin. Non-admin callers get 403, not 404 (no attempt to hide the
  route's existence — it's not a secret, just gated).
- `POST` body: `{id, baseUrl, shape, model, apiKey, order}`. `apiKey` is encrypted via
  `vault.ts`'s AES-256-GCM (keyed by the `VAULT_KEK` Worker secret) before it ever reaches KV;
  the plaintext key is never returned in the response, including to the admin who just sent it.
  Upserts by `id`.
- `GET` returns the current chain (`id`/`baseUrl`/`shape`/`model`/`order` only — never the
  encrypted key blob either, no reason to widen the response beyond what admin visibility needs).
- `DELETE ?id=<id>` removes one provider.

### Admin UI (`legacy/index.html`)

Built: an "AI Providers" box sits directly inside Settings → Account → Admin, right below the
Feedback Inbox row, visible under the same `isAdmin` flag that already gates that whole section
(see `legacy/src/state/admin.ts`) — no separate modal or extra click layer, since it's a short
list plus one small form. It shows the current provider chain (each as its own boxed row,
matching the app's existing `.settings-list`/`.settings-list-row` styling, with a delete button
per row) and an add/update form (id, base URL, shape, model, API key, order) below it, calling
the three endpoints above directly.

Two things worth calling out about how this is wired:
- **Visibility vs. authorization are deliberately different checks.** The panel shows for anyone
  the existing `isAdmin` flag says is an admin (hardcoded email or an `/admins/{uid}` Firestore
  doc) — that's a *different* admin concept than the Worker's own fixed `ADMIN_UID` secret. This
  is fine because visibility is cosmetic: every real request still goes through the Worker's own
  Firebase-token verification and `isAdmin(uid, ADMIN_UID)` check, so a Firestore-admin who isn't
  the Worker's `ADMIN_UID` sees the panel but gets a 403 from every call, not real access.
  Unifying the two admin concepts (or dropping the Firestore one) is a candidate future cleanup,
  not required for this to be safe.
- **`AI_VAULT_WORKER_URL` is a blank placeholder constant** (next to `FIREBASE_CONFIG`) until a
  real Worker deploy exists. Every call goes through `aiVaultAdminFetch()`, which checks this
  first and fails with a clear "not configured yet" error (shown inline in the panel, and via
  toast on the add-provider form) rather than a raw network failure — this was verified with a
  real headless-browser pass, including the empty/loading/error states and the add-provider
  round-trip failing cleanly, since there's no deployed Worker to actually call yet.

### `POST /ai/complete`
- Auth: Firebase ID token (`Authorization: Bearer <token>`), verified in the Worker (see "Firebase
  token verification" below — this is not `firebase-admin`, which doesn't run on Workers).
- Body: `{systemPrompt?, userContent, maxTokens?}` — a request shape designed fresh for this
  endpoint rather than pinned to the client's existing internal call shape, since no client code
  calls this endpoint yet (that's the client-wiring pass, still out of scope here).
- Checks the caller's quota (`quota:{uid}:{yyyy-mm-dd}` in KV — see "Cost and abuse control"),
  rejects with 429 if exhausted.
- Reads the admin-configured provider list from KV (`providers.ts`), tries each in `order`,
  decrypting that provider's key just for the duration of the request. Per-provider request/
  response building is `providerShapes.ts`, which mirrors `legacy/index.html`'s own
  `callAiByShape` exactly for all four shapes (gemini/openai/cerebras/anthropic) rather than
  reinventing the wire format. On success, returns `{text, provider}`. If every provider fails,
  502 with per-provider error details; if none are configured at all, 503.
- Never returns a provider's own API key or the `VAULT_KEK`/`ADMIN_UID` secrets in a response
  body, ever, under any error path — a reviewed invariant, not just the happy path's behavior.

### KV layout
- `provider:{id}` → `{id, baseUrl, shape, model, order, encryptedApiKey}` — one record per
  admin-configured provider (`providers.ts`).
- `quota:{uid}:{yyyy-mm-dd}` → integer count, short TTL (auto-expires the next day).

### Firebase token verification
Firebase Admin SDK is Node-only and doesn't run in the Workers runtime. Verification in-Worker
means fetching Google's public JWKS and validating the ID token's signature/claims manually via
`jose` (`auth.ts`) — a well-documented pattern, not novel, but worth calling out explicitly since
it's an easy thing to assume "just works" the way it does in a Node backend. The signing algorithm
is pinned explicitly to RS256 against alg-confusion.

## Not touched by this doc: the existing client-side Secure Storage vault

Sakura's client-side "Secure Storage" vault (`legacy/index.html`, `vaultCryptoKey`/`vaultEncrypt`/
`vaultDecrypt`, extracted to `legacy/src/state/vault.ts`) protects more than just AI keys today —
it also guards a Gist/Drive backup token. Removing BYOK removes *one* of that vault's use cases,
not the feature itself; the Gist/Drive token path is untouched and out of scope here. Don't conflate
"this doc's Worker vault is gone" with "the client-side Secure Storage feature is gone" — they were
always two different things even in the first draft, and only the first ever existed in this design.

## Cost and abuse control (the hard part, not the Worker plumbing)

There's no more "BYOK mode bears no cost" split — every request now bills Robin's own provider
account, with Firebase auth as the only gate standing between "any Sakura user" and unmetered
spend on his credentials.

- **Quota**: `quota:{uid}:{yyyy-mm-dd}` counter (`worker/src/quota.ts`), request rejected once the
  daily cap is hit — currently `DAILY_AI_QUOTA = 20` in `wrangler.toml`'s `[vars]`, a working
  placeholder, not a considered number; change it before a real launch. Not actually atomic —
  Cloudflare KV has no compare-and-swap, so the read-then-write has a narrow race under truly
  concurrent requests from the same UID (both could read the same count and both write count+1,
  undercounting by one). Accepted deliberately: a Durable Object would close that race but is real
  added complexity for a single-admin abuse-mitigation quota, not a financial ledger.
- **Provider choice for the fallback chain**: fund it from providers with a genuinely free tier at
  the volumes expected — Groq and Cerebras are the obvious first choices (see the labels on those
  two in the current, soon-to-be-removed `AI_BUILTIN_PROVIDERS` list, `legacy/index.html` ~line
  8859: "free, fast" / "free tier"). Doesn't need to be a long chain — one or two funded providers
  with a defined order is enough, added via `POST /admin/providers` once deployed.
- **UID-only quota is gameable if sign-in is anonymous** (see next section) — someone scripting
  repeated anonymous sign-ins gets a fresh UID and a fresh quota each time. An IP-based backstop
  (Cloudflare Workers can read the connecting IP from request context) is probably needed too if
  anonymous auth is the sign-in path. This needs real design attention before this ships, not just
  before it scales — the failure mode here is "Robin's provider bill," not a slow degradation, and
  it's now the *only* AI path rather than one option among several.

## Open decisions

Still genuinely unresolved, needs an explicit answer before implementation starts:

- **Anonymous vs. real Firebase sign-in for AI access.** Firebase anonymous auth (no email/password
  prompt) gives the Worker a stable UID to rate-limit against without a visible "account," but is
  weaker against abuse (a free, disposable UID — see the IP-backstop note above) than requiring a
  real Google/email sign-in. This is less urgent than it was in the BYOK-alongside-hosted draft,
  though: sync already pushes many users toward a real account anyway, so the actual added friction
  of requiring real sign-in specifically for AI may be smaller than it first appears. Still worth
  deciding deliberately rather than defaulting into.
- **What happens to a user who currently has a BYOK key configured?** Real accounts exist today with
  a provider/key saved in `AI_PREFS_KEY` (`legacy/index.html`). Once the client-side provider-calling
  code is removed, does their AI usage silently switch to the hosted path (using their existing
  sign-in, if any) with no notice, or does it need an explicit one-time migration message ("your
  saved API key is no longer used — AI now works automatically")? Given the premise that BYOK use
  is at or near zero, this may be a non-issue in practice, but it should be confirmed rather than
  assumed before the removal ships.
- **Real daily quota number** — `DAILY_AI_QUOTA = 20` is a working placeholder (see above), and
  whether it should differ for anonymous vs. real-account UIDs (if anonymous auth is the answer to
  the first question above).

## Explicitly out of scope for this doc

- ~~Actual Cloudflare account/project provisioning and `wrangler` deployment~~ — done: the
  `sakura-vault-kv` KV namespace and the `sakura-vault` Worker exist, both Worker secrets
  (`VAULT_KEK`, `ADMIN_UID`) are set, and `.github/workflows/deploy-worker.yml` deploys on every
  push to `main` that touches `worker/`, authenticated via a Workers-scoped Cloudflare API token
  held as a GitHub repo secret (never printed by the workflow, never touches the Worker's own
  secrets — those stay attached to the Worker independent of how its code ships).
- The `legacy/index.html` side of this: removing the Settings → AI provider/API-key/fallback UI
  (currently user-facing, becomes irrelevant once there's no BYOK to configure) and whatever
  replaces it (most likely a single "AI" on/off surface with no provider concepts exposed at all).
  Not designed here — a separate pass once client wiring is actually being built. (The
  *admin*-facing side of `/admin/providers` is no longer out of scope — see "Admin UI" below.)

## Rollout shape

The Worker and its two endpoints were built and unit-tested independently of `legacy/index.html`
(85 tests, `worker/tests/`) — the plan below of testing a *deployed* Worker directly still holds
for the one thing tests-against-fakes can't cover: an actual Cloudflare deploy. Once deployed,
confirm end-to-end behavior with `curl`/Postman before any client wiring happens. Client wiring,
when it happens, is **not** purely additive the way the first draft's "two new provider-list
entries" was — it removes the existing seven-provider Settings → AI surface rather than adding
beside it. That's a real, user-visible change to existing Settings, not a side option,
and deserves its own careful pass (including the "existing BYOK user" question above) rather than
being treated as low-risk just because the backend side is additive.
