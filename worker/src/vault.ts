/**
 * AES-256-GCM encryption for the admin-configured provider secrets stored in KV
 * (docs/ai-hosted-vault-design.md). The key-encryption-key (KEK) is a Worker secret — a raw
 * random 32-byte key, provisioned once via `wrangler secret put VAULT_KEK` (generate one with
 * `openssl rand -base64 32`) and never committed — imported here, not derived from a
 * passphrase: there's no human typing this key in, unlike legacy/src/state/vault.ts's
 * PBKDF2-derived client-side vault. This deliberately mirrors that module's wire format (a
 * random 12-byte IV prepended to the ciphertext, combined and base64-encoded as one string)
 * since it's a simple, already-proven shape — the two vaults are otherwise unrelated: this one
 * protects a handful of admin-provisioned provider keys, that one protects one user's own.
 */

export function b64FromBytes(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export function bytesFromB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Imports a base64-encoded raw 32-byte key (a Worker secret) as an AES-256-GCM CryptoKey. */
export async function importKek(kekBase64: string): Promise<CryptoKey> {
  const raw = bytesFromB64(kekBase64);
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptWithKek(plainText: string, kek: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, new TextEncoder().encode(plainText));
  const combined = new Uint8Array(iv.length + ctBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ctBuf), iv.length);
  return b64FromBytes(combined);
}

export async function decryptWithKek(b64: string, kek: CryptoKey): Promise<string> {
  const combined = bytesFromB64(b64);
  const iv = combined.slice(0, 12);
  const ct = combined.slice(12);
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ct as BufferSource);
  return new TextDecoder().decode(ptBuf);
}
