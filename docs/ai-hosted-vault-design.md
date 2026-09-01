# Hosted AI (Cloudflare Worker) — design proposal

**Status: proposal, not started, not scheduled.** No code exists yet beyond the pure workspace
scaffold (`worker/` — tooling only, no logic). This doc exists so the architecture and open
decisions are written down before any real logic is built — see "Open decisions" below for what
still needs an answer first.

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

One Cloudflare Worker, one endpoint, backed by one KV namespace.

### `POST /ai/complete`
- Auth: Firebase ID token (`Authorization: Bearer <token>`), verified in the Worker (see "Firebase
  token verification" below — this is not `firebase-admin`, which doesn't run on Workers).
- Body: whatever the existing client-side AI call shape already sends (prompt/messages, feature
  type, max tokens) — reuse that shape rather than inventing a new one, so the client-side change
  is "call this endpoint instead of the provider directly," not a new request format.
- Checks the caller's quota (`quota:{uid}:{yyyy-mm-dd}` in KV — see "Cost and abuse control"),
  rejects if exhausted.
- Tries providers from a **fixed, admin-defined fallback chain** — not a per-user choice, there is
  no per-user provider config left at all. Each entry in the chain names a Worker secret holding
  Robin's own key for that provider (`wrangler secret put <PROVIDER>_API_KEY`). The chain itself
  lives as a plain ordered constant in the Worker's source (or a `[vars]` entry in
  `wrangler.toml` if reordering-without-a-code-change is worth the extra indirection) — deliberately
  **not** a KV-backed or runtime-configurable system. There's exactly one operator who will ever
  change this, and changing a Worker secret already requires a `wrangler` action, so a dynamic
  admin config API would be real complexity serving no one.
- Never returns a provider's own API key or any Worker secret in a response body, ever, under any
  error path — a reviewed invariant, not just the happy path's behavior.

### KV layout
- `quota:{uid}:{yyyy-mm-dd}` → integer count, short TTL (auto-expires the next day). That's the
  only KV record this system needs now — no per-user vault record, since there's no per-user key.

### Firebase token verification
Firebase Admin SDK is Node-only and doesn't run in the Workers runtime. Verification in-Worker
means fetching Google's public JWKS and validating the ID token's signature/claims manually
(`jose` or similar — a well-documented pattern, not novel, but worth calling out explicitly since
it's an easy thing to assume "just works" the way it does in a Node backend).

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

- **Quota**: `quota:{uid}:{yyyy-mm-dd}` counter, checked and incremented atomically per request,
  request rejected once the daily cap is hit. Needs an actual number chosen before launch — not
  guessed here.
- **Provider choice for the fallback chain**: fund it from providers with a genuinely free tier at
  the volumes expected — Groq and Cerebras are the obvious first choices (see the labels on those
  two in the current, soon-to-be-removed `AI_BUILTIN_PROVIDERS` list, `legacy/index.html` ~line
  8859: "free, fast" / "free tier"). Doesn't need to be a long chain — one or two funded providers
  with a defined order is enough.
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
- **Actual daily quota number**, and whether it should differ for anonymous vs. real-account UIDs
  (if anonymous auth is the answer to the first question above).

## Explicitly out of scope for this doc

- Actual Cloudflare account/project provisioning and `wrangler` deployment — infrastructure access
  wasn't available in the session this was drafted in; whoever picks this up needs to confirm that
  before a real deploy, not after.
- The exact request/response shape for `/ai/complete` beyond "reuse what the client already sends"
  — needs a pass against the real current client code once someone is actually implementing this.
- The `legacy/index.html` side of this: removing the Settings → AI provider/API-key/fallback UI
  (currently user-facing, becomes irrelevant once there's no BYOK to configure) and whatever
  replaces it (most likely a single "AI" on/off surface with no provider concepts exposed at all).
  Not designed here — a separate pass once the Worker side is real.

## Rollout shape

The Worker and its one endpoint can be built and deployed independently of `legacy/index.html`,
tested directly (`curl`/Postman against the deployed Worker) before any client wiring happens.
Client wiring, when it happens, is **not** purely additive the way the first draft's "two new
provider-list entries" was — it removes the existing seven-provider Settings → AI surface rather
than adding beside it. That's a real, user-visible change to existing Settings, not a side option,
and deserves its own careful pass (including the "existing BYOK user" question above) rather than
being treated as low-risk just because the backend side is additive.
