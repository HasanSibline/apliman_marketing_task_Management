import * as crypto from 'crypto';

/**
 * Encrypts the AI provider keys companies store with us.
 *
 * Format: `v2:<keyId>:<iv>:<tag>:<ciphertext>`, AES-256-GCM, base64url parts.
 *
 * - GCM authenticates, so a wrong secret or a tampered value fails instead of decrypting
 *   to garbage that would then be sent to a provider as if it were a key.
 * - `keyId` names the secret that sealed it. During a rotation, ENCRYPTION_KEY is the new
 *   secret and ENCRYPTION_KEY_PREVIOUS the old one, and each value is opened with the
 *   secret it names.
 * - The separators are colons on purpose. Code from before v2 treats anything with a
 *   colon as `iv:ciphertext` and fails on it, which tells the admin to re-enter the key.
 *   Without a colon it would have base64-decoded it and sent the result as a key.
 *
 * Two older formats still open, and report themselves stale so callers re-seal them:
 * - v1, `ivHex:cipherHex`: AES-256-CBC under scrypt(secret, 'salt'). No integrity check.
 * - v0, plain base64. What v1 wrote when ENCRYPTION_KEY was missing or encryption threw.
 */

export const API_KEY_FORMAT = 'v2';

const V2_SALT = 'apliman/ai-provider-key/v2';
const V1_SALT = 'salt';
const TAG_BYTES = 16;

/** scrypt is deliberately slow; derive each (secret, salt) pair once per process. */
const derived = new Map<string, Buffer>();
function derive(secret: string, salt: string): Buffer {
  const cacheKey = `${salt}\u0000${secret}`;
  let key = derived.get(cacheKey);
  if (!key) {
    key = crypto.scryptSync(secret, salt, 32);
    derived.set(cacheKey, key);
  }
  return key;
}

function keyIdOf(key: Buffer): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
}

/**
 * Whether a legacy value decrypted to text rather than noise. CBC cannot tell a wrong
 * secret from the right one (its padding check passes 1 time in 256), so this is the
 * second filter: valid UTF-8 with no control characters besides whitespace.
 *
 * Deliberately loose about shape. Stored values include comma-separated key lists with
 * spaces ("k1, k2", which the Create Company form invites) and keys pasted with a trailing
 * newline; the AI service trims and splits them, and they work today. Rejecting them here
 * would lock those tenants out of AI on deploy.
 */
/** What Buffer#toString('utf8') puts where the bytes were not valid UTF-8. */
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

function looksLikeText(value: string): boolean {
  return value.trim().length > 0 && !value.includes(REPLACEMENT_CHARACTER) && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);
}

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super('ENCRYPTION_KEY is not set, so API keys cannot be stored safely.');
    this.name = 'EncryptionKeyMissingError';
  }
}

export interface OpenedApiKey {
  /** The plaintext key, or null when it cannot be opened with any configured secret. */
  apiKey: string | null;
  /** True when the value should be re-sealed: an older format, or the previous secret. */
  stale: boolean;
}

interface Secret {
  id: string;
  key: Buffer;
  raw: string;
}

export class ApiKeyCipher {
  private readonly current: Secret | null;
  private readonly secrets: Secret[];

  constructor(currentSecret?: string | null, previousSecret?: string | null) {
    const make = (raw: string): Secret => {
      const key = derive(raw, V2_SALT);
      return { id: keyIdOf(key), key, raw };
    };
    this.current = currentSecret ? make(currentSecret) : null;
    const previous = previousSecret && previousSecret !== currentSecret ? make(previousSecret) : null;
    this.secrets = [this.current, previous].filter((s): s is Secret => s !== null);
  }

  /** Read on each use, so a changed environment (and every test) sees its own values. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): ApiKeyCipher {
    // Used exactly as set, not trimmed: v1 values were derived from the raw string, and
    // a trailing space trimmed here would make every one of them unreadable. Only an
    // empty value counts as missing, as it did to the code that wrote v1.
    const value = (v?: string) => (v ? v : null);
    return new ApiKeyCipher(value(env.ENCRYPTION_KEY), value(env.ENCRYPTION_KEY_PREVIOUS));
  }

  get configured(): boolean {
    return this.current !== null;
  }

  encrypt(apiKey: string): string {
    if (!this.current) throw new EncryptionKeyMissingError();

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.current.key, iv, { authTagLength: TAG_BYTES });
    const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [API_KEY_FORMAT, this.current.id, b64(iv), b64(tag), b64(ciphertext)].join(':');
  }

  open(stored: string | null | undefined): OpenedApiKey {
    if (!stored) return { apiKey: null, stale: false };
    if (stored.startsWith(`${API_KEY_FORMAT}:`)) return this.openV2(stored);
    if (stored.includes(':')) return { apiKey: this.openV1(stored), stale: true };
    return { apiKey: openV0(stored), stale: true };
  }

  private openV2(stored: string): OpenedApiKey {
    const parts = stored.split(':');
    if (parts.length !== 5) return { apiKey: null, stale: false };
    const [, keyId, iv, tag, ciphertext] = parts;

    const secret = this.secrets.find((s) => s.id === keyId);
    if (!secret) return { apiKey: null, stale: false };

    try {
      // A truncated tag would otherwise be accepted, and a 4-byte tag is forgeable.
      const tagBytes = unb64(tag);
      if (tagBytes.length !== TAG_BYTES) return { apiKey: null, stale: false };
      const decipher = crypto.createDecipheriv('aes-256-gcm', secret.key, unb64(iv), { authTagLength: TAG_BYTES });
      decipher.setAuthTag(tagBytes);
      const apiKey = Buffer.concat([decipher.update(unb64(ciphertext)), decipher.final()]).toString('utf8');
      return { apiKey, stale: secret !== this.current };
    } catch {
      return { apiKey: null, stale: false };
    }
  }

  private openV1(stored: string): string | null {
    const [ivHex, cipherHex] = stored.split(':');
    for (const secret of this.secrets) {
      try {
        const decipher = crypto.createDecipheriv('aes-256-cbc', derive(secret.raw, V1_SALT), Buffer.from(ivHex, 'hex'));
        const apiKey = decipher.update(cipherHex, 'hex', 'utf8') + decipher.final('utf8');
        if (looksLikeText(apiKey)) return apiKey;
      } catch {
        // Wrong secret, most likely. Try the next one.
      }
    }
    return null;
  }
}

function openV0(stored: string): string | null {
  const apiKey = Buffer.from(stored, 'base64').toString('utf8');
  return looksLikeText(apiKey) ? apiKey : null;
}

function b64(buf: Buffer): string {
  return buf.toString('base64url');
}

function unb64(text: string): Buffer {
  return Buffer.from(text, 'base64url');
}
