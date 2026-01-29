/**
 * SOC II Compliance Service
 * Implements Trust Service Criteria: Security, Availability, Processing Integrity, 
 * Confidentiality, and Privacy
 */

import { db } from "~/lib/prisma";
import crypto from "crypto";

// ============================================
// Configuration
// ============================================

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const DATA_RETENTION_DAYS = parseInt(process.env.DATA_RETENTION_DAYS || "365");

// ============================================
// Data Encryption (Confidentiality)
// ============================================

export function encryptSensitiveData(data: string): { encrypted: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  let encrypted = cipher.update(data, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decryptSensitiveData(encrypted: string, iv: string, tag: string): string {
  const key = Buffer.from(ENCRYPTION_KEY, "hex");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ============================================
// Audit Logging (Security)
// ============================================

export async function logSecurityEvent(
  type: string,
  severity: "low" | "medium" | "high" | "critical",
  description: string,
  options: {
    userId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  await db.securityEvent.create({
    data: {
      type,
      severity,
      description,
      userId: options.userId,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      metadata: options.metadata as object,
    },
  });

  // Alert on critical events
  if (severity === "critical") {
    await alertSecurityTeam(type, description, options);
  }
}

async function alertSecurityTeam(
  type: string,
  description: string,
  options: Record<string, unknown>
): Promise<void> {
  // Implement alerting (email, Slack, PagerDuty, etc.)
  console.error(`[CRITICAL SECURITY EVENT] ${type}: ${description}`, options);
  // TODO: Send alerts to security team
}

export async function logAuditTrail(
  userId: string | null,
  action: string,
  options: {
    resource?: string;
    resourceId?: string;
    oldValue?: object;
    newValue?: object;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    severity?: string;
  } = {}
): Promise<void> {
  await db.auditLog.create({
    data: {
      userId,
      action,
      resource: options.resource,
      resourceId: options.resourceId,
      oldValue: options.oldValue,
      newValue: options.newValue,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      sessionId: options.sessionId,
      severity: options.severity || "info",
    },
  });
}

// ============================================
// Access Control (Security)
// ============================================

export async function validateAccess(
  userId: string,
  resource: string,
  action: string,
  resourceId?: string
): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true, isSuspended: true },
  });

  if (!user || !user.isActive || user.isSuspended) {
    await logSecurityEvent("access_denied", "medium", `User ${userId} access denied to ${resource}:${action}`, {
      userId,
    });
    return false;
  }

  // Role-based access control
  const permissions: Record<string, Record<string, string[]>> = {
    USER: {
      profile: ["read", "update"],
      files: ["create", "read", "delete"],
      dashboard: ["read"],
    },
    ADMIN: {
      profile: ["read", "update"],
      files: ["create", "read", "delete"],
      dashboard: ["read"],
      users: ["read", "update"],
      audit_logs: ["read"],
    },
    SUPER_ADMIN: {
      "*": ["*"],
    },
  };

  const rolePerms = permissions[user.role];
  if (!rolePerms) return false;

  // Super admin has full access
  if (rolePerms["*"]?.includes("*")) return true;

  // Check specific permission
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return false;

  return resourcePerms.includes(action) || resourcePerms.includes("*");
}

// ============================================
// Password Security (Security)
// ============================================

export function validatePasswordStrength(password: string): {
  valid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length < 8) feedback.push("Password must be at least 8 characters");

  // Complexity checks
  if (/[a-z]/.test(password)) score += 1;
  else feedback.push("Include lowercase letters");

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push("Include uppercase letters");

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push("Include numbers");

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else feedback.push("Include special characters");

  // Common patterns check
  const commonPatterns = ["password", "123456", "qwerty", "admin", "letmein"];
  if (commonPatterns.some((p) => password.toLowerCase().includes(p))) {
    score -= 2;
    feedback.push("Avoid common password patterns");
  }

  return {
    valid: score >= 5 && password.length >= 8,
    score: Math.max(0, Math.min(7, score)),
    feedback,
  };
}

export async function checkPasswordHistory(
  userId: string,
  newPasswordHash: string,
  historyCount: number = 5
): Promise<boolean> {
  // Check if password was used recently
  // This would require a password_history table
  // Placeholder implementation
  return true;
}

// ============================================
// Session Security (Security)
// ============================================

