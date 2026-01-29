/**
 * Authorization Service - Robust IDOR Protection & Access Control
 * 
 * This service provides a centralized, consistent approach to authorization:
 * 1. Resource Ownership Verification (IDOR Prevention)
 * 2. Organization Membership Checks
 * 3. Role-Based Access Control (RBAC)
 * 4. Permission-Based Access Control
 * 
 * CRITICAL: Use these functions in EVERY route that accesses resources by ID
 */

import { redirect, json } from "@remix-run/node";
import { db } from "~/lib/prisma";
import { logSecurityEvent, logAuditTrail } from "./soc2-compliance.server";

// ============================================
// Types
// ============================================

export type ResourceType = 
  | "user"
  | "profile"
  | "organization"
  | "file"
  | "subscription"
  | "payment"
  | "apiKey"
  | "notification"
  | "conversation"
  | "chatMessage"
  | "webhook"
  | "invitation"
  | "auditLog"
  | "dataExportRequest";

export type Permission = 
  | "read"
  | "write"
  | "delete"
  | "admin"
  | "*";

export type Role = "USER" | "ADMIN" | "SUPER_ADMIN";

interface AuthorizationResult {
  authorized: boolean;
  reason?: string;
}

interface User {
  id: string;
  role: string;
  organizationId?: string | null;
}

// ============================================
// Core Authorization Functions
// ============================================

/**
 * Verify that a user owns a specific resource
 * Use this in EVERY route that fetches a resource by ID
 * 
 * @example
 * const file = await requireOwnership(user.id, "file", fileId);
 */
export async function requireOwnership<T>(
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  options: {
    throwOnFail?: boolean;
    redirectTo?: string;
  } = { throwOnFail: true }
): Promise<T | null> {
  const result = await verifyOwnership(userId, resourceType, resourceId);
  
  if (!result.authorized) {
    await logSecurityEvent(
      "authorization_denied",
      "medium",
      `User ${userId} attempted to access ${resourceType}:${resourceId} without ownership`,
      { userId }
    );

    if (options.throwOnFail) {
      if (options.redirectTo) {
        throw redirect(options.redirectTo);
      }
      throw json(
        { error: "Access denied", message: result.reason },
        { status: 403 }
      );
    }
    return null;
  }

  // Fetch and return the resource
  return await fetchResource<T>(resourceType, resourceId);
}

/**
 * Check ownership without fetching the resource
 */
export async function verifyOwnership(
  userId: string,
  resourceType: ResourceType,
  resourceId: string
): Promise<AuthorizationResult> {
  try {
    const ownershipMap: Record<ResourceType, () => Promise<boolean>> = {
      user: async () => userId === resourceId,
      
      profile: async () => {
        const profile = await db.profile.findUnique({
          where: { id: resourceId },
          select: { userId: true },
        });
        return profile?.userId === userId;
      },
      
      organization: async () => {
        const org = await db.organization.findFirst({
          where: {
            id: resourceId,
            OR: [
              { ownerId: userId },
              { members: { some: { id: userId } } },
            ],
          },
        });
        return !!org;
      },
      
      file: async () => {
        const file = await db.file.findUnique({
          where: { id: resourceId },
          select: { userId: true },
        });
        return file?.userId === userId;
      },
      
      subscription: async () => {
        const sub = await db.subscription.findUnique({
          where: { id: resourceId },
          select: { userId: true, organizationId: true },
        });
        if (sub?.userId === userId) return true;
        if (sub?.organizationId) {
          return await isOrgMember(userId, sub.organizationId);
        }
        return false;
      },
      
      payment: async () => {
        const payment = await db.payment.findUnique({
          where: { id: resourceId },
          select: { userId: true, organizationId: true },
        });
        if (payment?.userId === userId) return true;
        if (payment?.organizationId) {
          return await isOrgMember(userId, payment.organizationId);
        }
        return false;
      },
      
      apiKey: async () => {
        const key = await db.apiKey.findUnique({
          where: { id: resourceId },
          select: { userId: true, organizationId: true },
        });
        if (key?.userId === userId) return true;
        if (key?.organizationId) {
          return await isOrgOwner(userId, key.organizationId);
        }
        return false;
      },
      
      notification: async () => {
        const notification = await db.notification.findUnique({
          where: { id: resourceId },
          select: { userId: true },
        });
        return notification?.userId === userId;
      },
      
      conversation: async () => {
        const conv = await db.chatConversation.findUnique({
          where: { id: resourceId },
          select: { userId: true, visitorId: true },
        });
        return conv?.userId === userId;
      },
      
      chatMessage: async () => {
        const msg = await db.chatMessage.findUnique({
          where: { id: resourceId },
          select: { senderId: true, conversation: { select: { userId: true } } },
        });
        return msg?.senderId === userId || msg?.conversation.userId === userId;
      },
      
      webhook: async () => {
        const webhook = await db.webhook.findUnique({
          where: { id: resourceId },
          select: { organizationId: true },
        });
        if (!webhook) return false;
        return await isOrgOwner(userId, webhook.organizationId);
      },
      
      invitation: async () => {
        const invite = await db.invitation.findUnique({
          where: { id: resourceId },
          select: { organizationId: true },
        });
        if (!invite) return false;
        return await isOrgOwner(userId, invite.organizationId);
      },
      
      auditLog: async () => {
        // Only SUPER_ADMIN can access audit logs
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        return user?.role === "SUPER_ADMIN";
      },
      
      dataExportRequest: async () => {
        const request = await db.dataExportRequest.findUnique({
          where: { id: resourceId },
          select: { userId: true },
        });
        return request?.userId === userId;
      },
    };

    const checkOwnership = ownershipMap[resourceType];
    if (!checkOwnership) {
      return { authorized: false, reason: "Unknown resource type" };
    }

    const isOwner = await checkOwnership();
    return {
      authorized: isOwner,
      reason: isOwner ? undefined : "You do not have access to this resource",
    };
  } catch (error) {
    console.error("Authorization error:", error);
    return { authorized: false, reason: "Authorization check failed" };
  }
}

