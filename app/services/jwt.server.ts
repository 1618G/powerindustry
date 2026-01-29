/**
 * JWT Service - Stateless Token-based Authentication
 *
 * PURPOSE: Generate and validate JWT tokens for API authentication
 *
 * USAGE:
 * // Generate token
 * const token = await createAccessToken({ userId: "123", role: "USER" });
 *
 * // Validate token
 * const payload = await verifyAccessToken(token);
 *
 * // In API routes
 * const auth = await requireApiAuth(request);
 *
 * LAYER: Security Service
 */

import crypto from "crypto";
import { cache } from "~/lib/redis.server";
import { UnauthorizedError, ForbiddenError } from "~/lib/errors";
import { logSecurityEvent, logAuditTrail } from "./soc2-compliance.server";

// ============================================
// Configuration
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "jwt-secret";
const JWT_ISSUER = process.env.APP_NAME || "ZZA Platform";
const JWT_AUDIENCE = process.env.APP_URL || "http://localhost:8163";

// Token expiration times
const ACCESS_TOKEN_TTL = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days
const API_KEY_TOKEN_TTL = 365 * 24 * 60 * 60; // 1 year

// ============================================
// Types
// ============================================

export interface JWTHeader {
  alg: "HS256" | "HS384" | "HS512";
  typ: "JWT";
}

export interface JWTPayload {
  // Standard claims
  iss: string;        // Issuer
  sub: string;        // Subject (user ID)
  aud: string;        // Audience
  exp: number;        // Expiration time
  nbf: number;        // Not before
  iat: number;        // Issued at
  jti: string;        // JWT ID (unique identifier)

  // Custom claims
  type: "access" | "refresh" | "api_key";
  role?: string;
  permissions?: string[];
  organizationId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
}

export interface VerifiedToken {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
  expired?: boolean;
}

// ============================================
// Base64URL Encoding (RFC 7515)
// ============================================

function base64UrlEncode(data: string | Buffer): string {
  const base64 = Buffer.isBuffer(data)
    ? data.toString("base64")
    : Buffer.from(data).toString("base64");
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(data: string): string {
  const padding = 4 - (data.length % 4);
  const padded = data + "=".repeat(padding === 4 ? 0 : padding);
  const base64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

// ============================================
// JWT Creation
// ============================================

/**
 * Create a signed JWT token
 */
function createToken(
  payload: Omit<JWTPayload, "iss" | "aud" | "iat" | "nbf" | "jti">,
  options: {
    algorithm?: "HS256" | "HS384" | "HS512";
    secret?: string;
  } = {}
): string {
  const algorithm = options.algorithm || "HS256";
  const secret = options.secret || JWT_SECRET;

  const header: JWTHeader = {
    alg: algorithm,
    typ: "JWT",
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    nbf: now,
    jti: crypto.randomUUID(),
  };

  const headerBase64 = base64UrlEncode(JSON.stringify(header));
  const payloadBase64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signatureInput = `${headerBase64}.${payloadBase64}`;

  // Create signature
  const hashAlgorithm = algorithm.replace("HS", "sha");
  const signature = crypto
    .createHmac(hashAlgorithm, secret)
    .update(signatureInput)
    .digest();
  const signatureBase64 = base64UrlEncode(signature);

  return `${signatureInput}.${signatureBase64}`;
}

/**
 * Verify and decode a JWT token
 */
function verifyToken(
  token: string,
  options: {
    secret?: string;
    algorithms?: Array<"HS256" | "HS384" | "HS512">;
  } = {}
): VerifiedToken {
  const secret = options.secret || JWT_SECRET;
  const allowedAlgorithms = options.algorithms || ["HS256", "HS384", "HS512"];

  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid token format" };
    }

    const [headerBase64, payloadBase64, signatureBase64] = parts;

    // Decode and verify header
    const header: JWTHeader = JSON.parse(base64UrlDecode(headerBase64));
    if (!allowedAlgorithms.includes(header.alg)) {
      return { valid: false, error: "Invalid algorithm" };
    }

    // Verify signature
    const signatureInput = `${headerBase64}.${payloadBase64}`;
    const hashAlgorithm = header.alg.replace("HS", "sha");
    const expectedSignature = crypto
      .createHmac(hashAlgorithm, secret)
      .update(signatureInput)
      .digest();
    const expectedSignatureBase64 = base64UrlEncode(expectedSignature);

    // Timing-safe comparison
    const providedSig = Buffer.from(signatureBase64);
    const expectedSig = Buffer.from(expectedSignatureBase64);
    
    if (providedSig.length !== expectedSig.length || 
        !crypto.timingSafeEqual(providedSig, expectedSig)) {
      return { valid: false, error: "Invalid signature" };
    }

    // Decode payload
    const payload: JWTPayload = JSON.parse(base64UrlDecode(payloadBase64));

    // Verify claims
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { valid: false, error: "Token expired", expired: true, payload };
    }

    if (payload.nbf && payload.nbf > now) {
      return { valid: false, error: "Token not yet valid" };
    }

    if (payload.iss !== JWT_ISSUER) {
      return { valid: false, error: "Invalid issuer" };
    }

    return { valid: true, payload };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Token verification failed",
    };
  }
}

