/**
 * Security Service - Enhanced security utilities
 * Handles hashing, encryption, input validation, and security checks
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "~/lib/prisma";
import { logSecurityEvent, logAuditTrail } from "./soc2-compliance.server";

// ============================================
// Configuration
// ============================================

const BCRYPT_ROUNDS = 12;
const API_KEY_LENGTH = 32;
const TOKEN_LENGTH = 32;

// ============================================
// Password Hashing
// ============================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================
// Token Generation
// ============================================

export function generateSecureToken(length: number = TOKEN_LENGTH): string {
  return crypto.randomBytes(length).toString("hex");
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `zza_${generateSecureToken(API_KEY_LENGTH)}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  const prefix = key.substring(0, 12);

  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// ============================================
// Input Validation Schemas
// ============================================

export const emailSchema = z.string().email("Invalid email address").max(255);

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain a special character");

export const nameSchema = z
  .string()
  .min(1, "Name is required")
  .max(100, "Name is too long")
  .regex(/^[a-zA-Z\s\-'.]+$/, "Name contains invalid characters");

export const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number")
  .optional()
  .or(z.literal(""));

export const urlSchema = z.string().url("Invalid URL").optional().or(z.literal(""));

export const slugSchema = z
  .string()
  .min(3, "Slug must be at least 3 characters")
  .max(50, "Slug is too long")
  .regex(/^[a-z0-9\-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens");

export const organizationSchema = z.object({
  name: z.string().min(2).max(100),
  slug: slugSchema,
  type: z.enum(["BUSINESS", "ENTERPRISE", "NONPROFIT", "GOVERNMENT"]).optional(),
  taxId: z.string().max(50).optional(),
  website: urlSchema,
  phone: phoneSchema,
});

export const registrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema.optional(),
  userType: z.enum(["PERSONAL", "BUSINESS"]).default("PERSONAL"),
  organizationName: z.string().min(2).max(100).optional(),
  terms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
  marketing: z.boolean().default(false),
});

// ============================================
// SQL Injection Prevention
// ============================================

export function sanitizeInput(input: string): string {
  // Remove potential SQL injection characters
  return input
    .replace(/[\x00-\x1f\x7f]/g, "")  // Control characters
    .replace(/['"\\;]/g, "")  // SQL special chars
    .trim();
}

export function sanitizeForHtml(input: string): string {
  const htmlEntities: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };

  return input.replace(/[&<>"'/]/g, (char) => htmlEntities[char] || char);
}

// ============================================
// Rate Limiting for Authentication
// ============================================

export async function checkLoginAttempts(
  email: string,
  ipAddress: string
): Promise<{ allowed: boolean; remainingAttempts: number; lockoutMinutes?: number }> {
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MINUTES = 15;

  const user = await db.user.findUnique({
    where: { email },
    select: { failedLoginAttempts: true, lockedUntil: true },
  });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const lockoutMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { allowed: false, remainingAttempts: 0, lockoutMinutes };
  }

  const attempts = user?.failedLoginAttempts || 0;
  return {
    allowed: attempts < MAX_ATTEMPTS,
    remainingAttempts: Math.max(0, MAX_ATTEMPTS - attempts),
  };
}

export async function recordFailedLogin(email: string, ipAddress: string): Promise<void> {
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MINUTES = 15;

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, failedLoginAttempts: true },
  });

  if (!user) return;

  const newAttempts = (user.failedLoginAttempts || 0) + 1;
  const lockUntil = newAttempts >= MAX_ATTEMPTS
    ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
    : null;

  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: newAttempts,
      lockedUntil: lockUntil,
    },
  });

  if (lockUntil) {
    await logSecurityEvent("account_locked", "medium", `Account ${email} locked after ${newAttempts} failed attempts`, {
      userId: user.id,
      ipAddress,
    });
  }
}

export async function resetLoginAttempts(userId: string): Promise<void> {
  await db.user.update({
    where: { id: userId },
    data: {
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
}

// ============================================
// API Key Management
// ============================================

export async function createApiKey(
  options: {
    userId?: string;
    organizationId?: string;
    name: string;
    permissions: string[];
    expiresAt?: Date;
  }
): Promise<{ key: string; id: string }> {
  const { key, hash, prefix } = generateApiKey();

  const apiKey = await db.apiKey.create({
    data: {
      userId: options.userId,
      organizationId: options.organizationId,
      name: options.name,
      keyHash: hash,
      keyPrefix: prefix,
      permissions: options.permissions,
      expiresAt: options.expiresAt,
    },
  });

  await logAuditTrail(options.userId || null, "api_key.created", {
    resource: "api_key",
    resourceId: apiKey.id,
    newValue: { name: options.name, prefix },
  });

  return { key, id: apiKey.id };
}

export async function validateApiKey(key: string): Promise<{
  valid: boolean;
  userId?: string;
  organizationId?: string;
  permissions?: string[];
}> {
  const hash = hashApiKey(key);

  const apiKey = await db.apiKey.findUnique({
    where: { keyHash: hash },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      permissions: true,
      isActive: true,
      expiresAt: true,
    },
  });

  if (!apiKey || !apiKey.isActive) {
    return { valid: false };
  }

  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
    return { valid: false };
  }

  // Update last used
  await db.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    valid: true,
    userId: apiKey.userId || undefined,
    organizationId: apiKey.organizationId || undefined,
    permissions: apiKey.permissions as string[],
  };
}

export async function revokeApiKey(keyId: string, revokedBy: string): Promise<void> {
  await db.apiKey.update({
    where: { id: keyId },
    data: { isActive: false },
  });

  await logAuditTrail(revokedBy, "api_key.revoked", {
    resource: "api_key",
    resourceId: keyId,
  });
}

// ============================================
// Security Headers Middleware
// ============================================

export function getSecurityHeaders(options: { nonce?: string } = {}): Record<string, string> {
  const cspDirectives = [
    "default-src 'self'",
    `script-src 'self' ${options.nonce ? `'nonce-${options.nonce}'` : "'unsafe-inline'"} 'unsafe-eval' https://js.stripe.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.stripe.com https://*.google.com https://api.openai.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
    "Content-Security-Policy": cspDirectives,
  };
}

// ============================================
// Request Validation
// ============================================

export function validateRequest(request: Request): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for required headers
  const contentType = request.headers.get("content-type");
  if (request.method === "POST" && !contentType) {
    errors.push("Missing Content-Type header");
  }

  // Check origin for CSRF protection
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const allowedOrigins = [process.env.APP_URL, `https://${host}`, `http://${host}`];

  if (origin && !allowedOrigins.includes(origin)) {
    errors.push("Invalid origin");
  }

  return { valid: errors.length === 0, errors };
}

// ============================================
// File Security
// ============================================

export function validateFileUpload(
  file: File,
  options: {
    maxSize?: number;
    allowedTypes?: string[];
  } = {}
): { valid: boolean; error?: string } {
  const maxSize = options.maxSize || 50 * 1024 * 1024; // 50MB default
  const allowedTypes = options.allowedTypes || [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "video/mp4", "video/webm",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (file.size > maxSize) {
    return { valid: false, error: `File too large. Maximum size is ${maxSize / 1024 / 1024}MB` };
  }

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: `File type ${file.type} is not allowed` };
  }

  // Check for suspicious file names
  const suspiciousPatterns = [".exe", ".bat", ".cmd", ".sh", ".php", ".js"];
  if (suspiciousPatterns.some((p) => file.name.toLowerCase().endsWith(p))) {
    return { valid: false, error: "File type not allowed" };
  }

  return { valid: true };
}

