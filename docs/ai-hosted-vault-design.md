# Hosted AI (Cloudflare Worker) — design proposal

**Status: deployed and live.** Every Worker piece described below exists as real, tested code —
encryption (`vault.ts`), quota (`quota.ts`), Firebase auth + the admin check (`auth.ts`),
encrypted provider storage (`providers.ts`), the per-provider request/response adapters
(`providerShapes.ts`), admin-configurable runtime settings (`config.ts`), and the endpoints
themselves (`index.ts`) — and is live at
`https://sakura-vault.robinsinghrajawat.workers.dev`, deployed by
`.github/workflows/deploy-worker.yml` on every push to `main` that touches `worker/`.
`legacy/index.html` has its own top-level Settings → Admin panel (its own rail category, not
nested under Account — see "Admin UI" below) for managing the provider chain and the daily quota
against those endpoints, and its `AI_VAULT_WORKER_URL` constant now points at the real deployed
URL. **The fallback chain is funded**: Groq (order 0) and Gemini (order 1) are configured through
that admin panel, each with a real API key encrypted at rest. Cerebras was tried as a third
funded provider and removed — see "Cost and abuse control" below for why. **The user-facing client wiring is also
done**: "Sakura Hosted AI (beta)" is a real option in Settings → AI → Provider, sitting next to
the seven BYOK providers rather than replacing them — see "Client UI" below for how mode-switching
works. Every AI capability in the app (Rewrite, Generate Outline, Restructure Text, Q&A, to-do
extraction, icon assignment, auto-rewrite-on-commit, all of it) reaches `/ai/complete` for free the
moment hosted is selected, because all of them already funnel through the one shared
`callAiByShapeWithFallback`/`callAiByShape` choke point — adding a `shape==='hosted'` branch there
was the entire integration, not fifteen separate call-site changes.

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

