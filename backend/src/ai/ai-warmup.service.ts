import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiService } from './ai.service';

/**
 * Keeps the AI service awake.
 *
 * The AI service is a separate Render instance, and Render stops one that has been
 * idle. Waking it takes the better part of a minute, which is longer than the chat
 * call waits, so the first message after a quiet spell always failed. It failed
 * quietly too: every error path in the chat returns a message rather than throwing,
 * so the browser saw a perfectly ordinary 201 carrying "I'm having trouble connecting
 * to my AI brain right now". The request that failed was the one that woke the
 * service, so trying again worked and the failure looked random.
 *
 * A ping every ten minutes keeps it up, so the first real message of the day is
 * answered by a service that is already running.
 *
 * This only helps while the backend itself is awake. If both are idle overnight the
 * first visitor still pays for one cold start, which is a hosting-plan question
 * rather than something more code can fix.
 */
@Injectable()
export class AiWarmupService {
  private readonly logger = new Logger(AiWarmupService.name);

  /** Logged once per outage rather than every ten minutes for as long as it lasts. */
  private lastHealthy = true;

  constructor(private readonly ai: AiService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async keepAiServiceAwake(): Promise<void> {
    const health = await this.ai.isAiServiceHealthy();

    if (health.isHealthy) {
      if (!this.lastHealthy) this.logger.log('AI service is reachable again');
      this.lastHealthy = true;
      return;
    }

    if (this.lastHealthy) {
      this.logger.warn(
        `AI service did not answer the warm-up ping: ${health.error ?? health.status}`,
      );
    }
    this.lastHealthy = false;
  }
}
