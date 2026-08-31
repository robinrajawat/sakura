# AI key vault + hosted AI — design proposal

**Status: proposal, not started, not scheduled.** No code exists yet. This doc exists so the
architecture and open decisions are written down before any of it is built — see "Open decisions"
below for what still needs an answer first.

## Origin

This started as the "AI key vault (Cloudflare Worker)" appendix in
`docs/history/web-migration/phase6-full-parity-plan.md` — written while the `web/` React rewrite
was still active, filed there only because that was the live planning doc at the time. `web/` is
now discontinued; this proposal was never about `web/` specifically, and targets `legacy/` — the
only live app — instead. Reproduced and extended here because it's active work, not migration
history.

## Two goals, not one

The original proposal solved one problem: let a user who already has their own AI provider key
avoid re-pasting it on every device. Discussion since then surfaced a second, larger goal: let a
user use AI features **without** providing a key at all. These need different mechanisms:

1. **Key sync** (original goal) — the user's own key, encrypted, available on every device without
   re-entry. A Cloudflare Worker is one way to do this, but not the only way — see "Rejected
   alternative" below.
2. **Hosted/keyless AI** (new goal) — Sakura itself holds a provider key and fronts the cost, so a
   user with no key configured can still use AI features. This one has no client-only alternative:
   there is no way to grant AI access without *some* party holding a real credential, so a server
   component is structurally required, not just a nicer-to-have.

**Decision: build both, as two additional entries in the existing Settings → AI provider list,
alongside the seven built-in providers — not a replacement for BYOK.** This is additive by
design: the seven existing providers keep working exactly as they do today (direct
browser-to-provider calls, no Worker involved), so existing users see zero change unless they
opt into one of the two new options. See `AI_BUILTIN_PROVIDERS` (`legacy/index.html`, ~line 8859)
for the current list this extends.

## Rejected alternative (for goal 1 alone)

Sync the user's own client-side-encrypted key through Firestore, the same mechanism documents and
prefs already sync through (`markMetaChanged`/`getSyncMetaKeys`, `legacy/index.html` ~line 14087).
Zero new infrastructure — reuses the Firebase project Sakura already has for auth/sync. This is
still the better answer for goal 1 *alone*: no new Cloudflare project, no KV, no secret
management, no new attack surface, and it fits Sakura's existing "the only backend is Firebase"
posture.

It doesn't reach goal 2 at all, though — it only ever relays a key the user already has, it can't
manufacture one. Once hosted/keyless AI is in scope, a server has to exist anyway, so goal 1's
"never touches the browser again" guarantee comes for free by reusing the same Worker rather than
staying with Firestore-sync. That's the actual reason this doc proposes a Worker for both goals
instead of splitting them across two mechanisms.

## Architecture

One Cloudflare Worker, two endpoints, backed by one KV namespace (or two — see "KV layout"):

### `POST /vault/key`
- Auth: Firebase ID token (`Authorization: Bearer <token>`), verified in the Worker (see
  "Firebase token verification" below — this is not `firebase-admin`, which doesn't run on
  Workers).
- Body: `{provider: string, key: string}`.
- Encrypts `key` at rest with AES-256-GCM, keyed by a Worker secret (a KEK, not user-derived —
  see "Trust model" below for why this is deliberately *not* the same guarantee as the existing
  client-side Secure Storage vault), unique IV per record.
- Stores `{provider, encryptedKey, iv, updatedAt}` in KV under the caller's Firebase UID.
- Never returns the plaintext key in the response, including to the same user who just sent it —
  the response confirms storage, nothing else.

### `POST /ai/complete`
- Auth: same Firebase ID token.
- Body: whatever the existing client-side AI call shape already sends (prompt/messages, feature
  type, max tokens) — reuse that shape rather than inventing a new one, so this can be a drop-in
  swap in the client's request path.
- Two modes, selected by which of the two new Settings → AI options the client has picked:
  - **Vaulted-BYOK mode**: looks up the caller's own vaulted key from `/vault/key`'s KV record,
    decrypts it in-memory for the duration of the request only, forwards to that provider,
    streams/returns the completion, discards the decrypted key. The Worker is a pure relay here —
    it never bills its own credentials.
  - **Hosted mode**: no user key involved. Worker uses its own provider key(s), held as Worker
    secrets (`wrangler secret put`), against a per-UID quota (see "Cost and abuse control").
- Decrypted keys and the Worker's own hosted-mode secrets never appear in a response body, ever,
  under any error path — this needs to be a reviewed invariant, not just the happy path's
  behavior.

### KV layout
- `vault:{uid}` → `{provider, encryptedKey, iv, updatedAt}` (goal 1: vaulted BYOK key).
- `quota:{uid}:{yyyy-mm-dd}` → integer count, short TTL (auto-expires the next day) (goal 2: daily
  usage counter for hosted mode). Same namespace, different key prefix — no need for two KV
  namespaces unless later operational needs (different access policies, different backup/export
  needs) argue for splitting them.