export async function detectSuspiciousSession(
  userId: string,
  ipAddress: string,
  userAgent: string
): Promise<boolean> {
  // Check for suspicious patterns
  const recentSessions = await db.session.findMany({
    where: { userId, isValid: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  // Multiple locations in short time
  const uniqueIps = new Set(recentSessions.map((s) => s.ipAddress));
  if (uniqueIps.size >= 3) {
    await logSecurityEvent("suspicious_session", "medium", `User ${userId} has sessions from ${uniqueIps.size} different IPs`, {
      userId,
      ipAddress,
    });
    return true;
  }

  // Check for known malicious user agents
  const maliciousPatterns = ["curl", "wget", "python-requests"];
  if (maliciousPatterns.some((p) => userAgent.toLowerCase().includes(p))) {
    await logSecurityEvent("suspicious_user_agent", "low", `Suspicious user agent detected for user ${userId}`, {
      userId,
      userAgent,
    });
  }

  return false;
}

// ============================================
// Data Privacy (Privacy)
// ============================================

export async function recordConsent(
  userId: string,
  type: string,
  version: string,
  accepted: boolean,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await db.consentRecord.create({
    data: {
      userId,
      type,
      version,
      accepted,
      ipAddress,
      userAgent,
    },
  });

  await logAuditTrail(userId, `consent.${accepted ? "accepted" : "declined"}`, {
    resource: "consent",
    newValue: { type, version, accepted },
    ipAddress,
  });
}

export async function getConsentStatus(
  userId: string,
  type: string
): Promise<{ accepted: boolean; version: string; date: Date } | null> {
  const consent = await db.consentRecord.findFirst({
    where: { userId, type },
    orderBy: { createdAt: "desc" },
  });

  if (!consent) return null;

  return {
    accepted: consent.accepted,
    version: consent.version,
    date: consent.createdAt,
  };
}

export async function requestDataExport(userId: string): Promise<string> {
  const request = await db.dataExportRequest.create({
    data: {
      userId,
      status: "PENDING",
      format: "json",
    },
  });

  // Trigger background job to generate export
  // TODO: Implement background job

  return request.id;
}

export async function deleteUserData(
  userId: string,
  hardDelete: boolean = false
): Promise<void> {
  if (hardDelete) {
    // Cascade delete all user data
    await db.user.delete({ where: { id: userId } });
  } else {
    // Soft delete - anonymize data
    await db.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@anonymized.local`,
        name: "Deleted User",
        isActive: false,
        passwordHash: null,
      },
    });
  }

  await logAuditTrail(userId, "user.data_deleted", {
    resource: "user",
    resourceId: userId,
    newValue: { hardDelete },
  });
}

// ============================================
// Data Retention (Availability)
// ============================================

export async function cleanupExpiredData(): Promise<{
  sessions: number;
  passwordResets: number;
  magicLinks: number;
  auditLogs: number;
  securityEvents: number;
}> {
  const now = new Date();
  const retentionDate = new Date(now.getTime() - DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [sessions, passwordResets, magicLinks, auditLogs, securityEvents] = await Promise.all([
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.magicLink.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.auditLog.deleteMany({ where: { createdAt: { lt: retentionDate } } }),
    db.securityEvent.deleteMany({ where: { createdAt: { lt: retentionDate }, resolved: true } }),
  ]);

  return {
    sessions: sessions.count,
    passwordResets: passwordResets.count,
    magicLinks: magicLinks.count,
    auditLogs: auditLogs.count,
    securityEvents: securityEvents.count,
  };
}

// ============================================
// Security Headers (Processing Integrity)
// ============================================

export function getSecurityHeaders(): Record<string, string> {
  return {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
  };
}

// ============================================
// Compliance Reporting
// ============================================

export async function generateComplianceReport(
  startDate: Date,
  endDate: Date
): Promise<{
  securityEvents: { total: number; bySeverity: Record<string, number> };
  accessControl: { denials: number; suspiciousActivity: number };
  dataProtection: { exports: number; deletions: number };
  auditLogs: { total: number; byAction: Record<string, number> };
}> {
  const [securityEvents, auditLogs] = await Promise.all([
    db.securityEvent.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
    }),
    db.auditLog.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
    }),
  ]);

  // Aggregate security events by severity
  const bySeverity: Record<string, number> = {};
  for (const event of securityEvents) {
    bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1;
  }

  // Aggregate audit logs by action
  const byAction: Record<string, number> = {};
  for (const log of auditLogs) {
    byAction[log.action] = (byAction[log.action] || 0) + 1;
  }

  const denials = securityEvents.filter((e) => e.type === "access_denied").length;
  const suspiciousActivity = securityEvents.filter((e) => e.type.includes("suspicious")).length;

  const dataExports = await db.dataExportRequest.count({
    where: { createdAt: { gte: startDate, lte: endDate } },
  });

  const deletions = auditLogs.filter((l) => l.action === "user.data_deleted").length;

  return {
    securityEvents: { total: securityEvents.length, bySeverity },
    accessControl: { denials, suspiciousActivity },
    dataProtection: { exports: dataExports, deletions },
    auditLogs: { total: auditLogs.length, byAction },
  };
}

