import { PrismaService } from '../prisma/prisma.service';
import { MicrosoftService } from '../microsoft/microsoft.service';

/**
 * The one place a ticket notification decides whether to also try email.
 *
 * There is no SMTP or transactional-email provider configured for this platform, so
 * this is not "email notifications" in the general sense: it rides the Microsoft
 * Graph connection a user already has (or does not) from meeting sync, sending to
 * their own inbox as them. A user who has never connected gets nothing here and
 * nothing changes for them; the in-app notification this always runs alongside is
 * still their only signal, same as before this existed.
 *
 * `CompanySettings.emailNotifications` (default true) is the per-company kill switch
 * that already existed in the schema before this had anything to gate. Read as
 * "true unless a settings row exists and says otherwise", so a company with no
 * settings row at all is not silently opted out of something it never configured.
 *
 * Fire-and-forget by design: a ticket action's own response must never wait on, or
 * fail because of, an email that is a courtesy on top of the real notification.
 */
export async function sendTicketMail(
  deps: { prisma: PrismaService; microsoft: MicrosoftService },
  opts: { userId: string; companyId: string; subject: string; bodyHtml: string },
): Promise<void> {
  try {
    const settings = await deps.prisma.companySettings.findUnique({
      where: { companyId: opts.companyId },
      select: { emailNotifications: true },
    });
    if (settings?.emailNotifications === false) return;

    await deps.microsoft.sendMail(opts.userId, opts.subject, opts.bodyHtml);
  } catch {
    // sendMail already swallows its own failures and returns false; this catch is
    // only for the settings lookup above it, for the same reason.
  }
}
