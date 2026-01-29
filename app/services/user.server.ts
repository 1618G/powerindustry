/**
 * User Service - Business logic for user operations
 * 
 * LAYER: Services (business logic)
 * IMPORTS FROM: Repositories (data access)
 * IMPORTED BY: Routes (controllers)
 */

import { userRepository, type UserWithProfile, type UserFilters, type PaginationOptions } from "~/repositories";
import { sessionRepository } from "~/repositories";
import { hashPassword, verifyPassword as verifyPwd } from "~/utils/auth.server";
import { logAuditTrail, logSecurityEvent } from "./soc2-compliance.server";
import { 
  NotFoundError, 
  UnauthorizedError, 
  ValidationError,
  AccountLockedError,
  ConflictError 
} from "~/lib/errors";

// ============================================
// Types
// ============================================

export type CreateUserData = {
  email: string;
  password?: string;
  name?: string;
  role?: string;
  organizationId?: string;
};

export type UpdateProfileData = {
  name?: string;
  phone?: string;
  company?: string;
  jobTitle?: string;
  location?: string;
  website?: string;
  bio?: string;
  timezone?: string;
};

// ============================================
// User CRUD
// ============================================

/**
 * Get user by ID
 */
export async function getUserById(id: string): Promise<UserWithProfile | null> {
  return userRepository.findByIdWithProfile(id);
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string) {
  return userRepository.findByEmail(email);
}

/**
 * List users with pagination and filters
 */
export async function listUsers(options?: PaginationOptions, filters?: UserFilters) {
  return userRepository.findMany(options, filters);
}

/**
 * Create new user
 */
export async function createUser(data: CreateUserData) {
  // Check if email already exists
  const exists = await userRepository.emailExists(data.email);
  if (exists) {
    throw new ConflictError("Email already registered");
  }

  // Hash password if provided
  const passwordHash = data.password ? await hashPassword(data.password) : undefined;

  const user = await userRepository.create({
    email: data.email,
    passwordHash,
    name: data.name,
    role: data.role,
    organizationId: data.organizationId,
  });

  await logAuditTrail(user.id, "user.created", {
    resource: "user",
    resourceId: user.id,
  });

  return user;
}

/**
 * Update user profile
 */
export async function updateProfile(userId: string, data: UpdateProfileData) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Import db only for profile update (repository pattern for Profile TBD)
  const { db } = await import("~/lib/prisma");
  
  // Update name on user
  if (data.name !== undefined) {
    await userRepository.update(userId, { name: data.name });
  }

  // Update profile
  await db.profile.upsert({
    where: { userId },
    create: {
      userId,
      phone: data.phone,
      company: data.company,
      jobTitle: data.jobTitle,
      location: data.location,
      website: data.website,
      bio: data.bio,
      timezone: data.timezone || "UTC",
    },
    update: {
      phone: data.phone,
      company: data.company,
      jobTitle: data.jobTitle,
      location: data.location,
      website: data.website,
      bio: data.bio,
      timezone: data.timezone,
    },
  });

  await logAuditTrail(userId, "profile.updated", {
    resource: "profile",
  });

  return userRepository.findByIdWithProfile(userId);
}

// ============================================
// Authentication
// ============================================

/**
 * Verify user credentials
 */
export async function verifyCredentials(email: string, password: string) {
  const user = await userRepository.findByEmailForAuth(email);
  
  if (!user) {
    // Don't reveal if user exists
    throw new UnauthorizedError("Invalid email or password");
  }

  // Check if account is locked
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AccountLockedError(user.lockedUntil);
  }

  // Check if account is active
  if (!user.isActive) {
    throw new UnauthorizedError("Account is deactivated");
  }

  // Verify password
  if (!user.passwordHash) {
    throw new UnauthorizedError("Please use OAuth to sign in");
  }

  const isValid = await verifyPwd(password, user.passwordHash);
  
  if (!isValid) {
    // Record failed attempt
    const attempts = await userRepository.recordFailedLogin(user.id);
    
    // Lock after 5 failed attempts
    if (attempts >= 5) {
      const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await userRepository.lockAccount(user.id, lockUntil);
      
      await logSecurityEvent(
        "account_locked",
        "high",
        `Account locked after ${attempts} failed attempts`,
        { userId: user.id }
      );
      
      throw new AccountLockedError(lockUntil);
    }
    
    throw new UnauthorizedError("Invalid email or password");
  }

  // Reset failed attempts on success
  await userRepository.resetLoginAttempts(user.id);

  return {
    id: user.id,
    email: user.email,
    mfaEnabled: user.mfaEnabled,
  };
}

/**
 * Change user password
 */
export async function changePassword(
  userId: string, 
  currentPassword: string, 
  newPassword: string
) {
  const user = await userRepository.findByEmailForAuth(
    (await userRepository.findById(userId))?.email || ""
  );

  if (!user?.passwordHash) {
    throw new ValidationError("Cannot change password for OAuth accounts");
  }

  const isValid = await verifyPwd(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new UnauthorizedError("Current password is incorrect");
  }

  const newHash = await hashPassword(newPassword);
  await userRepository.updatePassword(userId, newHash);

  await logAuditTrail(userId, "password.changed", {});

  return true;
}

// ============================================
// Email Verification
// ============================================

/**
 * Mark email as verified
 */
export async function verifyEmail(userId: string) {
  await userRepository.verifyEmail(userId);
  await logAuditTrail(userId, "email.verified", {});
}

/**
 * Check if email is verified
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const user = await userRepository.findById(userId);
  return user?.emailVerified ?? false;
}

// ============================================
// MFA
// ============================================

/**
 * Enable MFA for user
 */
export async function enableMfa(userId: string, secret: string) {
  await userRepository.setMfa(userId, true, secret);
  await logAuditTrail(userId, "mfa.enabled", {});
}

/**
 * Disable MFA for user
 */
export async function disableMfa(userId: string) {
  await userRepository.setMfa(userId, false, null);
  await logAuditTrail(userId, "mfa.disabled", {});
}

// ============================================
// Sessions
// ============================================

/**
 * Get user's active sessions
 */
export async function getUserSessions(userId: string) {
  return sessionRepository.findByUserId(userId);
}

/**
 * Revoke a specific session
 */
export async function revokeSession(userId: string, sessionId: string) {
  // Verify session belongs to user
  const session = await sessionRepository.findById(sessionId);
  if (!session || session.userId !== userId) {
    throw new NotFoundError("Session not found");
  }
  
  await sessionRepository.delete(sessionId);
  await logAuditTrail(userId, "session.revoked", { resourceId: sessionId });
}

/**
 * Revoke all user sessions
 */
export async function revokeAllSessions(userId: string) {
  const count = await sessionRepository.deleteByUserId(userId);
  await logAuditTrail(userId, "sessions.revoked_all", { details: { count } });
  return count;
}

// ============================================
// Account Management
// ============================================

/**
 * Deactivate user account (soft delete)
 */
export async function deactivateAccount(userId: string) {
  await userRepository.delete(userId);
  await sessionRepository.deleteByUserId(userId);
  await logAuditTrail(userId, "account.deactivated", {});
}

/**
 * Get user statistics (for admin)
 */
export async function getUserStats() {
  const countByRole = await userRepository.countByRole();
  return {
    total: Object.values(countByRole).reduce((a, b) => a + b, 0),
    byRole: countByRole,
  };
}
