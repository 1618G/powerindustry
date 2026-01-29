/**
 * Admin Service - Admin dashboard business logic
 */

import { userRepository, organizationRepository, subscriptionRepository } from "~/repositories";
import type { PaginationOptions, UserFilters } from "~/repositories";

// ============================================
// User Management
// ============================================

/**
 * List users with pagination
 */
export async function listUsers(options?: PaginationOptions, filters?: UserFilters) {
  return userRepository.findMany(options, filters);
}

/**
 * Get user by ID
 */
export async function getUserById(id: string) {
  return userRepository.findByIdWithProfile(id);
}

/**
 * Update user role
 */
export async function updateUserRole(userId: string, role: string) {
  return userRepository.update(userId, { role });
}

/**
 * Deactivate user
 */
export async function deactivateUser(userId: string) {
  return userRepository.update(userId, { isActive: false });
}

/**
 * Reactivate user
 */
export async function reactivateUser(userId: string) {
  return userRepository.update(userId, { isActive: true });
}

// ============================================
// Statistics
// ============================================

/**
 * Get user statistics
 */
export async function getUserStats() {
  const countByRole = await userRepository.countByRole();
  return {
    total: Object.values(countByRole).reduce((a, b) => a + b, 0),
    byRole: countByRole,
  };
}

/**
 * Get organization count
 */
export async function getOrganizationCount() {
  const result = await organizationRepository.findMany({ limit: 1 });
  return result.pagination.total;
}

/**
 * Get subscription statistics
 */
export async function getSubscriptionStats() {
  const result = await subscriptionRepository.findMany({ limit: 1 });
  return {
    total: result.pagination.total,
  };
}

/**
 * Get monthly revenue
 */
export async function getMonthlyRevenue(months: number = 12) {
  return subscriptionRepository.getMonthlyRevenue(months);
}
