/**
 * Security Middleware - Apply security checks at the route level
 * 
 * This middleware provides a consistent way to apply security checks
 * across all routes in the application.
 * 
 * Features:
 * - Authentication (session, JWT, API key)
 * - Authorization (roles, permissions, ownership)
 * - Rate limiting
 * - CSRF protection
 * - Honeypot validation
 * - Request context/correlation IDs
 * - Audit logging
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { requireUser, requireAdmin, getUser } from "~/utils/auth.server";
import { withRateLimit } from "~/services/rate-limit.server";
import { validateRequest, getSecurityHeaders } from "~/services/security.server";
import { logSecurityEvent, logAuditTrail } from "~/services/soc2-compliance.server";
import { requireOwnership, requireOrgMembership, requirePermission } from "~/services/authorization.server";
import { validateCsrfToken, generateCsrfToken } from "~/services/csrf.server";
import { validateHoneypot, checkForBots } from "~/services/honeypot.server";
import { requireApiAuth, verifyAccessToken } from "~/services/jwt.server";
import { 
  createRequestContext, 
  runWithContextAsync, 
  getTracingHeaders,
  updateRequestContext 
} from "~/lib/request-context.server";
import type { ResourceType, Permission } from "~/services/authorization.server";

// ============================================
// Types
// ============================================

interface SecurityOptions {
  // Authentication requirements
  requireAuth?: boolean;
  requireAdmin?: boolean;
  
  // JWT/API authentication (for API routes)
  useJwtAuth?: boolean;
  
  // Resource ownership (IDOR protection)
  resourceType?: ResourceType;
  resourceIdParam?: string;  // e.g., "id", "conversationId", "fileId"
  
  // Organization membership
  requireOrgMembership?: boolean;
  orgIdParam?: string;
  requireOrgOwner?: boolean;
  
  // Permission-based access
  requiredPermission?: Permission;
  
  // Rate limiting
  rateLimit?: "auth" | "api" | "upload" | "strict" | "contact" | false;
  
  // CSRF protection
  validateCsrf?: boolean;
  
  // Honeypot validation
  validateHoneypot?: boolean;
  honeypotStrict?: boolean;  // Also check behavioral signals
  
  // Request context
  enableRequestContext?: boolean;
  
  // Audit logging
  auditAction?: string;
}

interface SecureContext {
  user: Awaited<ReturnType<typeof getUser>>;
  resource?: unknown;
  headers: Record<string, string>;
  /** JWT payload for API auth */
  jwtPayload?: {
    userId: string;
    role?: string;
    permissions?: string[];
  };
  /** CSRF token for forms */
  csrfToken?: string;
  /** Request ID for tracing */
  requestId?: string;
  /** Correlation ID for distributed tracing */
  correlationId?: string;
}

// ============================================
// Main Security Wrapper
// ============================================

/**
 * Secure wrapper for loader functions
 * 
 * @example
 * export const loader = secureLoader(
 *   { requireAuth: true, resourceType: "file", resourceIdParam: "fileId" },
 *   async ({ request, params, context }) => {
 *     const { user, resource } = context;
 *     return json({ file: resource });
 *   }
 * );
 */
export function secureLoader<T>(
  options: SecurityOptions,
  handler: (
    args: LoaderFunctionArgs & { context: SecureContext }
  ) => Promise<T>
) {
  return async (args: LoaderFunctionArgs): Promise<T> => {
    const context = await applySecurityChecks(args.request, args.params, options, "loader");
    return handler({ ...args, context });
  };
}

/**
 * Secure wrapper for action functions
 * 
 * @example
 * export const action = secureAction(
 *   { requireAuth: true, rateLimit: "strict", auditAction: "file.delete" },
 *   async ({ request, params, context }) => {
 *     // Delete logic here
 *   }
 * );
 */
export function secureAction<T>(
  options: SecurityOptions,
  handler: (
    args: ActionFunctionArgs & { context: SecureContext }
  ) => Promise<T>
) {
  return async (args: ActionFunctionArgs): Promise<T> => {
    const context = await applySecurityChecks(args.request, args.params, options, "action");
    return handler({ ...args, context });
  };
}

// ============================================
// Security Check Implementation
// ============================================

