/**
 * Admin User Management Service - CRUD operations for user management
 */

import bcrypt from "bcryptjs";
import { db } from "~/lib/prisma";
import type { Role } from "@prisma/client";
import { logAuditEvent } from "./system-health.server";
import { sendEmail, welcomeEmail } from "./email.server";

// ============================================
// Types
// ============================================

export interface UserFilters {
  role?: Role;
  isActive?: boolean;
  emailVerified?: boolean;
  search?: string;
  sortBy?: "createdAt" | "email" | "name" | "lastLoginAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface CreateUserData {
  email: string;
  password?: string;
  name?: string;
  role?: Role;
  emailVerified?: boolean;
  sendWelcomeEmail?: boolean;
}

export interface UpdateUserData {
  email?: string;
  name?: string;
  role?: Role;
  isActive?: boolean;
  emailVerified?: boolean;
}

// ============================================
// List Users
// ============================================

export async function listUsers(filters: UserFilters = {}) {
  const {
    role,
    isActive,
    emailVerified,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
    limit = 50,
    offset = 0,
  } = filters;

  const where = {
    ...(role && { role }),
    ...(typeof isActive === "boolean" && { isActive }),
    ...(typeof emailVerified === "boolean" && { emailVerified }),
    ...(search && {
      OR: [
        { email: { contains: search, mode: "insensitive" as const } },
        { name: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
        profile: {
          select: { avatar: true },
        },
        _count: {
          select: {
            sessions: {
              where: { expiresAt: { gt: new Date() } },
            },
            oauthAccounts: true,
          },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      take: limit,
      skip: offset,
    }),
    db.user.count({ where }),
  ]);

  return { users, total, limit, offset };
}

// ============================================
// Get User Details
// ============================================

export async function getUserDetails(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      emailVerified: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      profile: true,
      oauthAccounts: {
        select: {
          id: true,
          provider: true,
          createdAt: true,
        },
      },
      sessions: {
        where: { expiresAt: { gt: new Date() } },
        select: {
          id: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      _count: {
        select: {
          files: { where: { status: "READY" } },
          contactMessages: true,
        },
      },
    },
  });
}

// ============================================
// Create User
// ============================================

export async function createUser(
  data: CreateUserData,
  adminUserId: string,
  request?: Request
) {
  const { email, password, name, role = "USER", emailVerified = false, sendWelcomeEmail: shouldSendEmail = true } = data;

  // Check if email already exists
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { success: false, error: "Email already exists" };
  }

  // Hash password if provided
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      name,
      role,
      emailVerified,
    },
  });

  // Log audit event
  await logAuditEvent("admin.user.create", {
    userId: adminUserId,
    resource: "user",
    resourceId: user.id,
    details: { email, role },
    ipAddress: request?.headers.get("x-forwarded-for") || undefined,
  });

  // Send welcome email
  if (shouldSendEmail && emailVerified) {
    await sendEmail({
      to: email,
      subject: `Welcome to ${process.env.APP_NAME || "ZZA Platform"}`,
      html: welcomeEmail(name || email),
    });
  }

  return { success: true, user };
}

// ============================================
// Update User
// ============================================

export async function updateUser(
  userId: string,
  data: UpdateUserData,
  adminUserId: string,
  request?: Request
) {
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { success: false, error: "User not found" };
  }

  // Check for email conflict
  if (data.email && data.email !== existing.email) {
    const emailExists = await db.user.findUnique({ where: { email: data.email } });
    if (emailExists) {
      return { success: false, error: "Email already in use" };
    }
  }

  const user = await db.user.update({
    where: { id: userId },
    data,
  });

  // Log audit event
  await logAuditEvent("admin.user.update", {
    userId: adminUserId,
    resource: "user",
    resourceId: userId,
    details: { changes: data },
    ipAddress: request?.headers.get("x-forwarded-for") || undefined,
  });

  return { success: true, user };
}

// ============================================
// Delete User
// ============================================

