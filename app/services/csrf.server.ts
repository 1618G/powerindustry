/**
 * CSRF Protection Service - Token-based Cross-Site Request Forgery prevention
 *
 * PURPOSE: Generate and validate CSRF tokens to prevent unauthorized form submissions
 *
 * USAGE:
 * // In loader - generate token
 * const csrfToken = await generateCsrfToken(request);
 * return json({ csrfToken });
 *
 * // In action - validate token
 * await validateCsrfToken(request, formData.get("csrf"));
 *
 * LAYER: Security Service
 */

import crypto from "crypto";
import { getSession, commitSession } from "~/utils/session.server";
import { ForbiddenError } from "~/lib/errors";
import { logSecurityEvent } from "./soc2-compliance.server";
import { cache } from "~/lib/redis.server";

// ============================================
// Configuration
// ============================================

const CSRF_TOKEN_LENGTH = 32;
const CSRF_TOKEN_TTL = 3600; // 1 hour in seconds
const CSRF_COOKIE_NAME = "_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_FORM_FIELD = "_csrf";

// ============================================
// Token Generation
// ============================================

/**
 * Generate a cryptographically secure CSRF token
 */
function generateToken(): string {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
}

/**
 * Create a signed token with timestamp for additional security
 */
function signToken(token: string, secret: string): string {
  const timestamp = Date.now().toString(36);
  const data = `${timestamp}.${token}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("hex");
  return `${data}.${signature}`;
}

/**
 * Verify a signed token
 */
function verifySignedToken(
  signedToken: string,
  secret: string,
  maxAgeMs: number = CSRF_TOKEN_TTL * 1000
): { valid: boolean; token?: string; expired?: boolean } {
  const parts = signedToken.split(".");
  if (parts.length !== 3) {
    return { valid: false };
  }

  const [timestamp, token, providedSignature] = parts;
  
  // Verify signature
  const data = `${timestamp}.${token}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("hex");

  // Use timing-safe comparison
  const sigBuffer = Buffer.from(providedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  
  if (sigBuffer.length !== expectedBuffer.length) {
    return { valid: false };
  }

  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { valid: false };
  }

  // Check expiration
  const tokenTime = parseInt(timestamp, 36);
  if (Date.now() - tokenTime > maxAgeMs) {
    return { valid: false, expired: true };
  }

  return { valid: true, token };
}

// ============================================
// Session-based CSRF (Synchronizer Token Pattern)
// ============================================

/**
 * Generate a CSRF token and store it in the session
 * Returns both the token and updated session headers
 */
export async function generateCsrfToken(request: Request): Promise<{
  token: string;
  headers?: Record<string, string>;
}> {
  const session = await getSession(request);
  const secret = process.env.SESSION_SECRET || "fallback-secret";
  
  // Generate new token
  const rawToken = generateToken();
  const signedToken = signToken(rawToken, secret);
  
  // Store in session
  session.set(CSRF_COOKIE_NAME, rawToken);
  
  const cookie = await commitSession(session);
  
  return {
    token: signedToken,
    headers: { "Set-Cookie": cookie },
  };
}

/**
 * Validate CSRF token from form data or headers
 * Throws ForbiddenError if validation fails
 */
export async function validateCsrfToken(
  request: Request,
  providedToken?: string | null
): Promise<void> {
  const session = await getSession(request);
  const secret = process.env.SESSION_SECRET || "fallback-secret";
  
  // Get token from form data, header, or parameter
  let token = providedToken;
  
  if (!token) {
    // Try header
    token = request.headers.get(CSRF_HEADER_NAME);
  }
  
  if (!token) {
    await logCsrfFailure(request, "missing_token");
    throw new ForbiddenError("CSRF token missing");
  }

  // Verify the signed token
  const verification = verifySignedToken(token, secret);
  
  if (!verification.valid) {
    const reason = verification.expired ? "expired_token" : "invalid_signature";
    await logCsrfFailure(request, reason);
    throw new ForbiddenError(
      verification.expired ? "CSRF token expired" : "Invalid CSRF token"
    );
  }

  // Compare with session token
  const sessionToken = session.get(CSRF_COOKIE_NAME);
  
  if (!sessionToken || sessionToken !== verification.token) {
    await logCsrfFailure(request, "token_mismatch");
    throw new ForbiddenError("CSRF token mismatch");
  }
}

/**
 * Validate CSRF and return result instead of throwing
 */
export async function isCsrfValid(
  request: Request,
  providedToken?: string | null
): Promise<{ valid: boolean; error?: string }> {
  try {
    await validateCsrfToken(request, providedToken);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Invalid CSRF token",
    };
  }
}

// ============================================
// Double Submit Cookie Pattern (Stateless)
// ============================================

