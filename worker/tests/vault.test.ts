import { describe, it, expect } from 'vitest';
import { b64FromBytes, bytesFromB64, importKek, encryptWithKek, decryptWithKek } from '../src/vault';

describe('b64FromBytes / bytesFromB64 (pure, round-trip)', () => {
  it('round-trips arbitrary byte sequences', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64, 17, 300 % 256]);
    expect(Array.from(bytesFromB64(b64FromBytes(original)))).toEqual(Array.from(original));
  });

  it('round-trips an empty byte array', () => {
    expect(Array.from(bytesFromB64(b64FromBytes(new Uint8Array([]))))).toEqual([]);
  });
});

async function makeKek(): Promise<{ kek: CryptoKey; kekBase64: string }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const kekBase64 = b64FromBytes(raw);
  const kek = await importKek(kekBase64);
  return { kek, kekBase64 };
}

describe('importKek / encryptWithKek / decryptWithKek (real Web Crypto, no mocks)', () => {
  it('round-trips plaintext through encrypt then decrypt', async () => {
    const { kek } = await makeKek();
    const ciphertext = await encryptWithKek('sk-groq-abc123', kek);
    expect(await decryptWithKek(ciphertext, kek)).toBe('sk-groq-abc123');
  });

  it('round-trips an empty string', async () => {
    const { kek } = await makeKek();
    const ciphertext = await encryptWithKek('', kek);
    expect(await decryptWithKek(ciphertext, kek)).toBe('');
  });

  it('round-trips unicode content', async () => {
    const { kek } = await makeKek();
    const plaintext = 'a key with emoji 🔑 and non-ascii café';
    const ciphertext = await encryptWithKek(plaintext, kek);
    expect(await decryptWithKek(ciphertext, kek)).toBe(plaintext);
  });

  it('two encryptions of the same plaintext produce different ciphertext (random IV)', async () => {
    const { kek } = await makeKek();
    const a = await encryptWithKek('same-secret', kek);
    const b = await encryptWithKek('same-secret', kek);
    expect(a).not.toBe(b);
  });

  it('rejects decryption with the wrong key', async () => {
    const { kek: kekA } = await makeKek();
    const { kek: kekB } = await makeKek();
    const ciphertext = await encryptWithKek('secret', kekA);
    await expect(decryptWithKek(ciphertext, kekB)).rejects.toThrow();
  });

  it('rejects decryption of tampered ciphertext (GCM authentication)', async () => {
    const { kek } = await makeKek();
    const ciphertext = await encryptWithKek('secret', kek);
    const bytes = bytesFromB64(ciphertext);
    bytes[bytes.length - 1] ^= 0xff; // flip a bit in the tag/ciphertext
    const tampered = b64FromBytes(bytes);
    await expect(decryptWithKek(tampered, kek)).rejects.toThrow();
  });

  it('importKek is deterministic for the same base64 key material', async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const kekBase64 = b64FromBytes(raw);
    const kekA = await importKek(kekBase64);
    const kekB = await importKek(kekBase64);
    const ciphertext = await encryptWithKek('cross-import-check', kekA);
    expect(await decryptWithKek(ciphertext, kekB)).toBe('cross-import-check');
  });
});
