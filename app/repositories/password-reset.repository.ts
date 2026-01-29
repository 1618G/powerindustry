/**
 * Password Reset Repository - Data access for password reset tokens
 */

import { db } from "~/lib/prisma";
import type { PasswordReset } from "@prisma/client";

// ============================================
// Types
// ============================================

export type PasswordResetWithUser = PasswordReset & {
  user: { id: string; email: string };
};

// ============================================
// Repository
// ============================================

class PasswordResetRepositoryClass {
  async findByToken(token: string): Promise<PasswordResetWithUser | null> {
    return db.passwordReset.findUnique({
      where: { token },
      include: {
        user: { select: { id: true, email: true } },
      },
    });
  }

  async findValidByToken(token: string): Promise<PasswordResetWithUser | null> {
    return db.passwordReset.findFirst({
      where: {
        token,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { select: { id: true, email: true } },
      },
    });
  }

  async create(userId: string, expiresInHours: number = 1): Promise<PasswordReset> {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    // Invalidate any existing tokens for this user
    await db.passwordReset.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return db.passwordReset.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });
  }

  async markUsed(token: string): Promise<void> {
    await db.passwordReset.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  }

  async deleteExpired(): Promise<number> {
    const result = await db.passwordReset.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { usedAt: { not: null } },
        ],
      },
    });
    return result.count;
  }
}

export const passwordResetRepository = new PasswordResetRepositoryClass();