/**
 * Generate a CSRF token using double-submit cookie pattern
 * Useful for stateless applications
 */
export function generateDoubleSubmitToken(): {
  cookieValue: string;
  formValue: string;
  headers: Record<string, string>;
} {
  const secret = process.env.SESSION_SECRET || "fallback-secret";
  const token = generateToken();
  const signedToken = signToken(token, secret);
  
  // Create secure cookie
  const isProduction = process.env.NODE_ENV === "production";
  const cookieOptions = [
    `${CSRF_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    isProduction ? "Secure" : "",
    `Max-Age=${CSRF_TOKEN_TTL}`,
  ].filter(Boolean).join("; ");

  return {
    cookieValue: token,
    formValue: signedToken,
    headers: { "Set-Cookie": cookieOptions },
  };
}

/**
 * Validate double-submit CSRF token
 */
export function validateDoubleSubmitToken(
  cookieValue: string | null,
  formValue: string | null
): { valid: boolean; error?: string } {
  if (!cookieValue || !formValue) {
    return { valid: false, error: "CSRF token missing" };
  }

  const secret = process.env.SESSION_SECRET || "fallback-secret";
  const verification = verifySignedToken(formValue, secret);

  if (!verification.valid) {
    return {
      valid: false,
      error: verification.expired ? "CSRF token expired" : "Invalid CSRF token",
    };
  }

  if (cookieValue !== verification.token) {
    return { valid: false, error: "CSRF token mismatch" };
  }

  return { valid: true };
}

// ============================================
// Request-based CSRF (Per-Request Tokens)
// ============================================

/**
 * Generate a one-time CSRF token stored in Redis
 * More secure but requires Redis
 */
export async function generateOneTimeToken(
  userId?: string
): Promise<string> {
  const secret = process.env.SESSION_SECRET || "fallback-secret";
  const token = generateToken();
  const signedToken = signToken(token, secret);
  
  // Store in cache with TTL
  const cacheKey = `csrf:${token}`;
  await cache.set(cacheKey, { 
    userId, 
    createdAt: Date.now() 
  }, CSRF_TOKEN_TTL);

  return signedToken;
}

/**
 * Validate and consume a one-time CSRF token
 */
export async function validateOneTimeToken(
  token: string,
  expectedUserId?: string
): Promise<{ valid: boolean; error?: string }> {
  const secret = process.env.SESSION_SECRET || "fallback-secret";
  const verification = verifySignedToken(token, secret);

  if (!verification.valid) {
    return {
      valid: false,
      error: verification.expired ? "Token expired" : "Invalid token",
    };
  }

  const cacheKey = `csrf:${verification.token}`;
  const stored = await cache.get<{ userId?: string; createdAt: number }>(cacheKey);

  if (!stored) {
    return { valid: false, error: "Token not found or already used" };
  }

  // Verify user if specified
  if (expectedUserId && stored.userId && stored.userId !== expectedUserId) {
    return { valid: false, error: "Token user mismatch" };
  }

  // Delete token (one-time use)
  await cache.del(cacheKey);

  return { valid: true };
}

// ============================================
// Logging
// ============================================

async function logCsrfFailure(request: Request, reason: string): Promise<void> {
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  const userAgent = request.headers.get("user-agent") || undefined;
  const url = new URL(request.url);

  await logSecurityEvent("csrf_validation_failed", "high", `CSRF validation failed: ${reason}`, {
    ipAddress,
    userAgent,
    metadata: {
      reason,
      path: url.pathname,
      method: request.method,
      referer: request.headers.get("referer"),
      origin: request.headers.get("origin"),
    },
  });
}

// ============================================
// Middleware Helper
// ============================================

/**
 * CSRF protection middleware for actions
 * Use in action functions to automatically validate CSRF
 */
export async function withCsrfProtection<T>(
  request: Request,
  handler: () => Promise<T>
): Promise<T> {
  // Skip for safe methods (should not have side effects)
  const safeMethodPattern = /^(GET|HEAD|OPTIONS)$/i;
  if (safeMethodPattern.test(request.method)) {
    return handler();
  }

  // Get token from form data
  const contentType = request.headers.get("content-type") || "";
  
  if (contentType.includes("application/x-www-form-urlencoded") || 
      contentType.includes("multipart/form-data")) {
    const formData = await request.clone().formData();
    const token = formData.get(CSRF_FORM_FIELD) as string | null;
    await validateCsrfToken(request, token);
  } else if (contentType.includes("application/json")) {
    // For JSON requests, check header
    const token = request.headers.get(CSRF_HEADER_NAME);
    await validateCsrfToken(request, token);
  }

  return handler();
}

// ============================================
// Exports
// ============================================

export {
  CSRF_FORM_FIELD,
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
};
