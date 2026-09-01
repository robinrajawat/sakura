import { describe, it, expect, beforeAll } from 'vitest';
import { SignJWT, generateKeyPair, type JWTVerifyGetKey } from 'jose';
import { verifyFirebaseIdToken } from '../src/auth';

const PROJECT_ID = 'sakura-4cdae';
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;

let publicKey: CryptoKey;
let privateKey: CryptoKey;
let otherPublicKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  publicKey = pair.publicKey;
  privateKey = pair.privateKey;
  const otherPair = await generateKeyPair('RS256');
  otherPublicKey = otherPair.publicKey;
});

function getKeyFor(key: CryptoKey): JWTVerifyGetKey {
  return async () => key;
}

async function signToken(
  claims: Record<string, unknown>,
  opts: { issuer?: string; audience?: string; expiresInSeconds?: number; signWith?: CryptoKey } = {}
): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? PROJECT_ID)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + (opts.expiresInSeconds ?? 3600))
    .sign(opts.signWith ?? privateKey);
}

describe('verifyFirebaseIdToken (real RS256 signing/verification, no mocks)', () => {
  it('verifies a correctly signed token and returns uid + email', async () => {
    const token = await signToken({ sub: 'user-abc-123', email: 'person@example.com' });
    const result = await verifyFirebaseIdToken(token, PROJECT_ID, getKeyFor(publicKey));
    expect(result).toEqual({ uid: 'user-abc-123', email: 'person@example.com' });
  });

  it('verifies a token with no email claim, email left undefined', async () => {
    const token = await signToken({ sub: 'user-no-email' });
    const result = await verifyFirebaseIdToken(token, PROJECT_ID, getKeyFor(publicKey));
    expect(result).toEqual({ uid: 'user-no-email', email: undefined });
  });

  it('rejects a token missing the sub claim', async () => {
    const token = await signToken({ email: 'nosub@example.com' });
    await expect(verifyFirebaseIdToken(token, PROJECT_ID, getKeyFor(publicKey))).rejects.toThrow(
      /sub claim/
    );
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await signToken({ sub: 'user-1' }, { issuer: 'https://not-firebase.example.com' });
    await expect(verifyFirebaseIdToken(token, PROJECT_ID, getKeyFor(publicKey))).rejects.toThrow();
  });

  it('rejects a token with the wrong audience (wrong project)', async () => {
    const token = await signToken({ sub: 'user-1' }, { audience: 'some-other-project' });
    await expect(verifyFirebaseIdToken(token, PROJECT_ID, getKeyFor(publicKey))).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signToken({ sub: 'user-1' }, { expiresInSeconds: -10 });
    await expect(verifyFirebaseIdToken(token, PROJECT_ID, getKeyFor(publicKey))).rejects.toThrow();
  });

  it('rejects a token signed by a key other than the one the caller trusts', async () => {
    const token = await signToken({ sub: 'user-1' }); // signed with `privateKey`
    // Verifier is told to trust a DIFFERENT public key — simulates a token forged with an
    // unrelated key, or an attacker-controlled JWKS response.
    await expect(verifyFirebaseIdToken(token, PROJECT_ID, getKeyFor(otherPublicKey))).rejects.toThrow();
  });
});