async function applySecurityChecks(
  request: Request,
  params: Record<string, string | undefined>,
  options: SecurityOptions,
  type: "loader" | "action"
): Promise<SecureContext> {
  const headers = getSecurityHeaders();
  let user: Awaited<ReturnType<typeof getUser>> = null;
  let resource: unknown = undefined;
  let jwtPayload: SecureContext["jwtPayload"] = undefined;
  let csrfToken: string | undefined = undefined;
  let requestId: string | undefined = undefined;
  let correlationId: string | undefined = undefined;

  // 0. Create request context for tracing
  if (options.enableRequestContext !== false) {
    const context = createRequestContext(request);
    requestId = context.requestId;
    correlationId = context.correlationId;
    
    // Add tracing headers to response
    Object.assign(headers, getTracingHeaders(context));
  }

  // 1. JWT/API Authentication (for API routes)
  if (options.useJwtAuth) {
    try {
      const auth = await requireApiAuth(request);
      jwtPayload = {
        userId: auth.userId,
        role: auth.role,
        permissions: auth.permissions,
      };
      // Skip session auth if JWT is used
      user = null;
    } catch (error) {
      await logSecurityEvent("jwt_auth_failed", "medium", 
        error instanceof Error ? error.message : "JWT authentication failed", {
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
        }
      );
      throw json({ error: "Authentication required" }, { status: 401, headers });
    }
  }

  // 2. CSRF validation (for actions)
  if (options.validateCsrf !== false && type === "action" && !options.useJwtAuth) {
    // First check basic request validation
    const validation = validateRequest(request);
    if (!validation.valid) {
      await logSecurityEvent("request_validation_failed", "high", validation.errors.join(", "));
      throw json({ error: "Invalid request" }, { status: 400, headers });
    }
    
    // Token-based CSRF validation
    try {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("form")) {
        const formData = await request.clone().formData();
        const token = formData.get("_csrf") as string | null;
        await validateCsrfToken(request, token);
      }
    } catch (error) {
      // Log but don't fail if CSRF token is missing (backwards compatibility)
      // Remove this try-catch for strict CSRF enforcement
      if (options.validateCsrf === true) {
        throw json({ error: "Invalid security token" }, { status: 403, headers });
      }
    }
  }

  // 3. Honeypot validation (for form submissions)
  if (options.validateHoneypot && type === "action") {
    try {
      const formData = await request.clone().formData();
      
      if (options.honeypotStrict) {
        // Full bot check with behavioral analysis
        const botCheck = await checkForBots(request, formData);
        if (botCheck.isBot) {
          await logSecurityEvent("bot_blocked", "medium", 
            `Bot submission blocked: ${botCheck.reasons.join("; ")}`, {
              ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
              metadata: { confidence: botCheck.confidence },
            }
          );
          throw json({ error: "Unable to process request" }, { status: 400, headers });
        }
      } else {
        // Simple honeypot check
        const honeypotResult = validateHoneypot(formData);
        if (honeypotResult.isBot) {
          await logSecurityEvent("honeypot_triggered", "medium", 
            `Honeypot triggered: ${honeypotResult.reason}`, {
              ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
            }
          );
          throw json({ error: "Unable to process request" }, { status: 400, headers });
        }
      }
    } catch (error) {
      if (error instanceof Response) throw error;
      // Ignore if formData parsing fails (not a form submission)
    }
  }

  // 4. Rate limiting
  if (options.rateLimit !== false) {
    const rateLimitKey = options.rateLimit || "api";
    const endpoint = new URL(request.url).pathname;
    const userId = jwtPayload?.userId || user?.id;
    
    const rateLimitResult = await withRateLimit(request, endpoint, rateLimitKey, userId);
    if (rateLimitResult instanceof Response) {
      throw rateLimitResult;
    }
    // Merge rate limit headers
    Object.assign(headers, rateLimitResult.headers);
  }

  // 5. Session Authentication (if not using JWT)
  if (!options.useJwtAuth) {
    if (options.requireAdmin) {
      user = await requireAdmin(request);
    } else if (options.requireAuth) {
      user = await requireUser(request);
    } else {
      user = await getUser(request);
    }
    
    // Update request context with user ID
    if (user && options.enableRequestContext !== false) {
      updateRequestContext({ userId: user.id });
    }
  }

  // 6. Generate CSRF token for loaders
  if (type === "loader" && !options.useJwtAuth) {
    try {
      const csrfResult = await generateCsrfToken(request);
      csrfToken = csrfResult.token;
      if (csrfResult.headers) {
        Object.assign(headers, csrfResult.headers);
      }
    } catch {
      // CSRF token generation is optional
    }
  }

  // 7. Organization membership
  if (options.requireOrgMembership && (user || jwtPayload)) {
    const orgId = params[options.orgIdParam || "organizationId"];
    if (!orgId) {
      throw json({ error: "Organization ID required" }, { status: 400, headers });
    }
    const userId = jwtPayload?.userId || user?.id;
    if (userId) {
      await requireOrgMembership(userId, orgId, {
        requireOwner: options.requireOrgOwner,
      });
    }
  }

  // 8. Resource ownership (IDOR protection)
  if (options.resourceType && options.resourceIdParam && (user || jwtPayload)) {
    const resourceId = params[options.resourceIdParam];
    if (!resourceId) {
      throw json({ error: "Resource ID required" }, { status: 400, headers });
    }
    
    const userId = jwtPayload?.userId || user?.id;
    if (userId) {
      resource = await requireOwnership(
        userId,
        options.resourceType,
        resourceId
      );
    }
  }

  // 9. Permission check
  if (options.requiredPermission && options.resourceType && (user || jwtPayload)) {
    const resourceId = options.resourceIdParam ? params[options.resourceIdParam] : undefined;
    const userId = jwtPayload?.userId || user?.id;
    if (userId) {
      await requirePermission(
        userId,
        options.resourceType,
        options.requiredPermission,
        resourceId
      );
    }
  }

  // 10. Audit logging
  if (options.auditAction && (user || jwtPayload)) {
    const resourceId = options.resourceIdParam ? params[options.resourceIdParam] : undefined;
    const userId = jwtPayload?.userId || user?.id || null;
    await logAuditTrail(userId, options.auditAction, {
      resource: options.resourceType,
      resourceId,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
      userAgent: request.headers.get("user-agent") || undefined,
    });
  }

  return { 
    user, 
    resource, 
    headers, 
    jwtPayload, 
    csrfToken,
    requestId,
    correlationId,
  };
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Quick authentication check - throws redirect if not authenticated
 */
