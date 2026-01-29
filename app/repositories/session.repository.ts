/**
 * Session Repository - Data access for Session entity
 *
 * PURPOSE: All database operations for user sessions
 *
 * LAYER: Repository (data access only)
 */

import { db } from "~/lib/prisma";

// ============================================
// Types
// ============================================

export interface CreateSessionInput {
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  deviceType?: string;
  location?: string;
}

// ============================================
// Repository Class
// ============================================

class SessionRepositoryClass {
  /**
   * Find session by token
   */
  async findByToken(token: string) {
    return db.session.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  /**
   * Find valid session by token
   */
  async findValidByToken(token: string) {
    return db.session.findFirst({
      where: {
        token,
        isValid: true,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });
  }

  /**
   * Find all sessions for a user
   */
  async findByUserId(userId: string) {
    return db.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Find active sessions for a user
   */
  async findActiveByUserId(userId: string) {
    return db.session.findMany({
      where: {
        userId,
        isValid: true,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Create a new session
   */
  async create(data: CreateSessionInput) {
    return db.session.create({
      data,
    });
  }

  /**
   * Invalidate session by token
   */
  async invalidateByToken(token: string) {
    return db.session.update({
      where: { token },
      data: { isValid: false },
    });
  }

  /**
   * Invalidate all sessions for a user
   */
  async invalidateAllByUserId(userId: string) {
    return db.session.updateMany({
      where: { userId },
      data: { isValid: false },
    });
  }

  /**
   * Invalidate all sessions for a user except current
   */
  async invalidateOthersByUserId(userId: string, currentToken: string) {
    return db.session.updateMany({
      where: {
        userId,
        token: { not: currentToken },
      },
      data: { isValid: false },
    });
  }

  /**
   * Delete expired sessions
   */
  async deleteExpired() {
    return db.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
  }

  /**
   * Delete session by ID
   */
  async delete(id: string) {
    return db.session.delete({
      where: { id },
    });
  }

  /**
   * Count active sessions for a user
   */
  async countActiveByUserId(userId: string): Promise<number> {
    return db.session.count({
      where: {
        userId,
        isValid: true,
        expiresAt: { gt: new Date() },
      },
    });
  }
}

export const sessionRepository = new SessionRepositoryClass();
