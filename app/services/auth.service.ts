/**
 * Auth Service - Authentication business logic
 * 
 * Handles password reset, email verification, and auth-related operations.
 * Uses repositories for data access.
 */

import { userRepository, passwordResetRepository, magicLinkRepository, sessionRepository } from "~/repositories";
import { hashPassword } from "~/utils/auth.server";
import { sendEmail, passwordResetEmail } from "~/services/email.server";
import { logAuditTrail } from "~/services/soc2-compliance.server";
import { NotFoundError, ValidationError } from "~/lib/errors";
import { config } from "~/lib/config.server";

// ============================================
// Password Reset
// ============================================

/**
 * Request password reset - sends email if user exists
 * Returns true regardless of whether user exists (prevents enumeration)
 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  const user = await userRepository.findByEmail(email);
  
  if (!user) {
    // Don't reveal if user exists
    return true;
  }

  const resetToken = await passwordResetRepository.create(user.id, 1); // 1 hour expiry
  const resetUrl = `${config.app.url}/reset-password/${resetToken.token}`;

  await sendEmail({
    to: user.email,
    subject: "Reset Your Password",
    html: passwordResetEmail(resetUrl),
  });

  await logAuditTrail(null, "password_reset.requested", {
    details: { email },
  });

  return true;
}

/**
 * Verify password reset token
 */
export async function verifyPasswordResetToken(token: string): Promise<{ userId: string; email: string } | null> {
  const reset = await passwordResetRepository.findValidByToken(token);
  
  if (!reset) {
    return null;
  }

  return {
    userId: reset.user.id,
    email: reset.user.email,
  };
}

/**
 * Complete password reset
 */
export async function completePasswordReset(token: string, newPassword: string): Promise<void> {
  const reset = await passwordResetRepository.findValidByToken(token);
  
  if (!reset) {
    throw new ValidationError("Invalid or expired reset link");
  }

  const passwordHash = await hashPassword(newPassword);
  
  await userRepository.updatePassword(reset.userId, passwordHash);
  await passwordResetRepository.markUsed(token);
  
  // Invalidate all sessions for security
  await sessionRepository.deleteByUserId(reset.userId);

  await logAuditTrail(reset.userId, "password_reset.completed", {});
}

// ============================================
// Email Verification
// ============================================

/**
 * Send verification email
 */
export async function sendVerificationEmail(userId: string): Promise<void> {
  const user = await userRepository.findById(userId);
  
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.emailVerified) {
    return; // Already verified
  }

  const verificationToken = await magicLinkRepository.create(userId, "verification", 24);
  const verifyUrl = `${config.app.url}/verify-email/${verificationToken.token}`;

  await sendEmail({
    to: user.email,
    subject: "Verify Your Email",
    html: `
      <h1>Verify Your Email</h1>
      <p>Click the link below to verify your email address:</p>
      <a href="${verifyUrl}">Verify Email</a>
      <p>This link expires in 24 hours.</p>
    `,
  });
}

/**
 * Verify email with token
 */
export async function verifyEmailToken(token: string): Promise<{ success: boolean; alreadyVerified?: boolean }> {
  const magicLink = await magicLinkRepository.findByToken(token);
  
  if (!magicLink) {
    return { success: false };
  }

  if (magicLink.usedAt) {
    return { success: true, alreadyVerified: true };
  }

  if (magicLink.expiresAt < new Date()) {
    return { success: false };
  }

  await userRepository.verifyEmail(magicLink.userId);
  await magicLinkRepository.markUsed(token);

  await logAuditTrail(magicLink.userId, "email.verified", {
    details: { email: magicLink.user.email },
  });

  return { success: true };
}

// ============================================
// Session Management
// ============================================

/**
 * Get active sessions for user
 */
export async function getUserSessions(userId: string) {
  return sessionRepository.findByUserId(userId);
}

/**
 * Count active sessions
 */
export async function countActiveSessions(userId: string): Promise<number> {
  return sessionRepository.countActiveByUserId(userId);
}

/**
 * Revoke specific session
 */
export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const session = await sessionRepository.findById(sessionId);
  
  if (!session || session.userId !== userId) {
    throw new NotFoundError("Session not found");
  }

  await sessionRepository.delete(sessionId);
  await logAuditTrail(userId, "session.revoked", { resourceId: sessionId });
}

/**
 * Revoke all sessions
 */
export async function revokeAllSessions(userId: string): Promise<number> {
  const count = await sessionRepository.deleteByUserId(userId);
  await logAuditTrail(userId, "sessions.revoked_all", { details: { count } });
  return count;
}