export async function deleteUser(
  userId: string,
  adminUserId: string,
  request?: Request
) {
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { success: false, error: "User not found" };
  }

  // Prevent self-deletion
  if (userId === adminUserId) {
    return { success: false, error: "Cannot delete your own account" };
  }

  // Soft delete - just deactivate
  await db.user.update({
    where: { id: userId },
    data: { isActive: false },
  });

  // Invalidate all sessions
  await db.session.deleteMany({ where: { userId } });

  // Log audit event
  await logAuditEvent("admin.user.delete", {
    userId: adminUserId,
    resource: "user",
    resourceId: userId,
    details: { email: existing.email },
    ipAddress: request?.headers.get("x-forwarded-for") || undefined,
  });

  return { success: true };
}

// ============================================
// Reset User Password
// ============================================

export async function resetUserPassword(
  userId: string,
  newPassword: string,
  adminUserId: string,
  request?: Request
) {
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { success: false, error: "User not found" };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await db.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Invalidate all sessions to force re-login
  await db.session.deleteMany({ where: { userId } });

  // Log audit event
  await logAuditEvent("admin.user.password_reset", {
    userId: adminUserId,
    resource: "user",
    resourceId: userId,
    ipAddress: request?.headers.get("x-forwarded-for") || undefined,
  });

  return { success: true };
}

// ============================================
// Toggle User Status
// ============================================

export async function toggleUserStatus(
  userId: string,
  adminUserId: string,
  request?: Request
) {
  const existing = await db.user.findUnique({ where: { id: userId } });
  if (!existing) {
    return { success: false, error: "User not found" };
  }

  if (userId === adminUserId) {
    return { success: false, error: "Cannot change your own status" };
  }

  const newStatus = !existing.isActive;

  await db.user.update({
    where: { id: userId },
    data: { isActive: newStatus },
  });

  // If deactivating, invalidate sessions
  if (!newStatus) {
    await db.session.deleteMany({ where: { userId } });
  }

  // Log audit event
  await logAuditEvent(`admin.user.${newStatus ? "activate" : "deactivate"}`, {
    userId: adminUserId,
    resource: "user",
    resourceId: userId,
    ipAddress: request?.headers.get("x-forwarded-for") || undefined,
  });

  return { success: true, isActive: newStatus };
}

// ============================================
// Impersonate User (for debugging)
// ============================================

export async function impersonateUser(
  targetUserId: string,
  adminUserId: string,
  request?: Request
) {
  const target = await db.user.findUnique({ where: { id: targetUserId } });
  if (!target) {
    return { success: false, error: "User not found" };
  }

  if (!target.isActive) {
    return { success: false, error: "Cannot impersonate inactive user" };
  }

  // Log audit event
  await logAuditEvent("admin.user.impersonate", {
    userId: adminUserId,
    resource: "user",
    resourceId: targetUserId,
    details: { targetEmail: target.email },
    ipAddress: request?.headers.get("x-forwarded-for") || undefined,
  });

  return { success: true, userId: targetUserId };
}

// ============================================
// Revoke All Sessions
// ============================================

export async function revokeAllSessions(
  userId: string,
  adminUserId: string,
  request?: Request
) {
  const result = await db.session.deleteMany({ where: { userId } });

  // Log audit event
  await logAuditEvent("admin.user.revoke_sessions", {
    userId: adminUserId,
    resource: "user",
    resourceId: userId,
    details: { sessionsRevoked: result.count },
    ipAddress: request?.headers.get("x-forwarded-for") || undefined,
  });

  return { success: true, count: result.count };
}

// ============================================
// Get User Statistics
// ============================================

export async function getUserStatistics() {
  const [
    totalUsers,
    activeUsers,
    verifiedUsers,
    adminUsers,
    recentSignups,
    recentLogins,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isActive: true } }),
    db.user.count({ where: { emailVerified: true } }),
    db.user.count({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] } } }),
    db.user.count({
      where: { createdAt: { gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    }),
    db.user.count({
      where: { lastLoginAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  return {
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    verifiedUsers,
    unverifiedUsers: totalUsers - verifiedUsers,
    adminUsers,
    recentSignups,
    recentLogins,
  };
}