// ============================================
// Organization Access Control
// ============================================

/**
 * Verify user is a member of an organization
 */
export async function requireOrgMembership(
  userId: string,
  organizationId: string,
  options: {
    requireOwner?: boolean;
    throwOnFail?: boolean;
  } = { throwOnFail: true }
): Promise<boolean> {
  const isMember = options.requireOwner
    ? await isOrgOwner(userId, organizationId)
    : await isOrgMember(userId, organizationId);

  if (!isMember && options.throwOnFail) {
    await logSecurityEvent(
      "org_access_denied",
      "medium",
      `User ${userId} attempted to access organization ${organizationId}`,
      { userId }
    );
    throw json({ error: "Access denied" }, { status: 403 });
  }

  return isMember;
}

/**
 * Check if user is a member of an organization
 */
export async function isOrgMember(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const org = await db.organization.findFirst({
    where: {
      id: organizationId,
      OR: [
        { ownerId: userId },
        { members: { some: { id: userId } } },
      ],
    },
    select: { id: true },
  });
  return !!org;
}

/**
 * Check if user is the owner of an organization
 */
export async function isOrgOwner(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const org = await db.organization.findFirst({
    where: { id: organizationId, ownerId: userId },
    select: { id: true },
  });
  return !!org;
}

// ============================================
// Role-Based Access Control (RBAC)
// ============================================

/**
 * Check if user has required role
 */
export async function requireRole(
  userId: string,
  requiredRoles: Role | Role[],
  options: { throwOnFail?: boolean } = { throwOnFail: true }
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    if (options.throwOnFail) {
      throw json({ error: "User not found or inactive" }, { status: 403 });
    }
    return false;
  }

  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  const hasRole = roles.includes(user.role as Role) || user.role === "SUPER_ADMIN";

  if (!hasRole && options.throwOnFail) {
    await logSecurityEvent(
      "role_access_denied",
      "medium",
      `User ${userId} with role ${user.role} attempted action requiring ${roles.join(" or ")}`,
      { userId }
    );
    throw json({ error: "Insufficient permissions" }, { status: 403 });
  }

  return hasRole;
}

// ============================================
// Permission-Based Access Control
// ============================================

// Permission matrix: role -> resource -> permissions
const PERMISSIONS: Record<Role, Record<string, Permission[]>> = {
  USER: {
    "own:*": ["read", "write", "delete"],
    "profile": ["read", "write"],
    "file": ["read", "write", "delete"],
    "notification": ["read", "write"],
    "subscription": ["read"],
    "payment": ["read"],
  },
  ADMIN: {
    "own:*": ["*"],
    "user": ["read", "write"],
    "organization": ["read", "write"],
    "file": ["read", "write", "delete"],
    "auditLog": ["read"],
    "conversation": ["read", "write"],
  },
  SUPER_ADMIN: {
    "*": ["*"],
  },
};

/**
 * Check if user has permission for a specific action on a resource
 */
export async function requirePermission(
  userId: string,
  resourceType: ResourceType,
  permission: Permission,
  resourceId?: string,
  options: { throwOnFail?: boolean } = { throwOnFail: true }
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    if (options.throwOnFail) {
      throw json({ error: "User not found or inactive" }, { status: 403 });
    }
    return false;
  }

  const role = user.role as Role;
  const rolePerms = PERMISSIONS[role];

  // Super admin bypass
  if (rolePerms["*"]?.includes("*")) {
    return true;
  }

  // Check if user owns the resource (own:* permissions)
  if (resourceId) {
    const ownership = await verifyOwnership(userId, resourceType, resourceId);
    if (ownership.authorized && rolePerms["own:*"]?.includes(permission)) {
      return true;
    }
  }

  // Check resource-specific permissions
  const resourcePerms = rolePerms[resourceType] || [];
  const hasPermission = resourcePerms.includes(permission) || resourcePerms.includes("*");

  if (!hasPermission && options.throwOnFail) {
    await logSecurityEvent(
      "permission_denied",
      "medium",
      `User ${userId} denied ${permission} on ${resourceType}`,
      { userId }
    );
    throw json({ error: "Permission denied" }, { status: 403 });
  }

  return hasPermission;
}

