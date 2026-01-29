/**
 * Subscription Repository - Data access for Subscription entity
 */

import { db } from "~/lib/prisma";
import type { Subscription, Payment } from "@prisma/client";
import { BaseRepository, type PaginationOptions, type PaginatedResult } from "./base.repository";

// ============================================
// Types
// ============================================

type SubscriptionStatus = "ACTIVE" | "CANCELED" | "PAST_DUE" | "UNPAID" | "TRIALING" | "INCOMPLETE" | "INCOMPLETE_EXPIRED";

export type SubscriptionWithOrg = Subscription & {
  organization: { id: string; name: string } | null;
};

export type CreateSubscriptionInput = {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  organizationId?: string;
  userId?: string;
  status: SubscriptionStatus;
  plan: string;
  interval: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  metadata?: Record<string, any>;
};

export type UpdateSubscriptionInput = Partial<{
  status: SubscriptionStatus;
  plan: string;
  stripePriceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  metadata: Record<string, any>;
}>;

// ============================================
// Repository
// ============================================

class SubscriptionRepositoryClass extends BaseRepository<Subscription, CreateSubscriptionInput, UpdateSubscriptionInput> {
  protected model = db.subscription;

  async findById(id: string): Promise<Subscription | null> {
    return db.subscription.findUnique({ where: { id } });
  }

  async findByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    return db.subscription.findUnique({ where: { stripeSubscriptionId } });
  }

  async findByOrganizationId(organizationId: string, activeOnly = true): Promise<Subscription | null> {
    return db.subscription.findFirst({
      where: {
        organizationId,
        ...(activeOnly ? { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findByCustomerId(stripeCustomerId: string): Promise<Subscription[]> {
    return db.subscription.findMany({
      where: { stripeCustomerId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findMany(options?: PaginationOptions): Promise<PaginatedResult<SubscriptionWithOrg>> {
    const { skip, take, page, limit } = this.getPaginationParams(options);

    const [data, total] = await Promise.all([
      db.subscription.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          organization: { select: { id: true, name: true } },
        },
      }),
      db.subscription.count(),
    ]);

    return {
      data,
      pagination: this.calculatePagination(total, page, limit),
    };
  }

  async create(data: CreateSubscriptionInput): Promise<Subscription> {
    return db.subscription.create({ data });
  }

  async update(id: string, data: UpdateSubscriptionInput): Promise<Subscription> {
    return db.subscription.update({
      where: { id },
      data,
    });
  }

  async updateByStripeId(stripeSubscriptionId: string, data: UpdateSubscriptionInput): Promise<Subscription> {
    return db.subscription.update({
      where: { stripeSubscriptionId },
      data,
    });
  }

  async delete(id: string): Promise<boolean> {
    await db.subscription.delete({ where: { id } });
    return true;
  }

  async cancel(id: string): Promise<void> {
    await db.subscription.update({
      where: { id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
      },
    });
  }

  // ============================================
  // Payment Methods
  // ============================================

  async createPayment(data: {
    stripePaymentId: string;
    stripeCustomerId: string;
    organizationId?: string;
    userId?: string;
    amount: number;
    currency: string;
    status: string;
    type: string;
    description?: string;
    receiptUrl?: string;
    invoiceId?: string;
  }): Promise<Payment> {
    return db.payment.create({ data });
  }

  async findPaymentsByOrganization(organizationId: string, limit = 10): Promise<Payment[]> {
    return db.payment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async getMonthlyRevenue(months = 12): Promise<{ month: string; revenue: number }[]> {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const payments = await db.payment.findMany({
      where: {
        status: "SUCCEEDED",
        createdAt: { gte: startDate },
      },
      select: { amount: true, createdAt: true },
    });

    const revenueByMonth = new Map<string, number>();
    
    for (const payment of payments) {
      const month = payment.createdAt.toISOString().slice(0, 7);
      revenueByMonth.set(month, (revenueByMonth.get(month) || 0) + payment.amount);
    }

    return Array.from(revenueByMonth.entries())
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}

export const subscriptionRepository = new SubscriptionRepositoryClass();
