/**
 * Invitation Repository - Data access for team invitations
 */

import { db } from "~/lib/prisma";
import type { Invitation } from "@prisma/client";

// ============================================
// Types
// ============================================

export type CreateInvitationInput = {
  organizationId: string;
  email: string;
  role?: string;
  invitedById: string;
  expiresAt?: Date;
};

export type InvitationWithOrg = Invitation & {
  organization: { name: string };
  invitedBy: { name: string | null; email: string };
};

// ============================================
// Repository
// ============================================

class InvitationRepositoryClass {
  async findById(id: string): Promise<Invitation | null> {
    return db.invitation.findUnique({ where: { id } });
  }

  async findByToken(token: string): Promise<InvitationWithOrg | null> {
    return db.invitation.findUnique({
      where: { token },
      include: {
        organization: { select: { name: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    });
  }

  async findByEmail(email: string, organizationId: string): Promise<Invitation | null> {
    return db.invitation.findFirst({
      where: {
        email: email.toLowerCase(),
        organizationId,
        acceptedAt: null,
      },
    });
  }

  async findPendingByOrganization(organizationId: string): Promise<Invitation[]> {
    return db.invitation.findMany({
      where: {
        organizationId,
        acceptedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(data: CreateInvitationInput): Promise<Invitation> {
    const token = crypto.randomUUID();
    const expiresAt = data.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return db.invitation.create({
      data: {
        organizationId: data.organizationId,
        email: data.email.toLowerCase(),
        role: data.role || "USER",
        invitedById: data.invitedById,
        token,
        expiresAt,
      },
    });
  }

  async accept(id: string): Promise<void> {
    await db.invitation.update({
      where: { id },
      data: { acceptedAt: new Date() },
    });
  }

  async delete(id: string): Promise<boolean> {
    await db.invitation.delete({ where: { id } });
    return true;
  }

  async deleteExpired(): Promise<number> {
    const result = await db.invitation.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
        acceptedAt: null,
      },
    });
    return result.count;
  }

  async updateExpiry(id: string, expiresAt: Date): Promise<void> {
    await db.invitation.update({
      where: { id },
      data: { expiresAt },
    });
  }
}

export const invitationRepository = new InvitationRepositoryClass();
