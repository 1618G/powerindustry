/**
 * Settings Service - User account settings management
 */

import { userRepository, profileRepository, dataExportRepository, sessionRepository } from "~/repositories";
import { logAuditTrail } from "./soc2-compliance.server";
import { NotFoundError, ConflictError } from "~/lib/errors";

// ============================================
// Profile
// ============================================

/**
 * Get user with profile
 */
export async function getUserWithProfile(userId: string) {
  return userRepository.findByIdWithProfile(userId);
}

/**
 * Update user profile
 */
export async function updateProfile(
  userId: string,
  data: {
    name?: string;
    phone?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    location?: string | null;
    website?: string | null;
    bio?: string | null;
    timezone?: string;
  }
) {
  const user = await userRepository.findById(userId);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Update name on user record
  if (data.name !== undefined) {
    await userRepository.update(userId, { name: data.name });
  }

  // Update profile
  const { name, ...profileData } = data;
  await profileRepository.upsert(userId, profileData);

  await logAuditTrail(userId, "profile.updated", {
    resource: "profile",
  });

  return userRepository.findByIdWithProfile(userId);
}

// ============================================
// Data Export (GDPR)
// ============================================

/**
 * Get recent data export requests
 */
export async function getDataExportRequests(userId: string, limit: number = 5) {
  return dataExportRepository.findByUserId(userId, limit);
}

/**
 * Request data export
 */
export async function requestDataExport(userId: string): Promise<void> {
  // Check for pending request
  const pending = await dataExportRepository.findPendingByUserId(userId);
  if (pending) {
    throw new ConflictError("You already have a pending data export request");
  }

  await dataExportRepository.create({ userId });

  await logAuditTrail(userId, "data_export.requested", {});
}

// ============================================
// Sessions
// ============================================

/**
 * Count active sessions
 */
export async function countActiveSessions(userId: string): Promise<number> {
  return sessionRepository.countActiveByUserId(userId);
}

// ============================================
// Account Deletion
// ============================================

/**
 * Deactivate account (soft delete)
 */
export async function deactivateAccount(userId: string): Promise<void> {
  await userRepository.delete(userId);
  await sessionRepository.deleteByUserId(userId);

  await logAuditTrail(userId, "account.deleted", {});
}
