import { Logger } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

/**
 * Scrape all used to read every source inside the request, so two or three slow pages
 * outlasted the browser's two-minute wait. It now starts the work and returns.
 */
describe('KnowledgeService.scrapeAll', () => {
  beforeAll(() => Logger.overrideLogger(false));

  function harness(sourceCount: number) {
    const prisma: any = {
      user: { findUnique: jest.fn(async () => ({ companyId: 'c1', role: 'COMPANY_ADMIN' })) },
      knowledgeSource: {
        findMany: jest.fn(async () => Array.from({ length: sourceCount }, (_, i) => ({ id: `s${i}`, name: `Source ${i}` }))),
      },
    };
    const config: any = { get: (_k: string, d: string) => d };
    const service = new KnowledgeService(prisma, {} as any, config);
    const release: Array<() => void> = [];
    const scrape = jest
      .spyOn(service, 'scrapeSource')
      .mockImplementation(() => new Promise((resolve) => release.push(() => resolve({} as any))));
    return { service, scrape, release };
  }

  const flush = () => new Promise((r) => setImmediate(r));

  it('returns before any source has finished, and reads them one at a time', async () => {
    const { service, scrape, release } = harness(3);

    const result = await service.scrapeAll('u1');
    expect(result).toMatchObject({ started: true, total: 3 });
    expect(scrape).toHaveBeenCalledTimes(1);

    release[0]();
    await flush();
    expect(scrape).toHaveBeenCalledTimes(2);
  });

  it('does not start a second run for the same company while one is going', async () => {
    const { service, scrape, release } = harness(1);
    await service.scrapeAll('u1');
    expect(await service.scrapeAll('u1')).toMatchObject({ started: false, alreadyRunning: true });
    expect(scrape).toHaveBeenCalledTimes(1);

    release[0]();
    await flush();
    expect(await service.scrapeAll('u1')).toMatchObject({ started: true });
  });

  it('keeps going after a source fails', async () => {
    const { service, scrape } = harness(2);
    scrape.mockReset();
    scrape.mockRejectedValueOnce(new Error('page timed out')).mockResolvedValueOnce({} as any);
    await service.scrapeAll('u1');
    await flush();
    await flush();
    expect(scrape).toHaveBeenCalledTimes(2);
  });

  it('starts nothing when there are no active sources', async () => {
    const { service, scrape } = harness(0);
    expect(await service.scrapeAll('u1')).toMatchObject({ started: false, total: 0 });
    expect(scrape).not.toHaveBeenCalled();
  });
});
