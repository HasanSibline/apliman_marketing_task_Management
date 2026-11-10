import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';
import { AiGatewayService } from './ai-gateway.service';
import { ApiKeyCipher } from '../common/crypto/api-key-cipher';

/**
 * Stored keys move to the current format by themselves: on boot, and on first use.
 * A rotation of ENCRYPTION_KEY is finished by one deploy with ENCRYPTION_KEY_PREVIOUS set.
 */

const OLD = 'old-secret';
const NEW = 'new-secret';
const KEY = 'gsk_live_0123456789abcdefghijklmnopqrstuvwxyz';

function sealV1(apiKey: string, secret: string): string {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv('aes-256-cbc', crypto.scryptSync(secret, 'salt', 32), iv);
  return `${iv.toString('hex')}:${c.update(apiKey, 'utf8', 'hex')}${c.final('hex')}`;
}

function harness(opts: {
  current: string | null;
  previous?: string;
  configs?: { id: string; companyId: string; encryptedKey: string }[];
  companies?: { id: string; aiApiKey: string }[];
  /** Simulates an admin saving a new key between our read and our write. */
  raceOn?: string;
}) {
  const cipher = new ApiKeyCipher(opts.current, opts.previous);
  const rows = new Map((opts.configs ?? []).map((c) => [c.id, { ...c }]));
  const companyRows = new Map((opts.companies ?? []).map((c) => [c.id, { ...c }]));

  const prisma = {
    aiProviderConfig: {
      findMany: jest.fn(async () => [...rows.values()]),
      update: jest.fn(async () => ({})),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = rows.get(where.id);
        if (!row || row.encryptedKey !== where.encryptedKey || opts.raceOn === where.id) return { count: 0 };
        row.encryptedKey = data.encryptedKey;
        return { count: 1 };
      }),
    },
    company: {
      findMany: jest.fn(async () => [...companyRows.values()]),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const row = companyRows.get(where.id);
        if (!row || row.aiApiKey !== where.aiApiKey) return { count: 0 };
        row.aiApiKey = data.aiApiKey;
        return { count: 1 };
      }),
    },
  };
  const companies = {
    encryptionConfigured: () => cipher.configured,
    openApiKey: (s: string) => cipher.open(s),
    encryptApiKey: (k: string) => cipher.encrypt(k),
  };

  const gateway = new AiGatewayService(prisma as any, companies as any);
  return { gateway, prisma, rows, companyRows, cipher };
}

beforeAll(() => Logger.overrideLogger(false));

