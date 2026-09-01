/**
 * Firebase ID token verification, without firebase-admin — that SDK is Node-only (relies on
 * Node's crypto APIs) and doesn't run in the Workers runtime. Verification here means fetching
 * Google's public JWKS for the securetoken service and validating the token's signature/claims
 * directly, via jose (Web Crypto-based, works in Workers). See
 * docs/ai-hosted-vault-design.md's "Firebase token verification" section.
 */

import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
}

/**
 * Verifies a Firebase ID token's signature, issuer, audience, and expiry, returning the
 * caller's Firebase UID (the 'sub' claim). Throws on any verification failure — wrong
 * signature/issuer/audience, expired token, wrong signing algorithm, or a token that verifies
 * structurally but is missing 'sub'.
 *
 * getKey is injected rather than hardcoded to Google's real JWKS endpoint so this stays
 * testable with a real (generated, in-memory) key pair instead of live network access — see
 * firebaseJwks() below for the production resolver.
 */
export async function verifyFirebaseIdToken(
  token: string,
  projectId: string,
  getKey: JWTVerifyGetKey
): Promise<VerifiedFirebaseToken> {
  const { payload } = await jwtVerify(token, getKey, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'] // pinned explicitly — always what Firebase signs with, and this
    // guards against alg-confusion regardless of what a caller's own getKey would otherwise accept
  });
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new Error('Firebase ID token verified but has no sub claim');
  }
  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined
  };
}

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cachedJwks: JWTVerifyGetKey | null = null;

/**
 * Production key resolver — lazily created and cached across requests within the same Worker
 * isolate. jose's createRemoteJWKSet does its own internal key caching/refresh honoring the
 * endpoint's Cache-Control, so this only needs to avoid re-creating the resolver itself.
 */
export function firebaseJwks(): JWTVerifyGetKey {
  if (!cachedJwks) cachedJwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  return cachedJwks;
}
