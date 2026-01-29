/**
 * Plan Repository - Data access for Plan entity
 */

import { db } from "~/lib/prisma";
import type { Plan } from "@prisma/client";

// ============================================
// Types
// ============================================

export type CreatePlanInput = {
  name: string;
  slug: string;
  description?: string;
  price: number;
  currency?: string;
  interval: string;
  stripePriceId: string;
  features?: string[];
  limits?: Record<string, any>;
  isPopular?: boolean;
  isActive?: boolean;
  sortOrder?: number;
};

export type UpdatePlanInput = Partial<CreatePlanInput>;

// ============================================
// Repository
// ============================================

class PlanRepositoryClass {
  async findById(id: string): Promise<Plan | null> {
    return db.plan.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<Plan | null> {
    return db.plan.findUnique({ where: { slug } });
  }

  async findByStripePriceId(stripePriceId: string): Promise<Plan | null> {
    return db.plan.findFirst({ where: { stripePriceId } });
  }

  async findActive(): Promise<Plan[]> {
    return db.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async findAll(): Promise<Plan[]> {
    return db.plan.findMany({
      orderBy: { sortOrder: "asc" },
    });
  }

  async create(data: CreatePlanInput): Promise<Plan> {
    return db.plan.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        price: data.price,
        currency: data.currency || "usd",
        interval: data.interval,
        stripePriceId: data.stripePriceId,
        features: data.features || [],
        limits: data.limits || {},
        isPopular: data.isPopular ?? false,
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? 0,
      },
    });
  }

  async update(id: string, data: UpdatePlanInput): Promise<Plan> {
    return db.plan.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<boolean> {
    await db.plan.delete({ where: { id } });
    return true;
  }

  async setActive(id: string, isActive: boolean): Promise<void> {
    await db.plan.update({
      where: { id },
      data: { isActive },
    });
  }
}

export const planRepository = new PlanRepositoryClass();
