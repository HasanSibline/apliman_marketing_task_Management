import * as crypto from 'crypto';
import { ApiKeyCipher, EncryptionKeyMissingError } from './api-key-cipher';

const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
const SECRET_A = 'first-deployment-secret';
const SECRET_B = 'rotated-deployment-secret';

/** Exactly what CompaniesService.encryptApiKey wrote before v2. */
function sealV1(apiKey: string, secret: string): string {
  const key = crypto.scryptSync(secret, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return `${iv.toString('hex')}:${cipher.update(apiKey, 'utf8', 'hex')}${cipher.final('hex')}`;
}

/** Exactly what CompaniesService.decryptApiKey did before v2, for the rollback check. */
function openWithPreV2Code(stored: string, secret: string): string {
  try {
    if (!stored.includes(':')) return Buffer.from(stored, 'base64').toString('utf-8');
    const [ivHex, text] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', crypto.scryptSync(secret, 'salt', 32), Buffer.from(ivHex, 'hex'));
    return decipher.update(text, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return '[DECRYPTION_FAILED]';
  }
}

describe('ApiKeyCipher', () => {
  describe('v2', () => {
    const cipher = new ApiKeyCipher(SECRET_A);

    it('round-trips a key and reports it current', () => {
      expect(cipher.open(cipher.encrypt(KEY))).toEqual({ apiKey: KEY, stale: false });
    });

    it('writes v2:<keyId>:<iv>:<tag>:<ciphertext> without the key in it', () => {
      const sealed = cipher.encrypt(KEY);
      expect(sealed.split(':')).toHaveLength(5);
      expect(sealed.startsWith('v2:')).toBe(true);
      expect(sealed).not.toContain(KEY);
      expect(sealed).not.toContain(Buffer.from(KEY).toString('base64'));
    });

    it('never produces the same value twice for the same key', () => {
      expect(cipher.encrypt(KEY)).not.toBe(cipher.encrypt(KEY));
    });

    it('rejects a value whose ciphertext was altered', () => {
      const parts = cipher.encrypt(KEY).split(':');
      const body = Buffer.from(parts[4], 'base64url');
      body[0] ^= 1;
      parts[4] = body.toString('base64url');
      expect(cipher.open(parts.join(':')).apiKey).toBeNull();
    });

    it('rejects a value whose tag was altered', () => {
      const parts = cipher.encrypt(KEY).split(':');
      parts[3] = Buffer.alloc(16).toString('base64url');
      expect(cipher.open(parts.join(':')).apiKey).toBeNull();
    });

    it('rejects a truncated tag, which GCM would otherwise accept', () => {
      for (const bytes of [4, 8, 12, 15]) {
        const parts = cipher.encrypt(KEY).split(':');
        parts[3] = Buffer.from(parts[3], 'base64url').subarray(0, bytes).toString('base64url');
        expect(cipher.open(parts.join(':')).apiKey).toBeNull();
      }
    });

    it('rejects a malformed v2 value instead of throwing', () => {
      expect(cipher.open('v2:abc').apiKey).toBeNull();
      expect(cipher.open('v2:a:b:c:d').apiKey).toBeNull();
    });

    it('cannot be opened with a different secret', () => {
      expect(new ApiKeyCipher(SECRET_B).open(cipher.encrypt(KEY)).apiKey).toBeNull();
    });

    it('refuses to encrypt without a secret, rather than storing base64', () => {
      expect(() => new ApiKeyCipher(null).encrypt(KEY)).toThrow(EncryptionKeyMissingError);
      expect(new ApiKeyCipher(null).configured).toBe(false);
    });
  });

  describe('rotation', () => {
    it('opens a value sealed with the previous secret and marks it for re-sealing', () => {
      const sealedWithA = new ApiKeyCipher(SECRET_A).encrypt(KEY);
      const rotated = new ApiKeyCipher(SECRET_B, SECRET_A);

      expect(rotated.open(sealedWithA)).toEqual({ apiKey: KEY, stale: true });
      expect(rotated.open(rotated.encrypt(KEY))).toEqual({ apiKey: KEY, stale: false });
    });

    it('seals new values with the current secret, not the previous one', () => {
      const sealed = new ApiKeyCipher(SECRET_B, SECRET_A).encrypt(KEY);
      expect(new ApiKeyCipher(SECRET_B).open(sealed).apiKey).toBe(KEY);
      expect(new ApiKeyCipher(SECRET_A).open(sealed).apiKey).toBeNull();
    });

    it('ignores a previous secret that is the same as the current one', () => {
      const cipher = new ApiKeyCipher(SECRET_A, SECRET_A);
      expect(cipher.open(cipher.encrypt(KEY))).toEqual({ apiKey: KEY, stale: false });
    });
  });

  describe('older formats', () => {
    it('opens a v1 CBC value and marks it for re-sealing', () => {
      expect(new ApiKeyCipher(SECRET_A).open(sealV1(KEY, SECRET_A))).toEqual({ apiKey: KEY, stale: true });
    });

    it('opens a v1 value sealed under the previous secret', () => {
      expect(new ApiKeyCipher(SECRET_B, SECRET_A).open(sealV1(KEY, SECRET_A)).apiKey).toBe(KEY);
    });

    it('does not return garbage for a v1 value opened with the wrong secret', () => {
      for (let i = 0; i < 50; i++) {
        expect(new ApiKeyCipher(SECRET_B).open(sealV1(KEY, SECRET_A)).apiKey).toBeNull();
      }
    });

    it('opens the base64 that was stored when ENCRYPTION_KEY was missing', () => {
      const stored = Buffer.from(KEY).toString('base64');
      expect(new ApiKeyCipher(SECRET_A).open(stored)).toEqual({ apiKey: KEY, stale: true });
      // Readable even with no secret at all, which is exactly why it must be re-sealed.
      expect(new ApiKeyCipher(null).open(stored).apiKey).toBe(KEY);
    });

    /**
     * Real stored values the AI service accepts today: it trims and splits on commas, and
     * the Create Company form invites comma-separated lists. A shape check here locked
     * every one of these tenants out of AI on deploy.
     */
    it.each([
      ['a comma-separated list with spaces', 'AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA, AIzaSyBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'],
      ['a trailing space', `${KEY} `],
      ['a leading space', ` ${KEY}`],
      ['a trailing newline', `${KEY}
`],
      ['a trailing tab', `${KEY}	`],
      ['a non-breaking space', `${KEY} `],
      ['a short key', 'abc'],
    ])('opens a legacy value with %s, in both v1 and base64', (_label, value) => {
      const cipher = new ApiKeyCipher(SECRET_A);
      expect(cipher.open(sealV1(value, SECRET_A)).apiKey).toBe(value);
      expect(cipher.open(Buffer.from(value).toString('base64')).apiKey).toBe(value);
    });

    it('does not return binary noise as a key', () => {
      expect(new ApiKeyCipher(SECRET_A).open(crypto.randomBytes(32).toString('base64')).apiKey).toBeNull();
    });

    it('treats an empty value as no key', () => {
      expect(new ApiKeyCipher(SECRET_A).open('')).toEqual({ apiKey: null, stale: false });
      expect(new ApiKeyCipher(SECRET_A).open(null)).toEqual({ apiKey: null, stale: false });
    });
  });

  describe('rolling back to code from before v2', () => {
    it('fails cleanly on a v2 value instead of producing a fake key', () => {
      const sealed = new ApiKeyCipher(SECRET_A).encrypt(KEY);
      for (let i = 0; i < 20; i++) {
        expect(openWithPreV2Code(new ApiKeyCipher(SECRET_A).encrypt(KEY), SECRET_A)).toBe('[DECRYPTION_FAILED]');
      }
      expect(openWithPreV2Code(sealed, SECRET_A)).toBe('[DECRYPTION_FAILED]');
    });
  });

  describe('fromEnv', () => {
    it('treats only an empty or absent ENCRYPTION_KEY as missing', () => {
      expect(ApiKeyCipher.fromEnv({ ENCRYPTION_KEY: '' }).configured).toBe(false);
      expect(ApiKeyCipher.fromEnv({}).configured).toBe(false);
    });

    it('accepts a whitespace-only ENCRYPTION_KEY, which the old code used as a real secret', () => {
      const cipher = ApiKeyCipher.fromEnv({ ENCRYPTION_KEY: '   ' });
      expect(cipher.configured).toBe(true);
      expect(cipher.open(sealV1(KEY, '   ')).apiKey).toBe(KEY);
    });

    it('uses the secret exactly as set, so v1 values derived from it still open', () => {
      const padded = `${SECRET_A} `;
      const cipher = ApiKeyCipher.fromEnv({ ENCRYPTION_KEY: padded });
      expect(cipher.open(sealV1(KEY, padded)).apiKey).toBe(KEY);
    });

    it('reads ENCRYPTION_KEY_PREVIOUS', () => {
      const sealed = new ApiKeyCipher(SECRET_A).encrypt(KEY);
      const cipher = ApiKeyCipher.fromEnv({ ENCRYPTION_KEY: SECRET_B, ENCRYPTION_KEY_PREVIOUS: SECRET_A });
      expect(cipher.open(sealed)).toEqual({ apiKey: KEY, stale: true });
    });
  });
});
