import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompaniesService } from '../companies/companies.service';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { extendedEnd, subscriptionState, SubscriptionStateName } from './subscription-state';
import { forgetCompanyAccess } from './company-access-cache';

/** Most urgent first: who cannot work, who is about to stop, who needs a decision. */
const URGENCY: Record<SubscriptionStateName, number> = {
  EXPIRED: 0,
  GRACE: 1,
  DUE_SOON: 2,
  TRIAL: 3,
  SUSPENDED: 4,
  ACTIVE: 5,
};

/** Same fallback as CompaniesService.getPlanLimits for a plan missing from the table. */
const FALLBACK_MAX_USERS = 3;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: CompaniesService,
  ) {}

  /**
   * Every company with where it stands: subscription state, renewal, users against its
   * limit and its last payment. Five queries whatever the number of companies.
   */
  async overview(now: Date = new Date()) {
    const [companies, userCounts, plans, lastInvoices, collected] = await Promise.all([
      this.prisma.company.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          isActive: true,
          subscriptionStatus: true,
          subscriptionPlan: true,
          subscriptionEnd: true,
          monthlyPrice: true,
          billingEmail: true,
          maxUsers: true,
        },
      }),
      this.prisma.user.groupBy({
        by: ['companyId'],
        where: { companyId: { not: null }, status: { not: 'RETIRED' } },
        _count: { _all: true },
      }),
      this.prisma.plan.findMany({ select: { name: true, maxUsers: true } }),
      this.prisma.invoice.findMany({
        orderBy: { paidAt: 'desc' },
        distinct: ['companyId'],
        select: { companyId: true, number: true, amount: true, paidAt: true },
      }),
      this.prisma.invoice.aggregate({
        where: { paidAt: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } },
        _sum: { amount: true },
      }),
    ]);

    const activeByCompany = new Map(userCounts.map((r) => [r.companyId as string, r._count._all]));
    const planUsers = new Map(plans.map((p) => [p.name, p.maxUsers]));
    const lastByCompany = new Map(lastInvoices.map((i) => [i.companyId, i]));

    const rows = companies.map((c) => {
      const sub = subscriptionState(c, now);
      const maxUsers = c.maxUsers ?? planUsers.get(c.subscriptionPlan) ?? FALLBACK_MAX_USERS;
      const activeUsers = activeByCompany.get(c.id) ?? 0;
      const last = lastByCompany.get(c.id);
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        logo: c.logo,
        plan: c.subscriptionPlan,
        monthlyPrice: c.monthlyPrice,
        state: sub.state,
        subscriptionEnd: sub.subscriptionEnd,
        daysLeft: sub.daysLeft,
        graceEndsAt: sub.graceEndsAt,
        blocked: sub.blocked,
        billingEmail: c.billingEmail,
        activeUsers,
        maxUsers,
        overLimitBy: maxUsers < 0 ? 0 : Math.max(activeUsers - maxUsers, 0),
        lastInvoice: last ? { number: last.number, amount: last.amount, paidAt: last.paidAt } : null,
      };
    });

    rows.sort(
      (a, b) =>
        URGENCY[a.state] - URGENCY[b.state] ||
        (b.overLimitBy > 0 ? 1 : 0) - (a.overLimitBy > 0 ? 1 : 0) ||
        (a.subscriptionEnd?.getTime() ?? Infinity) - (b.subscriptionEnd?.getTime() ?? Infinity),
    );

    const count = (state: SubscriptionStateName) => rows.filter((r) => r.state === state).length;
    const overLimit = rows.filter((r) => r.overLimitBy > 0).length;

    return {
      summary: {
        needsAttention: rows.filter(
          (r) => ['DUE_SOON', 'GRACE', 'EXPIRED', 'TRIAL'].includes(r.state) || r.overLimitBy > 0,
        ).length,
        dueSoon: count('DUE_SOON'),
        trial: count('TRIAL'),
        grace: count('GRACE'),
        expired: count('EXPIRED'),
        suspended: count('SUSPENDED'),
        overLimit,
        collectedThisMonth: collected._sum.amount ?? 0,
      },
      companies: rows,
    };
  }

  async invoices(companyId?: string) {
    const rows = await this.prisma.invoice.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      include: { company: { select: { name: true, billingEmail: true } } },
    });
    return this.withRecorderNames(rows);
  }

  /**
   * Record a payment received outside the app, as a numbered invoice, and extend the
   * subscription by the months it covers.
   *
   * A suspended company stays suspended: suspension is a separate decision, undone
   * with Reactivate, and a payment is not always the reason for it.
   */
  async recordPayment(companyId: string, dto: RecordPaymentDto, recordedBy: string, now: Date = new Date()) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const { start, end } = extendedEnd(company.subscriptionEnd, dto.months, now);

    // A payment can carry a plan change, which is how a trial converts: the plan, and
    // the price that follows it, change in the same transaction as the payment.
    const plan = dto.plan || company.subscriptionPlan;
    const planChanged = plan !== company.subscriptionPlan;
    let planPrice = company.monthlyPrice;
    if (planChanged) {
      const target = await this.prisma.plan.findUnique({ where: { name: plan }, select: { price: true } });
      if (!target) throw new BadRequestException(`There is no plan called ${plan}.`);
      planPrice = target.price;
    }

    const invoice = await this.withUniqueNumber(now, (number) =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.invoice.create({
          data: {
            number,
            companyId,
            plan,
            amount: dto.amount,
            periodStart: start,
            periodEnd: end,
            paidAt: dto.paidAt ? new Date(dto.paidAt) : now,
            method: dto.method?.trim() || null,
            reference: dto.reference?.trim() || null,
            note: dto.note?.trim() || null,
            recordedBy,
          },
          include: { company: { select: { name: true, billingEmail: true } } },
        });
        await tx.company.update({
          where: { id: companyId },
          data: {
            subscriptionEnd: end,
            ...(company.subscriptionStatus === 'SUSPENDED' ? {} : { subscriptionStatus: 'ACTIVE' }),
            ...(planChanged ? { subscriptionPlan: plan, monthlyPrice: planPrice } : {}),
          },
        });
        if (planChanged) {
          await tx.subscriptionHistory.create({
            data: {
              companyId,
              action: 'PLAN_CHANGED',
              fromPlan: company.subscriptionPlan,
              toPlan: plan,
              reason: `Changed with payment ${number}`,
              performedBy: recordedBy,
            },
          });
        }
        await tx.subscriptionHistory.create({
          data: {
            companyId,
            action: 'RENEWED',
            toPlan: plan,
            amount: dto.amount,
            reason: `Payment recorded, invoice ${number}, ${dto.months} month(s)`,
            performedBy: recordedBy,
          },
        });
        return created;
      }),
    );

    forgetCompanyAccess(companyId);
    // Deliberately no user deactivation here, even on a move to a smaller plan. A
    // payment is not the place to lose people without a warning; a company left over
    // its limit shows on the billing page, where Apply limit is a confirmed action.

    const state = subscriptionState({ ...company, subscriptionPlan: plan, subscriptionEnd: end }, now);
    const [shaped] = await this.withRecorderNames([invoice]);
    return { invoice: shaped, subscriptionEnd: end, state: state.state };
  }

  applyUserLimit(companyId: string, performedBy: string) {
    return this.companies.retireUsersOverLimit(companyId, performedBy);
  }

  /**
   * INV-2026-0001, sequential within a year. Two payments recorded in the same instant
   * can pick the same number; the unique index turns that into P2002 and the loser
   * takes the next one.
   */
  private async withUniqueNumber<T>(now: Date, create: (number: string) => Promise<T>): Promise<T> {
    const prefix = `INV-${now.getUTCFullYear()}-`;
    for (let attempt = 0; ; attempt++) {
      const latest = await this.prisma.invoice.findFirst({
        where: { number: { startsWith: prefix } },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const next = (latest ? Number(latest.number.slice(prefix.length)) || 0 : 0) + 1;
      try {
        return await create(`${prefix}${String(next).padStart(4, '0')}`);
      } catch (error) {
        const duplicate = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!duplicate || attempt >= 4) throw error;
      }
    }
  }

  private async withRecorderNames<
    T extends { recordedBy: string | null; company: { name: string; billingEmail: string | null } },
  >(rows: T[]) {
    const ids = [...new Set(rows.map((r) => r.recordedBy).filter((id): id is string => !!id))];
    const users = ids.length
      ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, u.name]));
    return rows.map(({ company, ...row }) => ({
      ...row,
      companyName: company.name,
      billingEmail: company.billingEmail,
      recordedByName: row.recordedBy ? names.get(row.recordedBy) ?? null : null,
    }));
  }
}