export async function ensureAuthenticated(request: Request) {
  const user = await getUser(request);
  if (!user) {
    const url = new URL(request.url);
    throw redirect(`/login?redirectTo=${encodeURIComponent(url.pathname)}`);
  }
  return user;
}

/**
 * Quick admin check - throws redirect if not admin
 */
export async function ensureAdmin(request: Request) {
  const user = await ensureAuthenticated(request);
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    await logSecurityEvent("admin_access_denied", "medium", `User ${user.id} attempted admin access`);
    throw redirect("/dashboard?error=unauthorized");
  }
  return user;
}

/**
 * Ensure user owns a resource - throws 403 if not
 */
export async function ensureOwnership<T>(
  request: Request,
  resourceType: ResourceType,
  resourceId: string
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof getUser>>>; resource: T }> {
  const user = await ensureAuthenticated(request);
  const resource = await requireOwnership<T>(user.id, resourceType, resourceId);
  
  if (!resource) {
    throw json({ error: "Resource not found" }, { status: 404 });
  }
  
  return { user, resource };
}

// ============================================
// Route Security Patterns
// ============================================

/**
 * Standard secure patterns for common route types
 */
export const SecurityPatterns = {
  // Public route - no auth required
  public: {
    enableRequestContext: true,
  } as SecurityOptions,
  
  // Public form (e.g., contact, newsletter)
  publicForm: {
    enableRequestContext: true,
    validateCsrf: true,
    validateHoneypot: true,
    rateLimit: "contact",
  } as SecurityOptions,
  
  // Authenticated route - user must be logged in
  authenticated: {
    requireAuth: true,
    rateLimit: "api",
    enableRequestContext: true,
  } as SecurityOptions,
  
  // Authenticated form submission
  authenticatedForm: {
    requireAuth: true,
    validateCsrf: true,
    validateHoneypot: true,
    rateLimit: "api",
    enableRequestContext: true,
  } as SecurityOptions,
  
  // Admin route - admin role required
  admin: {
    requireAdmin: true,
    rateLimit: "api",
    auditAction: "admin.access",
    enableRequestContext: true,
  } as SecurityOptions,
  
  // Resource route - auth + ownership check
  resource: (resourceType: ResourceType, idParam: string = "id"): SecurityOptions => ({
    requireAuth: true,
    resourceType,
    resourceIdParam: idParam,
    rateLimit: "api",
    enableRequestContext: true,
  }),
  
  // Organization route - auth + org membership
  organization: (idParam: string = "organizationId", requireOwner = false): SecurityOptions => ({
    requireAuth: true,
    requireOrgMembership: true,
    orgIdParam: idParam,
    requireOrgOwner: requireOwner,
    rateLimit: "api",
    enableRequestContext: true,
  }),
  
  // Sensitive action - strict rate limiting + full validation
  sensitive: {
    requireAuth: true,
    rateLimit: "strict",
    validateCsrf: true,
    validateHoneypot: true,
    honeypotStrict: true,
    enableRequestContext: true,
    auditAction: "sensitive.action",
  } as SecurityOptions,
  
  // File upload - special limits
  upload: {
    requireAuth: true,
    rateLimit: "upload",
    enableRequestContext: true,
  } as SecurityOptions,
  
  // API endpoint (JWT/API key auth)
  api: {
    useJwtAuth: true,
    rateLimit: "api",
    enableRequestContext: true,
  } as SecurityOptions,
  
  // API endpoint with specific permission
  apiWithPermission: (permission: Permission, resourceType?: ResourceType): SecurityOptions => ({
    useJwtAuth: true,
    rateLimit: "api",
    requiredPermission: permission,
    resourceType,
    enableRequestContext: true,
  }),
  
  // Webhook endpoint (no auth, strict rate limit)
  webhook: {
    rateLimit: "strict",
    enableRequestContext: true,
  } as SecurityOptions,
};

// ============================================
// Export all for convenience
// ============================================

export {
  requireOwnership,
  requireOrgMembership,
  requirePermission,
  verifyOwnership,
  withOwnership,
} from "~/services/authorization.server";

export type { ResourceType, Permission } from "~/services/authorization.server";
