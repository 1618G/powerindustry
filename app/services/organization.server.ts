/**
 * Organization Service - Business logic for organization/team operations
 * 
 * LAYER: Services (business logic)
 * IMPORTS FROM: Repositories (data access)
 */

import { organizationRepository, subscriptionRepository } from "~/repositories";
import { logAuditTrail } from "./soc2-compliance.server";
import { NotFoundError, ForbiddenError, ConflictError } from "~/lib/errors";

// ============================================
// Types
// ============================================

export type CreateOrganizationData = {
  name: string;
  ownerId: string;
  billingEmail?: string;
};

// ============================================
// Organization CRUD
// ============================================

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string) {
  return organizationRepository.findById(id);
}

/**
 * Get organization with members
 */
export async function getOrganizationWithMembers(id: string) {
  return organizationRepository.findByIdWithMembers(id);
}

/**
 * Get organization by owner
 */
export async function getOrganizationByOwner(ownerId: string) {
  return organizationRepository.findByOwnerId(ownerId);
}

/**
 * Get organization for user (as owner or member)
 */
export async function getOrganizationForUser(userId: string) {
  return organizationRepository.findByMemberId(userId);
}

/**
 * Create new organization
 */
export async function createOrganization(data: CreateOrganizationData) {
  // Check if user already owns an org
  const existing = await organizationRepository.findByOwnerId(data.ownerId);
  if (existing) {
    throw new ConflictError("You already own an organization");
  }

  // Generate slug
  const baseSlug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let slug = baseSlug;
  let counter = 1;
  
  while (await organizationRepository.slugExists(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  const org = await organizationRepository.create({
    name: data.name,
    slug,
    ownerId: data.ownerId,
    billingEmail: data.billingEmail,
  });

  await logAuditTrail(data.ownerId, "organization.created", {
    resource: "organization",
    resourceId: org.id,
  });

  return org;
}

/**
 * Update organization
 */
export async function updateOrganization(
  orgId: string,
  userId: string,
  data: { name?: string; billingEmail?: string }
) {
  const org = await organizationRepository.findById(orgId);
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  if (org.ownerId !== userId) {
    throw new ForbiddenError("Only the owner can update organization settings");
  }

  const updated = await organizationRepository.update(orgId, data);

  await logAuditTrail(userId, "organization.updated", {
    resource: "organization",
    resourceId: orgId,
  });

  return updated;
}

// ============================================
// Member Management
// ============================================

/**
 * Add member to organization
 */
export async function addMember(orgId: string, userId: string, addedBy: string) {
  const org = await organizationRepository.findById(orgId);
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  if (org.ownerId !== addedBy) {
    throw new ForbiddenError("Only the owner can add members");
  }

  await organizationRepository.addMember(orgId, userId);

  await logAuditTrail(addedBy, "member.added", {
    resource: "organization",
    resourceId: orgId,
    details: { addedUserId: userId },
  });
}

/**
 * Remove member from organization
 */
export async function removeMember(orgId: string, userId: string, removedBy: string) {
  const org = await organizationRepository.findById(orgId);
  if (!org) {
    throw new NotFoundError("Organization not found");
  }

  if (org.ownerId !== removedBy) {
    throw new ForbiddenError("Only the owner can remove members");
  }

  if (userId === org.ownerId) {
    throw new ForbiddenError("Cannot remove the owner");
  }

  await organizationRepository.removeMember(orgId, userId);

  await logAuditTrail(removedBy, "member.removed", {
    resource: "organization",
    resourceId: orgId,
    details: { removedUserId: userId },
  });
}

/**
 * Get member count
 */
export async function getMemberCount(orgId: string) {
  return organizationRepository.getMemberCount(orgId);
}

// ============================================
// Subscription Helpers
// ============================================

/**
 * Get active subscription for organization
 */
export async function getActiveSubscription(orgId: string) {
  return subscriptionRepository.findByOrganizationId(orgId, true);
}

/**
 * Check if organization has active subscription
 */
export async function hasActiveSubscription(orgId: string): Promise<boolean> {
  const sub = await subscriptionRepository.findByOrganizationId(orgId, true);
  return !!sub;
}