**Second reversal, after the Worker was already built and deployed: BYOK stays after all,
alongside hosted AI.** The honest case for keeping it: it's a real escape hatch from hosted's
daily quota for anyone who wants unlimited usage on their own dime, and since it already exists
and works, keeping it costs little beyond not deleting it and adding a small mode-switch surface
to Settings. This reopens one question the first reversal had closed — a cross-device BYOK-key
sync mechanism (`/vault/key`, held by the Worker's own KEK) was proposed and then explicitly
rejected: server-side decryption capability for a user's own key was judged too large a security
trade for the UX win, so BYOK keys remain local-only, one device at a time, exactly as they
worked before any of this. Client wiring is therefore **additive**, not a replacement — see
"Explicitly out of scope" below.

## The one goal now

Let a signed-in user use AI features with zero per-user setup — no provider to pick, no API key to
find or paste, ever. Sakura holds the provider credentials (Robin's own) and fronts the cost. There
is no client-only way to do this — granting AI access requires *some* party to hold a real
credential — so a server component is structurally required for *this path specifically*. Unlike
the first draft, this no longer means AI overall requires sign-in: BYOK (see the second reversal
above) still works offline with no account, exactly as today; only the *hosted* path requires
signing in, as a new second option alongside it, addressed in "Open decisions" below.

## Architecture

One Cloudflare Worker, three endpoints, backed by one KV namespace. **Revised from the original
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

### `GET/POST /admin/config`
- Same admin auth as `/admin/providers` above.
- `GET` returns `{dailyQuota}` — the current value, KV-set if the admin has ever tuned it,
  otherwise falling back to `wrangler.toml`'s `DAILY_AI_QUOTA` var and then a hardcoded default
  (`config.ts`'s `getDailyQuota`, same layered-fallback shape used nowhere else in this Worker).
- `POST` body: `{dailyQuota}`, a positive integer — lets the admin tune the real daily quota
  number at runtime, no `wrangler.toml` edit or redeploy needed (resolves the "real daily quota
  number" open decision below by making it a runtime knob rather than a number to pick upfront).

### Admin UI (`legacy/index.html`)

Built: "Admin" is its own top-level Settings rail category (not nested under Account — moved
there after starting as an Account sub-section, since a rare, single-admin maintenance area
sitting between everyday categories like Account and AI wasn't the right spot; it now sits right
before "About", matching the "rare/meta stuff trails" pattern that section already followed). The
whole category — Feedback Inbox, "Daily AI quota", and "AI Providers" — is visible under the same
`isAdmin` flag that already gated it as an Account sub-section (see `legacy/src/state/admin.ts`),
now extended to also toggle the rail button itself in real time (`getAdminRailButtonElement`), so
a non-admin never sees an empty "Admin" tab. No separate modal or extra click layer for any of
this, since it's short lists plus small forms. "AI Providers" shows the current provider chain
(each as its own boxed row, matching the app's existing `.settings-list`/`.settings-list-row`
styling, with a delete button per row) and an add/update form (id, base URL, shape, model, API
key, order) below it; "Daily AI quota" is a single number input + Save button above that. All of
it calls the endpoints above directly.

Two things worth calling out about how this is wired:
- **Visibility vs. authorization are deliberately different checks.** The panel shows for anyone
  the existing `isAdmin` flag says is an admin (hardcoded email or an `/admins/{uid}` Firestore
  doc) — that's a *different* admin concept than the Worker's own fixed `ADMIN_UID` secret. This
  is fine because visibility is cosmetic: every real request still goes through the Worker's own
  Firebase-token verification and `isAdmin(uid, ADMIN_UID)` check, so a Firestore-admin who isn't
  the Worker's `ADMIN_UID` sees the panel but gets a 403 from every call, not real access.
  Unifying the two admin concepts (or dropping the Firestore one) is a candidate future cleanup,
  not required for this to be safe.
- **`AI_VAULT_WORKER_URL`** (next to `FIREBASE_CONFIG`) now points at the real deployed Worker.
  Every call goes through `aiVaultAdminFetch()`, which would have failed with a clear "not
  configured yet" error had the URL still been blank — that path was verified with a real
  headless-browser pass, including the empty/loading/error states and the add-provider
  round-trip, before the URL was set to the real value.
- **Two real-world gaps surfaced once this actually ran against the live site**, both fixed:
  the Worker's origin needed adding to `legacy/index.html`'s own CSP `connect-src` allowlist
  (the browser was blocking the request before it ever left the page), and the Worker itself
  needed real CORS support (`corsHeadersFor`/`withCors` in `index.ts`) — it had none before,
  since nothing called it cross-origin until this panel existed. CORS is a closed allowlist,
  same reasoning as the CSP: `https://www.sakura-notes.com` (the real production origin, from
  `legacy/public/CNAME`) plus `http://localhost:5173` for local dev, not a wildcard.

### Client UI (`legacy/index.html`)

Built: "Sakura Hosted AI (beta)" is the first option in Settings → AI → Provider's dropdown
(`getAiSelectableProviders()` = hosted + the seven `AI_BUILTIN_PROVIDERS`, unchanged from before).
Selecting it swaps the whole Provider panel into hosted mode — Model and API Key rows hide
(there's no user-facing key or model choice; the Worker's own admin-configured chain handles
that), replaced by a sign-in-aware status block: signed out shows a "Sign in" button (deep-links
to Settings → Account, reusing the existing sign-in UI rather than duplicating a Google-popup
button here) and a one-line explanation; signed in shows the account and a "Test" button
(`testHostedAi()`, mirrors the BYOK "Test" button's bypass-fallback-and-usage-counter behavior).
Switching back to any BYOK provider restores the Model/API Key rows exactly as before —
`applyAiProviderModeUI()` is the one function that toggles all of this, called on load, on
provider-select change, and on sign-in/sign-out (hooked into the existing `updateAccountUI()`, the
one place every sign-in path already funnels through) so the sign-in status never goes stale while
Settings is open.

Two things worth calling out about how the wiring actually works:
- **One choke point, not fifteen call sites.** Every AI capability already funneled through
  `callAiByShapeWithFallback(shape, baseUrl, key, model, ...)` → `callAiByShape`. Hosted mode is
  just a new `shape==='hosted'` branch in `callAiByShape` that ignores `key`/`model` (unused for
  this shape), sends `Authorization: Bearer <Firebase ID token>` instead, and POSTs
  `{systemPrompt, userContent, maxTokens}` to `AI_VAULT_WORKER_URL + '/ai/complete'`, matching the
  Worker's contract in `worker/src/index.ts::handleAiComplete` exactly (verified end-to-end with a
  headless-browser pass that intercepts the network call and asserts method/headers/body, plus a
  429-quota-exceeded case). `requireAiKey()` (called by every one of those ~15 call sites before
  it reaches `callAiByShapeWithFallback`) got one new branch too: for hosted it checks
  `currentUser` instead of a saved key, so the existing "no key" error path becomes "sign in"
  instead — no other call site needed to change.
- **429 (quota exceeded) is fallback-eligible, same as a BYOK rate limit.** `isRateLimitStatus`
  already treats any 429 as a `RateLimitError`, and `callAiByShapeWithFallback`'s fallback chain
  (`getEffectiveFallbackChain()`) is built from `aiFallbackOrder`, which only ever contains the
  seven BYOK providers — hosted was never added to it. That means, with zero extra plumbing, a
  user who has hosted selected as primary *and* fallback enabled with a BYOK key configured for
  say Groq gets automatically routed to their own key once their daily hosted quota runs out,
  instead of just failing. Not required by the design, but falls out of reusing the existing
  mechanism rather than building a parallel one.
- **Auto-rewrite-on-commit needed one more change.** It bypasses `requireAiKey()` and checks
  `getAiKey()` directly to decide whether to pause the queue — which is always empty/falsy for
  hosted (there's no BYOK key to look up). Introduced `hasUsableAiKey()` (hosted: `!!currentUser`,
  BYOK: `!!getAiKey()`) and swapped it in at both call sites (`flushAutoRewriteQueue`'s pause
  check, `resumeAutoRewriteIfPaused`'s resume check), plus hooked `resumeAutoRewriteIfPaused()`
  into `updateAccountUI()` so a queue paused on "sign in to use hosted AI" actually resumes the
  moment sign-in completes, not just on the next manual settings interaction.
- **No CSP change needed.** `/ai/complete` is served from the same origin
  (`sakura-vault.robinsinghrajawat.workers.dev`) already allowlisted in `connect-src` for the
  admin panel's `/admin/*` calls (see "Admin UI" above) — one Worker, one origin, both surfaces.

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
it also guards a Gist/Drive backup token, and (now that BYOK stays — see the "second reversal" in
"Origin" above) continues to protect BYOK provider keys too, exactly as before. Nothing about this
doc changes what Secure Storage protects or how; entirely untouched and out of scope here. Don't
conflate "this doc's Worker-side vault" with "the client-side Secure Storage feature" — they were
always two different things even in the first draft, and only the first ever existed in this design.

## Cost and abuse control (the hard part, not the Worker plumbing)

There's no more "BYOK mode bears no cost" split — every request now bills Robin's own provider
account, with Firebase auth as the only gate standing between "any Sakura user" and unmetered
spend on his credentials.

- **Quota**: `quota:{uid}:{yyyy-mm-dd}` counter (`worker/src/quota.ts`), request rejected once the
  daily cap is hit — the cap itself is admin-configurable at runtime via `GET/POST /admin/config`
  (`config.ts`), defaulting to `wrangler.toml`'s `DAILY_AI_QUOTA = 20` var until the admin sets a
  real value through that endpoint; no redeploy needed to tune it. Not actually atomic —
  Cloudflare KV has no compare-and-swap, so the read-then-write has a narrow race under truly
  concurrent requests from the same UID (both could read the same count and both write count+1,
  undercounting by one). Accepted deliberately: a Durable Object would close that race but is real
  added complexity for a single-admin abuse-mitigation quota, not a financial ledger.
- **Provider choice for the fallback chain**: fund it from providers with a genuinely free tier
  at the volumes expected. Done: Groq (order 0) and Gemini (order 1) — both have their own
  dedicated free tier (not a shared aggregator quota the way OpenRouter's `:free`-tagged models
  do), same labels as the current `AI_BUILTIN_PROVIDERS` list (still there — BYOK stays;
  `legacy/index.html` ~line 8859: "free, fast" / "free"). Cerebras (order 1, briefly) was tried as
  a third and dropped: confirmed live that its `gpt-oss-120b` model returns "Payment required" on
  a real account despite Cerebras's own docs describing GPT-OSS as free-tier-available — their
  actual free offering is a time/credit-limited "free trial" plus pay-as-you-go, not an ongoing
  free tier the way Groq/Gemini's are, and this project has no way to guarantee any given admin's
  Cerebras account still has trial credit left. `AI_BUILTIN_PROVIDERS`' own Cerebras label was
  corrected the same way (dropped "(free tier)") for the same reason — BYOK users hit the exact
  same account-dependent wall. Claude/ChatGPT/GitHub Models are deliberately not funded this way —
  paid-only or tied to a personal account identity, respectively.
- **OpenRouter specifically reconsidered as Cerebras's replacement, and rejected again**: it's
  BYOK-only, deliberately not part of the funded chain, for a sharper reason than "low limit" —
  its free tier is the wrong *shape* for a shared funded key, not just a smaller number. `:free`
  models are capped per-account (roughly 50 requests/day unfunded, ~1000/day once $10+ of credit
  has ever been purchased, per OpenRouter's own docs at the time this was last checked — verify
  current numbers before relying on them) — one pool shared across *every* Sakura user who picks
  hosted AI that day, unlike Groq/Gemini's per-key allowance that scales with Sakura's own account
  regardless of how many Sakura users show up. A modest number of active hosted-AI users would
  exhaust that shared cap and make OpenRouter the bottleneck for everyone, not a safety net. Also
  unverified from this project (no live check done): whether OpenRouter's free-tier terms permit
  the relay shape hosted AI needs at all — one key serving requests on behalf of many distinct
  third-party end users, which some providers' free/hobby tiers restrict even without money
  changing hands. Worth reading their ToS directly before reconsidering this, not assuming it's
  fine because Groq/Gemini were.
- ~~UID-only quota is gameable if sign-in is anonymous~~ — resolved, doesn't apply: "Open
  decisions" below settled on real Google/email sign-in only for hosted AI, no anonymous auth
  built. A real account is meaningfully harder to script repeated fresh UIDs from than a
  no-prompt anonymous sign-in would have been.

## Open decisions

All three now resolved (kept here, not deleted, as a record of what was decided and why):

- ~~Anonymous vs. real Firebase sign-in for AI access.~~ **Decided: real sign-in only** (Google or
  email — Firebase anonymous auth doesn't exist anywhere in `legacy/index.html` today and won't be
  built for this; there's no existing sign-in flow to reuse, and BYOK already covers the
  no-account case, so the friction anonymous auth would have saved isn't needed). Building it
  would have meant new sign-in UI work for a path that's abuse-prone by nature (a free, disposable
  UID resets quota every time) with an existing lower-friction alternative (BYOK) already covering
  "I don't want to sign in." Hosted AI requires a real account; BYOK requires none, unchanged.
- ~~What happens to a user who currently has a BYOK key configured?~~ **Moot — BYOK isn't being
  removed** (see the "second reversal" in "Origin" above). Existing BYOK users are completely
  unaffected: their saved key keeps working exactly as it does today, with hosted AI arriving
  alongside it as a new, separate option, not a replacement.
- ~~Real daily quota number~~ **Resolved by making it a runtime knob, not a number to pick
  upfront** — `GET/POST /admin/config` (see "Architecture" above) lets the admin tune
  `DAILY_AI_QUOTA` at runtime, defaulting to `wrangler.toml`'s `20` until changed. No fixed number
  needed to be right on the first guess.

## Explicitly out of scope for this doc

- ~~Actual Cloudflare account/project provisioning and `wrangler` deployment~~ — done: the
  `sakura-vault-kv` KV namespace and the `sakura-vault` Worker exist, both Worker secrets
  (`VAULT_KEK`, `ADMIN_UID`) are set, and `.github/workflows/deploy-worker.yml` deploys on every
  push to `main` that touches `worker/`, authenticated via a Workers-scoped Cloudflare API token
  held as a GitHub repo secret (never printed by the workflow, never touches the Worker's own
  secrets — those stay attached to the Worker independent of how its code ships).
- ~~The *user-facing* `legacy/index.html` client wiring~~ — done: see "Client UI" above. Both the
  *admin*-facing side (`/admin/providers`, `/admin/config`) and the *user*-facing side
  (`/ai/complete`) are wired into `legacy/index.html` now; nothing about this Worker's endpoints
  remains unreachable from the app.

## Rollout shape

The Worker and its endpoints were built and unit-tested independently of `legacy/index.html`
(104 tests, `worker/tests/`), then verified for real against the actual deployed Worker (the one
thing tests-against-fakes can't cover): `GET /health` returns `ok`, and a real signed-in user
calling `POST /ai/complete` with `{userContent: 'Reply with the single word OK.'}` got back
`{text: 'OK', provider: 'groq'}` — the full chain confirmed live: Firebase token verification,
quota, KEK decryption of the stored key, the real call to Groq's API, and correct response
parsing. Client wiring landed purely additive after all — closer to the first draft's original
"two new provider-list entries" shape than the hosted-only draft's plan to remove the existing
seven-provider Settings → AI surface. BYOK stays untouched; hosted AI is a new option next to it
in the same Provider dropdown, gated on real sign-in (see "Client UI" above), not a replacement.
The wiring itself was verified the same two ways as the Worker side: unit tests for every touched
function (`requireAiKey`, `hasUsableAiKey`, the provider-registry helpers) plus a real
headless-browser pass exercising the actual Settings UI — provider switch hiding/showing the
right rows, sign-in state flipping the status block live, and a network-intercepted `/ai/complete`
call asserting the exact request the Worker expects and a correct parse of both its success and
429-quota response shapes.
