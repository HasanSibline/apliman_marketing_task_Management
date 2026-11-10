import { InternalServerErrorException } from '@nestjs/common';
import { CompaniesService } from './companies.service';

/**
 * Saving a key with no ENCRYPTION_KEY used to store it as plain base64 and log a warning.
 * It must refuse instead, with a message an administrator can act on.
 */
describe('CompaniesService.encryptApiKey', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const service = () => new CompaniesService({} as any);

  it('refuses with a 500 that names the missing setting', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => service().encryptApiKey('gsk_live_key')).toThrow(InternalServerErrorException);
    expect(() => service().encryptApiKey('gsk_live_key')).toThrow(/ENCRYPTION_KEY/);
  });

  it('seals and opens a key when ENCRYPTION_KEY is set', () => {
    process.env.ENCRYPTION_KEY = 'a-test-secret';
    const sealed = service().encryptApiKey('gsk_live_key');
    expect(sealed.startsWith('v2:')).toBe(true);
    expect(service().openApiKey(sealed)).toEqual({ apiKey: 'gsk_live_key', stale: false });
    expect(service().decryptApiKey(sealed)).toBe('gsk_live_key');
  });
});
