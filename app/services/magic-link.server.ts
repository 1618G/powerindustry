/**
 * Magic Link Service - Passwordless authentication via email
 */

import { nanoid } from "nanoid";
import { db } from "~/lib/prisma";
import { sendEmail } from "./email.server";
import { createUserSession } from "~/utils/session.server";

// ============================================
// Configuration
// ============================================

const MAGIC_LINK_EXPIRY_MINUTES = parseInt(process.env.MAGIC_LINK_EXPIRY || "15");
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const APP_NAME = process.env.APP_NAME || "ZZA Platform";

// ============================================
// Types
// ============================================

interface MagicLinkResult {
  success: boolean;
  error?: string;
}

// ============================================
// Generate Magic Link
// ============================================

export async function sendMagicLink(
  email: string,
  ipAddress?: string
): Promise<MagicLinkResult> {
  try {
    // Find or create user
    let user = await db.user.findUnique({ where: { email } });

    if (!user) {
      // Create new user without password (magic link only)
      user = await db.user.create({
        data: {
          email,
          emailVerified: false, // Will be verified on first magic link use
        },
      });
    }

    if (!user.isActive) {
      return { success: false, error: "Account is disabled" };
    }

    // Generate token
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_EXPIRY_MINUTES * 60 * 1000);

    // Invalidate existing magic links for this user
    await db.magicLink.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Create new magic link
    await db.magicLink.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
        ipAddress,
      },
    });

    // Generate magic link URL
    const magicLinkUrl = `${APP_URL}/auth/magic/${token}`;

    // Send email
    await sendEmail({
      to: email,
      subject: `Sign in to ${APP_NAME}`,
      html: generateMagicLinkEmail(magicLinkUrl),
      text: `Sign in to ${APP_NAME}\n\nClick this link to sign in: ${magicLinkUrl}\n\nThis link expires in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.`,
    });

    return { success: true };
  } catch (error) {
    console.error("Magic link error:", error);
    return { success: false, error: "Failed to send magic link" };
  }
}

// ============================================
// Verify Magic Link
// ============================================

export async function verifyMagicLink(
  token: string,
  request: Request
): Promise<Response | { error: string }> {
  const magicLink = await db.magicLink.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!magicLink) {
    return { error: "Invalid magic link" };
  }

  if (magicLink.usedAt) {
    return { error: "Magic link has already been used" };
  }

  if (magicLink.expiresAt < new Date()) {
    return { error: "Magic link has expired" };
  }

  // Mark as used
  await db.magicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() },
  });

  // Mark email as verified
  await db.user.update({
    where: { id: magicLink.userId },
    data: {
      emailVerified: true,
      lastLoginAt: new Date(),
    },
  });

  // Create session
  return createUserSession({
    request,
    userId: magicLink.userId,
    remember: true,
    redirectTo: "/dashboard",
  });
}

// ============================================
// Email Template
// ============================================

function generateMagicLinkEmail(magicLinkUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Sign in to ${APP_NAME}</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">${APP_NAME}</h1>
        </div>
        
        <div style="background: #f9fafb; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
          <h2 style="margin-top: 0; color: #111827;">Sign in to your account</h2>
          <p style="color: #6b7280;">Click the button below to sign in. This link will expire in ${MAGIC_LINK_EXPIRY_MINUTES} minutes.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${magicLinkUrl}" 
               style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
              Sign In
            </a>
          </div>
          
          <p style="color: #9ca3af; font-size: 14px; margin-bottom: 0;">
            If the button doesn't work, copy and paste this link into your browser:
          </p>
          <p style="color: #6b7280; font-size: 12px; word-break: break-all;">
            ${magicLinkUrl}
          </p>
        </div>
        
        <div style="text-align: center; color: #9ca3af; font-size: 12px;">
          <p>If you didn't request this email, you can safely ignore it.</p>
          <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;
}

// ============================================
// Cleanup Expired Links
// ============================================

export async function cleanupExpiredMagicLinks(): Promise<number> {
  const result = await db.magicLink.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { usedAt: { not: null } },
      ],
    },
  });
  return result.count;
}