describe('resealStoredKeys', () => {
  it('moves v1, base64 and previous-secret values to v2 under the current secret', async () => {
    const { gateway, rows, companyRows } = harness({
      current: NEW,
      previous: OLD,
      configs: [
        { id: 'cbc', companyId: 'c1', encryptedKey: sealV1(KEY, OLD) },
        { id: 'plain', companyId: 'c1', encryptedKey: Buffer.from(KEY).toString('base64') },
        { id: 'prev', companyId: 'c1', encryptedKey: new ApiKeyCipher(OLD).encrypt(KEY) },
        { id: 'fresh', companyId: 'c1', encryptedKey: new ApiKeyCipher(NEW).encrypt(KEY) },
      ],
      companies: [{ id: 'c2', aiApiKey: sealV1(KEY, OLD) }],
    });
    const freshBefore = rows.get('fresh')!.encryptedKey;

    expect(await gateway.resealStoredKeys()).toEqual({ resealed: 4, unreadable: 0 });

    const onlyNew = new ApiKeyCipher(NEW);
    for (const row of rows.values()) expect(onlyNew.open(row.encryptedKey)).toEqual({ apiKey: KEY, stale: false });
    expect(onlyNew.open(companyRows.get('c2')!.aiApiKey)).toEqual({ apiKey: KEY, stale: false });
    expect(rows.get('fresh')!.encryptedKey).toBe(freshBefore);
  });

  it('counts but never touches a value it cannot open', async () => {
    const unreadable = new ApiKeyCipher('some-other-secret').encrypt(KEY);
    const { gateway, rows, prisma } = harness({
      current: NEW,
      configs: [{ id: 'lost', companyId: 'c1', encryptedKey: unreadable }],
    });

    expect(await gateway.resealStoredKeys()).toEqual({ resealed: 0, unreadable: 1 });
    expect(rows.get('lost')!.encryptedKey).toBe(unreadable);
    expect(prisma.aiProviderConfig.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing without ENCRYPTION_KEY, and does not read the table', async () => {
    const { gateway, prisma } = harness({ current: null, configs: [] });
    expect(await gateway.resealStoredKeys()).toEqual({ resealed: 0, unreadable: 0 });
    expect(prisma.aiProviderConfig.findMany).not.toHaveBeenCalled();
  });

  it('never overwrites a key an admin replaced in the meantime', async () => {
    const { gateway, rows } = harness({
      current: NEW,
      configs: [{ id: 'raced', companyId: 'c1', encryptedKey: sealV1(KEY, NEW) }],
      raceOn: 'raced',
    });
    const before = rows.get('raced')!.encryptedKey;

    expect(await gateway.resealStoredKeys()).toEqual({ resealed: 0, unreadable: 0 });
    expect(rows.get('raced')!.encryptedKey).toBe(before);
  });
});

describe('a stale key met during a real call', () => {
  const entry = { id: 'cbc', provider: 'groq', priority: 1, enabled: true, isEmergency: false, status: 'HEALTHY', createdAt: new Date(0) };

  it('is used for the call and re-sealed in place', async () => {
    const stored = sealV1(KEY, NEW);
    const { gateway, rows } = harness({ current: NEW, configs: [{ id: 'cbc', companyId: 'c1', encryptedKey: stored }] });

    const credential = await (gateway as any).credentialFor(entry, 'c1', {
      companyName: 'Acme',
      keys: new Map([['cbc', stored]]),
    });

    expect(credential.apiKey).toBe(KEY);
    expect(new ApiKeyCipher(NEW).open(rows.get('cbc')!.encryptedKey)).toEqual({ apiKey: KEY, stale: false });
  });

  it('still answers when re-sealing fails', async () => {
    const stored = sealV1(KEY, NEW);
    const { gateway, prisma } = harness({ current: NEW, configs: [{ id: 'cbc', companyId: 'c1', encryptedKey: stored }] });
    prisma.aiProviderConfig.updateMany.mockRejectedValueOnce(new Error('connection lost'));

    const credential = await (gateway as any).credentialFor(entry, 'c1', {
      companyName: 'Acme',
      keys: new Map([['cbc', stored]]),
    });
    expect(credential.apiKey).toBe(KEY);
  });
});

describe('credentialFor, other paths', () => {
  const chain = (id: string, stored: string) => ({ companyName: 'Acme', keys: new Map([[id, stored]]) });
  const entryFor = (id: string) => ({ id, provider: 'groq', priority: 1, enabled: true, isEmergency: false, status: 'HEALTHY', createdAt: new Date(0) });

  it('retires an entry whose key will not open, and says why', async () => {
    const stored = new ApiKeyCipher('lost-secret').encrypt(KEY);
    const { gateway, prisma } = harness({ current: NEW, configs: [{ id: 'gone', companyId: 'c1', encryptedKey: stored }] });

    expect(await (gateway as any).credentialFor(entryFor('gone'), 'c1', chain('gone', stored))).toBeNull();
    expect(prisma.aiProviderConfig.update).toHaveBeenCalledWith({
      where: { id: 'gone' },
      data: { status: 'INVALID_KEY', lastError: 'Key could not be decrypted. Re-enter it.' },
    });
  });

  it('re-seals a legacy company key on use', async () => {
    const stored = sealV1(KEY, NEW);
    const { gateway, companyRows } = harness({ current: NEW, companies: [{ id: 'c9', aiApiKey: stored }] });

    const credential = await (gateway as any).credentialFor(entryFor('legacy'), 'c9', chain('legacy', stored));

    expect(credential).toMatchObject({ apiKey: KEY, configId: null });
    expect(new ApiKeyCipher(NEW).open(companyRows.get('c9')!.aiApiKey)).toEqual({ apiKey: KEY, stale: false });
  });

  it('without ENCRYPTION_KEY, still uses a base64 key and does not try to re-seal it', async () => {
    const stored = Buffer.from(KEY).toString('base64');
    const { gateway, prisma } = harness({ current: null, configs: [{ id: 'b64', companyId: 'c1', encryptedKey: stored }] });

    const credential = await (gateway as any).credentialFor(entryFor('b64'), 'c1', chain('b64', stored));

    expect(credential.apiKey).toBe(KEY);
    expect(prisma.aiProviderConfig.updateMany).not.toHaveBeenCalled();
  });
});

describe('onApplicationBootstrap', () => {
  it('returns at once and swallows a failing sweep', async () => {
    const { gateway, prisma } = harness({ current: NEW });
    prisma.aiProviderConfig.findMany.mockRejectedValueOnce(new Error('database unreachable'));

    expect(gateway.onApplicationBootstrap()).toBeUndefined();
    // Let the rejected sweep settle; an unhandled rejection would fail the test run.
    await new Promise((resolve) => setImmediate(resolve));
    expect(prisma.aiProviderConfig.findMany).toHaveBeenCalled();
  });
});