### Firebase token verification
Firebase Admin SDK is Node-only and doesn't run in the Workers runtime. Verification in-Worker
means fetching Google's public JWKS and validating the ID token's signature/claims manually
(`jose` or similar — a well-documented pattern, not novel, but worth calling out explicitly since
it's an easy thing to assume "just works" the way it does in a Node backend).

## Trust model — this is not the existing client-side vault

Sakura already has a client-side "Secure Storage" vault (`legacy/index.html`, `vaultCryptoKey`/
`vaultEncrypt`/`vaultDecrypt`, extracted to `legacy/src/state/vault.ts` — see
`docs/history/architecture-plan.md`'s Phase 2 section). That vault is passphrase-derived and
zero-knowledge: the server never sees the plaintext key or the passphrase, only ciphertext it
can't read.

The Worker vault proposed here is **not** zero-knowledge. The Worker holds the KEK (a Worker
secret Robin controls) and decrypts the user's key server-side on every `/ai/complete` call in
vaulted-BYOK mode — that's the entire point, it's what lets the key never touch the browser again.
But it means the operator (Robin, or anyone with Worker secret access) can technically decrypt any
vaulted key. This is a real, different trust boundary from the existing local vault and needs to
be stated plainly to users choosing this option, not glossed over as "another kind of encryption."
Whatever UI copy ships with this should say so directly.

## Cost and abuse control (the hard part, not the Worker plumbing)

Vaulted-BYOK mode has no cost-control problem — the user's own key bills the user's own account,
same as today, the Worker just relays. **Hosted mode is the actual risk**: every request there
bills Robin's own provider account, with authentication as the only gate standing between "any
Sakura user" and unmetered spend on his credentials.

- **Quota**: `quota:{uid}:{yyyy-mm-dd}` counter, checked and incremented atomically per request,
  request rejected once the daily cap is hit. Needs an actual number chosen before launch — not
  guessed here.
- **Provider choice for hosted mode**: fund it from a provider with a genuinely free tier at the
  volumes expected — Groq and Cerebras are both already first-choice in the existing
  fallback-chain convention for exactly this reason (see `AI_BUILTIN_PROVIDERS` labels, "free,
  fast" / "free tier"). Hosted mode likely doesn't need all seven providers as fallback, just
  one or two funded ones with a defined order.
- **UID-only quota is gameable if sign-in is anonymous** (see next section) — someone scripting
  repeated anonymous sign-ins gets a fresh UID and a fresh quota each time. Per-UID quota alone is
  not sufficient anti-abuse for hosted mode if anonymous auth is the sign-in path; an IP-based
  backstop (Cloudflare Workers can read the connecting IP from request context) is probably
  needed too. This needs real design attention before hosted mode ships, not just before it scales
  — the failure mode here is "Robin's provider bill," not a slow degradation.

## Open decision: does hosted mode require a visible account?

Both new endpoints need *a* Firebase UID to key quota/vault records against, but Sakura's whole
pitch is "no install, no account required" (`README.md` Overview). Requiring real sign-in
(Google/email) just to try hosted AI cuts against that positioning for exactly the users most
likely to want a zero-setup AI trial.

**Firebase anonymous auth is a plausible middle ground**: sign in anonymously (no email/password
prompt, no visible "account"), get a stable UID, use that for quota. This keeps the zero-setup
feel while still giving the Worker something to rate-limit against. The real cost is weaker
anti-abuse (an anonymous UID is free and disposable — see the IP-backstop note above), so this
is a genuine trade-off, not a free win, and worth deciding deliberately rather than defaulting into
without weighing it.

**This doc does not resolve the question — it needs an explicit answer before implementation
starts**, along with:

- Is hosted mode pre-selected for a brand-new user (AI "just works" out of the box), or does it
  stay an opt-in choice next to the seven BYOK providers? The former serves the actual "no setup"
  goal better; the latter is lower-risk to ship first.
- What's the actual daily quota number, and does it differ for anonymous vs. real-account UIDs
  (e.g. a lower cap for anonymous, higher once someone signs in for real)?
- Is hosted mode a permanent free tier, or a trial meant to nudge toward BYOK once a user is
  convinced the feature is useful?

## Explicitly out of scope for this doc

- Actual Cloudflare account/project provisioning and `wrangler` deployment — infrastructure
  access wasn't available in the session this was drafted in; whoever picks this up needs to
  confirm that before writing Worker code, not after.
- The exact request/response shape for `/ai/complete` beyond "reuse what the client already
  sends" — needs a pass against the real current client code once someone is actually
  implementing this, not guessed here.
- UI copy for the two new Settings → AI entries, including the trust-model disclosure from
  above.

## Rollout shape (once the open decisions above are answered)

Additive only, at every step: the Worker and its two endpoints can be built and deployed
independently of `legacy/index.html`, tested directly (`curl`/Postman against the deployed Worker)
before any client wiring happens. Client wiring is then two new entries in the existing provider
list — no changes to the seven existing providers' code paths. If the Worker is ever down or
unreachable, that should degrade to an error on those two options specifically, never to a
regression in the seven existing ones.