// ============================================
// Secure Resource Fetching
// ============================================

/**
 * Fetch a resource by type and ID with ownership verification already done
 */
async function fetchResource<T>(
  resourceType: ResourceType,
  resourceId: string
): Promise<T | null> {
  const fetchMap: Record<ResourceType, () => Promise<unknown>> = {
    user: () => db.user.findUnique({ where: { id: resourceId } }),
    profile: () => db.profile.findUnique({ where: { id: resourceId } }),
    organization: () => db.organization.findUnique({ where: { id: resourceId } }),
    file: () => db.file.findUnique({ where: { id: resourceId } }),
    subscription: () => db.subscription.findUnique({ where: { id: resourceId } }),
    payment: () => db.payment.findUnique({ where: { id: resourceId } }),
    apiKey: () => db.apiKey.findUnique({ where: { id: resourceId } }),
    notification: () => db.notification.findUnique({ where: { id: resourceId } }),
    conversation: () => db.chatConversation.findUnique({ 
      where: { id: resourceId },
      include: { messages: true, tags: true },
    }),
    chatMessage: () => db.chatMessage.findUnique({ where: { id: resourceId } }),
    webhook: () => db.webhook.findUnique({ where: { id: resourceId } }),
    invitation: () => db.invitation.findUnique({ where: { id: resourceId } }),
    auditLog: () => db.auditLog.findUnique({ where: { id: resourceId } }),
    dataExportRequest: () => db.dataExportRequest.findUnique({ where: { id: resourceId } }),
  };

  const fetch = fetchMap[resourceType];
  if (!fetch) return null;

  return await fetch() as T | null;
}

// ============================================
// Query Helpers for Secure Queries
// ============================================

/**
 * Build a WHERE clause that includes ownership check
 * Use this in list/search queries to ensure user only sees their data
 */
export function withOwnership(
  userId: string,
  resourceType: ResourceType,
  additionalWhere: Record<string, unknown> = {}
): Record<string, unknown> {
  const ownershipFilters: Record<ResourceType, Record<string, unknown>> = {
    user: { id: userId },
    profile: { userId },
    organization: {
      OR: [
        { ownerId: userId },
        { members: { some: { id: userId } } },
      ],
    },
    file: { userId },
    subscription: {
      OR: [
        { userId },
        { organization: { members: { some: { id: userId } } } },
      ],
    },
    payment: {
      OR: [
        { userId },
        { organization: { members: { some: { id: userId } } } },
      ],
    },
    apiKey: {
      OR: [
        { userId },
        { organization: { ownerId: userId } },
      ],
    },
    notification: { userId },
    conversation: { userId },
    chatMessage: {
      OR: [
        { senderId: userId },
        { conversation: { userId } },
      ],
    },
    webhook: { organization: { ownerId: userId } },
    invitation: { organization: { ownerId: userId } },
    auditLog: { userId },
    dataExportRequest: { userId },
  };

  return {
    ...ownershipFilters[resourceType],
    ...additionalWhere,
  };
}

// ============================================
// Admin Override (with audit logging)
// ============================================

/**
 * Allow admin to access any resource, but log it
 */
export async function adminOverride(
  adminId: string,
  resourceType: ResourceType,
  resourceId: string,
  action: string
): Promise<boolean> {
  const admin = await db.user.findUnique({
    where: { id: adminId },
    select: { role: true, isActive: true },
  });

  if (!admin?.isActive || (admin.role !== "ADMIN" && admin.role !== "SUPER_ADMIN")) {
    return false;
  }

  // Log admin override
  await logAuditTrail(adminId, `admin.override.${action}`, {
    resource: resourceType,
    resourceId,
    severity: "warning",
  });

  return true;
}

// ============================================
// Convenience Middleware Functions
// ============================================

/**
 * Combined auth check for routes - authentication + ownership
 */
export async function authorizeResourceAccess(
  request: Request,
  resourceType: ResourceType,
  resourceId: string,
  permission: Permission = "read"
): Promise<{ user: User; authorized: boolean }> {
  // This would typically be called with a user already fetched
  // But shown here for completeness
  const { getUser } = await import("~/utils/auth.server");
  const user = await getUser(request);
  
  if (!user) {
    throw redirect("/login");
  }

  const authorized = await requirePermission(
    user.id,
    resourceType,
    permission,
    resourceId,
    { throwOnFail: false }
  );

  if (!authorized) {
    const ownership = await verifyOwnership(user.id, resourceType, resourceId);
    if (!ownership.authorized) {
      throw json({ error: "Access denied" }, { status: 403 });
    }
  }

  return { user, authorized: true };
}