// ============================================
// Access Token Operations
// ============================================

/**
 * Create an access token for user authentication
 */
export async function createAccessToken(data: {
  userId: string;
  role?: string;
  permissions?: string[];
  organizationId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL;

  return createToken({
    sub: data.userId,
    exp,
    type: "access",
    role: data.role,
    permissions: data.permissions,
    organizationId: data.organizationId,
    sessionId: data.sessionId,
    metadata: data.metadata,
  });
}

/**
 * Verify an access token
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const result = verifyToken(token);

  if (!result.valid) {
    throw new UnauthorizedError(result.error || "Invalid token");
  }

  if (result.payload?.type !== "access") {
    throw new UnauthorizedError("Invalid token type");
  }

  // Check if token is revoked
  const isRevoked = await cache.exists(`revoked:${result.payload.jti}`);
  if (isRevoked) {
    throw new UnauthorizedError("Token has been revoked");
  }

  return result.payload;
}

// ============================================
// Refresh Token Operations
// ============================================

/**
 * Create a refresh token
 */
export async function createRefreshToken(data: {
  userId: string;
  sessionId?: string;
}): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL;

  const token = createToken({
    sub: data.userId,
    exp,
    type: "refresh",
    sessionId: data.sessionId,
  });

  // Store refresh token reference in cache for revocation checking
  const payload = verifyToken(token);
  if (payload.valid && payload.payload) {
    await cache.set(
      `refresh:${payload.payload.jti}`,
      { userId: data.userId, sessionId: data.sessionId },
      REFRESH_TOKEN_TTL
    );
  }

  return token;
}

/**
 * Verify a refresh token
 */
export async function verifyRefreshToken(token: string): Promise<JWTPayload> {
  const result = verifyToken(token);

  if (!result.valid) {
    throw new UnauthorizedError(result.error || "Invalid refresh token");
  }

  if (result.payload?.type !== "refresh") {
    throw new UnauthorizedError("Invalid token type");
  }

  // Check if refresh token exists in cache (not revoked)
  const exists = await cache.exists(`refresh:${result.payload.jti}`);
  if (!exists) {
    throw new UnauthorizedError("Refresh token has been revoked or expired");
  }

  return result.payload;
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const result = verifyToken(token);
  if (result.valid && result.payload) {
    await cache.del(`refresh:${result.payload.jti}`);
    await cache.set(`revoked:${result.payload.jti}`, true, REFRESH_TOKEN_TTL);
  }
}

// ============================================
// Token Pair Operations
// ============================================

/**
 * Create both access and refresh tokens
 */
export async function createTokenPair(data: {
  userId: string;
  role?: string;
  permissions?: string[];
  organizationId?: string;
}): Promise<TokenPair> {
  const sessionId = crypto.randomUUID();

  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken({ ...data, sessionId }),
    createRefreshToken({ userId: data.userId, sessionId }),
  ]);

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL,
    tokenType: "Bearer",
  };
}

/**
 * Refresh tokens using a valid refresh token
 */
export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  const payload = await verifyRefreshToken(refreshToken);

  // Revoke old refresh token (rotation)
  await revokeRefreshToken(refreshToken);

  // Create new token pair
  return createTokenPair({
    userId: payload.sub,
    // Note: You may want to fetch fresh role/permissions from DB here
  });
}

// ============================================
// API Key Token Operations
// ============================================

/**
 * Create a long-lived API key token
 */
