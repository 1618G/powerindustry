/**
 * Payment Repository - Data access for Payment entity
 */

import { db } from "~/lib/prisma";
import type { Payment } from "@prisma/client";

// ============================================
// Types
// ============================================

export type CreatePaymentInput = {
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
};

export type UpdatePaymentInput = Partial<{
  status: string;
  receiptUrl: string;
}>;

// ============================================
// Repository
// ============================================

class PaymentRepositoryClass {
  async findById(id: string): Promise<Payment | null> {
    return db.payment.findUnique({ where: { id } });
  }

  async findByStripeId(stripePaymentId: string): Promise<Payment | null> {
    return db.payment.findUnique({ where: { stripePaymentId } });
  }

  async findByOrganization(organizationId: string, limit: number = 10): Promise<Payment[]> {
    return db.payment.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async findByUser(userId: string, limit: number = 10): Promise<Payment[]> {
    return db.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async create(data: CreatePaymentInput): Promise<Payment> {
    return db.payment.create({ data });
  }

  async update(id: string, data: UpdatePaymentInput): Promise<Payment> {
    return db.payment.update({
      where: { id },
      data,
    });
  }

  async upsertByStripeId(stripePaymentId: string, data: CreatePaymentInput): Promise<Payment> {
    return db.payment.upsert({
      where: { stripePaymentId },
      create: data,
      update: {
        status: data.status,
        receiptUrl: data.receiptUrl,
      },
    });
  }
}

export const paymentRepository = new PaymentRepositoryClass();
