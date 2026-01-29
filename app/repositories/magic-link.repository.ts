/**
 * Magic Link Repository - Data access for MagicLink entity
 *
 * PURPOSE: All database operations for magic link authentication
 *
 * LAYER: Repository (data access only)
 */

import { db } from "~/lib/prisma";

// ============================================
// Types
// ============================================

export interface CreateMagicLinkInput {
  userId: string;
  token: string; // Hashed token
  expiresAt: Date;
  ipAddress?: string;
}

// ============================================
// Repository Class
// ============================================

class MagicLinkRepositoryClass {
  /**
   * Find magic link by token
   */
  async findByToken(token: string) {
    return db.magicLink.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  /**
   * Find valid (unused, not expired) magic link by token
   */
  async findValidByToken(token: string) {
    return db.magicLink.findFirst({
      where: {
        token,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
  }

  /**
   * Find all magic links for a user
   */
  async findByUserId(userId: string) {
    return db.magicLink.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Create a new magic link
   */
  async create(data: CreateMagicLinkInput) {
    return db.magicLink.create({
      data,
    });
  }

  /**
   * Mark magic link as used
   */
  async markAsUsed(id: string) {
    return db.magicLink.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  /**
   * Delete all magic links for a user
   */
  async deleteAllByUserId(userId: string) {
    return db.magicLink.deleteMany({
      where: { userId },
    });
  }

  /**
   * Delete expired magic links (cleanup)
   */
  async deleteExpired() {
    return db.magicLink.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
  }

  /**
   * Delete used magic links older than X days (cleanup)
   */
  async deleteUsedOlderThan(days: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return db.magicLink.deleteMany({
      where: {
        usedAt: { not: null },
        createdAt: { lt: cutoffDate },
      },
    });
  }

  /**
   * Count pending magic links for a user (for rate limiting)
   */
  async countPendingByUserId(userId: string): Promise<number> {
    return db.magicLink.count({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
  }
}

export const magicLinkRepository = new MagicLinkRepositoryClass();