export async function createApiKeyToken(data: {
  userId?: string;
  organizationId?: string;
  permissions: string[];
  name: string;
  expiresInDays?: number;
}): Promise<{ token: string; jti: string }> {
  const expiresIn = (data.expiresInDays || 365) * 24 * 60 * 60;
  const exp = Math.floor(Date.now() / 1000) + expiresIn;

  const token = createToken({
    sub: data.userId || data.organizationId || "api",
    exp,
    type: "api_key",
    permissions: data.permissions,
    organizationId: data.organizationId,
    metadata: { name: data.name },
  });

  const result = verifyToken(token);
  const jti = result.payload?.jti || "";

  // Store API key reference
  await cache.set(
    `apikey:${jti}`,
    { 
      userId: data.userId, 
      organizationId: data.organizationId,
      name: data.name,
      permissions: data.permissions,
    },
    expiresIn
  );

  return { token, jti };
}

/**
 * Verify an API key token
 */
export async function verifyApiKeyToken(token: string): Promise<JWTPayload> {
  const result = verifyToken(token);

  if (!result.valid) {
    throw new UnauthorizedError(result.error || "Invalid API key");
  }

  if (result.payload?.type !== "api_key") {
    throw new UnauthorizedError("Invalid token type");
  }

  // Check if API key is still valid in cache
  const keyData = await cache.get(`apikey:${result.payload.jti}`);
  if (!keyData) {
    throw new UnauthorizedError("API key has been revoked");
  }

  return result.payload;
}

/**
 * Revoke an API key
 */
export async function revokeApiKeyToken(jti: string, revokedBy?: string): Promise<void> {
  await cache.del(`apikey:${jti}`);
  
  if (revokedBy) {
    await logAuditTrail(revokedBy, "api_key.revoked", {
      resource: "api_key",
      resourceId: jti,
    });
  }
}

// ============================================
// Token Revocation
// ============================================

/**
 * Revoke an access token
 */
export async function revokeAccessToken(token: string): Promise<void> {
  const result = verifyToken(token);
  if (result.valid && result.payload) {
    // Store revoked token ID until it would have expired
    const ttl = result.payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await cache.set(`revoked:${result.payload.jti}`, true, ttl);
    }
  }
}

/**
 * Revoke all tokens for a user
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  // Store user revocation timestamp
  await cache.set(`user_revoked:${userId}`, Date.now(), REFRESH_TOKEN_TTL);

  await logAuditTrail(userId, "tokens.revoked_all", {
    resource: "user",
    resourceId: userId,
  });
}

// ============================================
// Request Authentication
// ============================================

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;

  const [type, token] = authHeader.split(" ");
  if (type.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

/**
 * Require API authentication for a request
 */
export async function requireApiAuth(request: Request): Promise<{
  userId: string;
  role?: string;
  permissions?: string[];
  organizationId?: string;
}> {
  const token = extractTokenFromHeader(request);

  if (!token) {
    throw new UnauthorizedError("Missing authentication token");
  }

  try {
    const payload = await verifyAccessToken(token);
    
    // Check if user tokens were revoked after this token was issued
    const revokedAt = await cache.get<number>(`user_revoked:${payload.sub}`);
    if (revokedAt && payload.iat * 1000 < revokedAt) {
      throw new UnauthorizedError("Token has been revoked");
    }

    return {
      userId: payload.sub,
      role: payload.role,
      permissions: payload.permissions,
      organizationId: payload.organizationId,
    };
  } catch (error) {
    // Try API key if access token fails
    try {
      const payload = await verifyApiKeyToken(token);
      return {
        userId: payload.sub,
        permissions: payload.permissions,
        organizationId: payload.organizationId,
      };
    } catch {
      // Throw original error
      throw error;
    }
  }
}

/**
 * Check if user has required permission
 */
export function hasPermission(
  userPermissions: string[] | undefined,
  requiredPermission: string
): boolean {
  if (!userPermissions) return false;
  
  // Check for wildcard
  if (userPermissions.includes("*")) return true;
  
  // Check exact match
  if (userPermissions.includes(requiredPermission)) return true;
  
  // Check namespace wildcard (e.g., "users:*" matches "users:read")
  const [namespace] = requiredPermission.split(":");
  if (userPermissions.includes(`${namespace}:*`)) return true;
  
  return false;
}

/**
 * Require specific permission
 */
export async function requirePermission(
  request: Request,
  permission: string
): Promise<{
  userId: string;
  role?: string;
  permissions?: string[];
}> {
  const auth = await requireApiAuth(request);

  if (!hasPermission(auth.permissions, permission)) {
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
    
    await logSecurityEvent("permission_denied", "medium", 
      `User ${auth.userId} denied permission: ${permission}`, {
        userId: auth.userId,
        ipAddress,
        metadata: { requiredPermission: permission },
      }
    );

    throw new ForbiddenError(`Missing required permission: ${permission}`);
  }

  return auth;
}
