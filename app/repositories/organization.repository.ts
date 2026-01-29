/**
 * Organization Repository - Data access for Organization entity
 */

import { db } from "~/lib/prisma";
import type { Organization, Prisma } from "@prisma/client";
import { BaseRepository, type PaginationOptions, type PaginatedResult } from "./base.repository";

// ============================================
// Types
// ============================================

export type OrganizationWithMembers = Organization & {
  members: { id: string; email: string; name: string | null; role: string }[];
  owner: { id: string; email: string; name: string | null };
  _count: { members: number };
};

export type CreateOrganizationInput = {
  name: string;
  slug: string;
  ownerId: string;
  billingEmail?: string;
};

export type UpdateOrganizationInput = Partial<{
  name: string;
  slug: string;
  billingEmail: string;
  stripeCustomerId: string;
  settings: Record<string, any>;
}>;

// ============================================
// Repository
// ============================================

class OrganizationRepositoryClass extends BaseRepository<Organization, CreateOrganizationInput, UpdateOrganizationInput> {
  protected model = db.organization;

  async findById(id: string): Promise<Organization | null> {
    return db.organization.findUnique({ where: { id } });
  }

  async findByIdWithMembers(id: string): Promise<OrganizationWithMembers | null> {
    return db.organization.findUnique({
      where: { id },
      include: {
        members: {
          select: { id: true, email: true, name: true, role: true },
        },
        owner: {
          select: { id: true, email: true, name: true },
        },
        _count: { select: { members: true } },
      },
    });
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    return db.organization.findUnique({ where: { slug } });
  }

  async findByOwnerId(ownerId: string): Promise<Organization | null> {
    return db.organization.findFirst({ where: { ownerId } });
  }

  async findByMemberId(userId: string): Promise<Organization | null> {
    return db.organization.findFirst({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { id: userId } } },
        ],
      },
    });
  }

  async findMany(options?: PaginationOptions): Promise<PaginatedResult<Organization>> {
    const { skip, take, page, limit } = this.getPaginationParams(options);

    const [data, total] = await Promise.all([
      db.organization.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
      }),
      db.organization.count(),
    ]);

    return {
      data,
      pagination: this.calculatePagination(total, page, limit),
    };
  }

  async create(data: CreateOrganizationInput): Promise<Organization> {
    return db.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        ownerId: data.ownerId,
        billingEmail: data.billingEmail,
      },
    });
  }

  async update(id: string, data: UpdateOrganizationInput): Promise<Organization> {
    return db.organization.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<boolean> {
    await db.organization.delete({ where: { id } });
    return true;
  }

  async addMember(organizationId: string, userId: string): Promise<void> {
    await db.user.update({
      where: { id: userId },
      data: { organizationId },
    });
  }

  async removeMember(organizationId: string, userId: string): Promise<void> {
    await db.user.update({
      where: { id: userId, organizationId },
      data: { organizationId: null },
    });
  }

  async getMemberCount(id: string): Promise<number> {
    return db.user.count({ where: { organizationId: id } });
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const org = await db.organization.findFirst({
      where: {
        slug,
        id: excludeId ? { not: excludeId } : undefined,
      },
      select: { id: true },
    });
    return !!org;
  }
}

export const organizationRepository = new OrganizationRepositoryClass();
