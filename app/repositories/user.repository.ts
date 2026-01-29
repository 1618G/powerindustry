/**
 * User Repository - Data access for User entity
 *
 * PURPOSE: All database operations for users
 * ONLY this file should import db for user operations
 *
 * LAYER: Repository (data access only)
 */

import { db } from "~/lib/prisma";
import type { User, Profile, Role, UserType } from "@prisma/client";
import {
  type PaginationOptions,
  type PaginatedResult,
  getPaginationParams,
  createPaginatedResult,
  userBasicSelect,
  userWithProfileSelect,
} from "./base.repository";

// ============================================
// Types
// ============================================

export type UserWithProfile = User & { profile: Profile | null };

export interface CreateUserInput {
  email: string;
  passwordHash?: string;
  name?: string;
  role?: Role;
  userType?: UserType;
  emailVerified?: boolean;
  // Spinney-specific fields
  dob?: Date;
  is18PlusVerified?: boolean;
  displayName?: string;
  handle?: string;
}

export interface UpdateUserInput {
  email?: string;
  passwordHash?: string;
  name?: string;
  role?: Role;
  userType?: UserType;
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
  isActive?: boolean;
  isSuspended?: boolean;
  suspendedReason?: string;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  failedLoginAttempts?: number;
  lockedUntil?: Date | null;
  passwordChangedAt?: Date;
  // Spinney-specific fields
  dob?: Date;
  is18PlusVerified?: boolean;
  displayName?: string;
  handle?: string;
  avatarUrl?: string;
  accessibilityPrefs?: Record<string, unknown>;
  privacyPrefs?: Record<string, unknown>;
}

export interface UserFilters {
  role?: Role;
  userType?: UserType;
  isActive?: boolean;
  isSuspended?: boolean;
  emailVerified?: boolean;
  search?: string;
  organizationId?: string;
}

// ============================================
// Repository Class
// ============================================

class UserRepositoryClass {
  /**
   * Find user by ID
   */
  async findById(id: string) {
    return db.user.findUnique({
      where: { id },
      select: userWithProfileSelect,
    });
  }

  /**
   * Find user by ID with full data
   */
  async findByIdFull(id: string) {
    return db.user.findUnique({
      where: { id },
      include: {
        profile: true,
        organization: true,
      },
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string) {
    return db.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * Find user by email with profile
   */
  async findByEmailWithProfile(email: string) {
    return db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { profile: true },
    });
  }

  /**
   * Find user by handle
   */
  async findByHandle(handle: string) {
    return db.user.findUnique({
      where: { handle: handle.toLowerCase() },
      include: { profile: true },
    });
  }

  /**
   * Check if handle exists
   */
  async handleExists(handle: string, excludeUserId?: string): Promise<boolean> {
    const user = await db.user.findUnique({
      where: { handle: handle.toLowerCase() },
      select: { id: true },
    });

    if (!user) return false;
    if (excludeUserId && user.id === excludeUserId) return false;
    return true;
  }

  /**
   * Create a new user
   */
  async create(data: CreateUserInput) {
    return db.user.create({
      data: {
        ...data,
        email: data.email.toLowerCase(),
        profile: {
          create: {},
        },
      },
      include: { profile: true },
    });
  }

  /**
   * Update user by ID
   */
  async update(id: string, data: UpdateUserInput) {
    return db.user.update({
      where: { id },
      data: {
        ...data,
        email: data.email?.toLowerCase(),
      },
      include: { profile: true },
    });
  }

  /**
   * Delete user by ID (soft delete recommended in production)
   */
  async delete(id: string) {
    return db.user.delete({
      where: { id },
    });
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivate(id: string, reason?: string) {
    return db.user.update({
      where: { id },
      data: {
        isActive: false,
        isSuspended: true,
        suspendedReason: reason || "Account deactivated",
      },
    });
  }

  /**
   * List users with filters and pagination
   */
  async findMany(
    filters: UserFilters = {},
    options: PaginationOptions = {}
  ): Promise<PaginatedResult<User>> {
    const { skip, take, orderBy } = getPaginationParams({
      sortBy: "createdAt",
      sortOrder: "desc",
      ...options,
    });

    const where = this.buildWhereClause(filters);

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        select: userBasicSelect,
        skip,
        take,
        orderBy,
      }),
      db.user.count({ where }),
    ]);

    return createPaginatedResult(users as User[], total, options);
  }

  /**
   * Count users matching filters
   */
  async count(filters: UserFilters = {}): Promise<number> {
    const where = this.buildWhereClause(filters);
    return db.user.count({ where });
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string, excludeUserId?: string): Promise<boolean> {
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    });

    if (!user) return false;
    if (excludeUserId && user.id === excludeUserId) return false;
    return true;
  }

  /**
   * Update last login
   */
  async updateLastLogin(id: string, ipAddress?: string) {
    return db.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  /**
   * Increment failed login attempts
   */
  async incrementFailedAttempts(id: string) {
    return db.user.update({
      where: { id },
      data: {
        failedLoginAttempts: { increment: 1 },
      },
    });
  }

  /**
   * Lock user account
   */
  async lockAccount(id: string, until: Date) {
    return db.user.update({
      where: { id },
      data: {
        lockedUntil: until,
      },
    });
  }

  /**
   * Verify email
   */
  async verifyEmail(id: string) {
    return db.user.update({
      where: { id },
      data: {
        emailVerified: true,
      },
    });
  }

  /**
   * Update password
   */
  async updatePassword(id: string, passwordHash: string) {
    return db.user.update({
      where: { id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  /**
   * Get user statistics for admin dashboard
   */
  async getStats() {
    const [total, active, admins, newToday, newThisWeek] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { isActive: true } }),
      db.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } }),
      db.user.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      db.user.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      total,
      active,
      admins,
      newToday,
      newThisWeek,
    };
  }

  // ============================================
  // Private Helpers
  // ============================================

  private buildWhereClause(filters: UserFilters) {
    const where: Record<string, unknown> = {};

    if (filters.role) where.role = filters.role;
    if (filters.userType) where.userType = filters.userType;
    if (typeof filters.isActive === "boolean") where.isActive = filters.isActive;
    if (typeof filters.isSuspended === "boolean")
      where.isSuspended = filters.isSuspended;
    if (typeof filters.emailVerified === "boolean")
      where.emailVerified = filters.emailVerified;
    if (filters.organizationId) where.organizationId = filters.organizationId;

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: "insensitive" } },
        { name: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return where;
  }
}

export const userRepository = new UserRepositoryClass();
