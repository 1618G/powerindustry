/**
 * Team Invitations Service - Invite users to organizations
 * Handles invitation creation, verification, and acceptance
 */

import crypto from "crypto";
import { db } from "~/lib/prisma";
import { sendEmail } from "./email.server";
import { logAuditTrail } from "./soc2-compliance.server";
import { createNotification } from "./notifications.server";

// ============================================
// Configuration
// ============================================

const INVITE_EXPIRY_DAYS = 7;
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const APP_NAME = process.env.APP_NAME || "ZZA Platform";

// ============================================
// Types
// ============================================

export interface InvitationData {
  organizationId: string;
  email: string;
  role: string;
  invitedBy: string;
  message?: string;
}

export interface InvitationResult {
  success: boolean;
  invitationId?: string;
  error?: string;
}

// ============================================
// Create Invitation
// ============================================

export async function createInvitation(data: InvitationData): Promise<InvitationResult> {
  const { organizationId, email, role, invitedBy, message } = data;

  // Check if organization exists
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });

  if (!org) {
    return { success: false, error: "Organization not found" };
  }

  // Check if user already member
  const existingMember = await db.user.findFirst({
    where: {
      email: email.toLowerCase(),
      organizationId,
    },
  });

  if (existingMember) {
    return { success: false, error: "User is already a member of this organization" };
  }

  // Check for pending invitation
  const existingInvite = await db.invitation.findFirst({
    where: {
      organizationId,
      email: email.toLowerCase(),
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (existingInvite) {
    return { success: false, error: "An invitation has already been sent to this email" };
  }

  // Generate invitation token
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  // Create invitation
  const invitation = await db.invitation.create({
    data: {
      organizationId,
      email: email.toLowerCase(),
      role,
      token,
      invitedBy,
      expiresAt,
    },
  });

  // Get inviter info
  const inviter = await db.user.findUnique({
    where: { id: invitedBy },
    select: { name: true, email: true },
  });

  // Send invitation email
  const inviteUrl = `${APP_URL}/invite/${token}`;
  await sendEmail({
    to: email,
    subject: `You've been invited to join ${org.name} on ${APP_NAME}`,
    html: generateInvitationEmail(org.name, inviter?.name || inviter?.email || "A team member", inviteUrl, message),
  });

  // Audit log
  await logAuditTrail(invitedBy, "invitation.created", {
    resource: "invitation",
    resourceId: invitation.id,
    newValue: { email, role, organizationId },
  });

  return { success: true, invitationId: invitation.id };
}

// ============================================
// Accept Invitation
// ============================================

export async function acceptInvitation(
  token: string,
  userId: string
): Promise<{ success: boolean; organizationId?: string; error?: string }> {
  const invitation = await db.invitation.findUnique({
    where: { token },
    include: { organization: true },
  });

  if (!invitation) {
    return { success: false, error: "Invalid invitation link" };
  }

  if (invitation.acceptedAt) {
    return { success: false, error: "This invitation has already been used" };
  }

  if (invitation.expiresAt < new Date()) {
    return { success: false, error: "This invitation has expired" };
  }

  // Get user
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    return { success: false, error: "User not found" };
  }

  // Verify email matches (optional strictness)
  // if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
  //   return { success: false, error: "This invitation was sent to a different email address" };
  // }

  // Update user to join organization
  await db.user.update({
    where: { id: userId },
    data: { organizationId: invitation.organizationId },
  });

  // Mark invitation as accepted
  await db.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  // Notify the inviter
  await createNotification({
    userId: invitation.invitedBy,
    title: "Invitation accepted",
    body: `${user.email} has joined ${invitation.organization.name}`,
    link: `/admin/team`,
  });

  // Audit log
  await logAuditTrail(userId, "invitation.accepted", {
    resource: "invitation",
    resourceId: invitation.id,
    newValue: { organizationId: invitation.organizationId },
  });

  return { success: true, organizationId: invitation.organizationId };
}

// ============================================
// Get Invitation Details
// ============================================

export async function getInvitationByToken(token: string) {
  const invitation = await db.invitation.findUnique({
    where: { token },
    include: {
      organization: {
        select: { id: true, name: true, logo: true },
      },
    },
  });

  if (!invitation) return null;

  // Get inviter name
  const inviter = await db.user.findUnique({
    where: { id: invitation.invitedBy },
    select: { name: true, email: true },
  });

  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    organization: invitation.organization,
    inviterName: inviter?.name || inviter?.email,
    expiresAt: invitation.expiresAt,
    isExpired: invitation.expiresAt < new Date(),
    isAccepted: !!invitation.acceptedAt,
  };
}

// ============================================
// List Invitations
// ============================================

export async function getOrganizationInvitations(
  organizationId: string,
  options: { includePending?: boolean; includeAccepted?: boolean } = {}
): Promise<Array<object>> {
  const { includePending = true, includeAccepted = false } = options;

  const where: object = { organizationId };

  if (includePending && !includeAccepted) {
    Object.assign(where, { acceptedAt: null });
  } else if (!includePending && includeAccepted) {
    Object.assign(where, { acceptedAt: { not: null } });
  }

  const invitations = await db.invitation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      expiresAt: true,
      acceptedAt: true,
    },
  });

  return invitations.map((inv) => ({
    ...inv,
    isExpired: inv.expiresAt < new Date(),
    status: inv.acceptedAt ? "accepted" : inv.expiresAt < new Date() ? "expired" : "pending",
  }));
}

// ============================================
// Revoke Invitation
// ============================================

export async function revokeInvitation(
  invitationId: string,
  revokedBy: string
): Promise<boolean> {
  const invitation = await db.invitation.findUnique({
    where: { id: invitationId },
  });

  if (!invitation || invitation.acceptedAt) {
    return false;
  }

  await db.invitation.delete({ where: { id: invitationId } });

  await logAuditTrail(revokedBy, "invitation.revoked", {
    resource: "invitation",
    resourceId: invitationId,
    oldValue: { email: invitation.email },
  });

  return true;
}

// ============================================
// Resend Invitation
// ============================================

export async function resendInvitation(invitationId: string): Promise<boolean> {
  const invitation = await db.invitation.findUnique({
    where: { id: invitationId },
    include: { organization: true },
  });

  if (!invitation || invitation.acceptedAt) {
    return false;
  }

  // Extend expiry
  const newExpiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.invitation.update({
    where: { id: invitationId },
    data: { expiresAt: newExpiresAt },
  });

  // Get inviter info
  const inviter = await db.user.findUnique({
    where: { id: invitation.invitedBy },
    select: { name: true, email: true },
  });

  // Resend email
  const inviteUrl = `${APP_URL}/invite/${invitation.token}`;
  await sendEmail({
    to: invitation.email,
    subject: `Reminder: You've been invited to join ${invitation.organization.name}`,
    html: generateInvitationEmail(
      invitation.organization.name,
      inviter?.name || inviter?.email || "A team member",
      inviteUrl
    ),
  });

  return true;
}

// ============================================
// Bulk Invite
// ============================================

export async function bulkInvite(
  organizationId: string,
  emails: string[],
  role: string,
  invitedBy: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const email of emails) {
    const result = await createInvitation({
      organizationId,
      email: email.trim(),
      role,
      invitedBy,
    });

    if (result.success) {
      sent++;
    } else {
      failed++;
      errors.push(`${email}: ${result.error}`);
    }
  }

  return { sent, failed, errors };
}

// ============================================
// Email Template
// ============================================

function generateInvitationEmail(
  orgName: string,
  inviterName: string,
  inviteUrl: string,
  message?: string
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">${APP_NAME}</h1>
        </div>
        
        <div style="background: #f9fafb; border-radius: 8px; padding: 30px;">
          <h2 style="margin-top: 0; color: #111827;">You're invited to join ${orgName}</h2>
          <p style="color: #6b7280;">${inviterName} has invited you to join their team on ${APP_NAME}.</p>
          
          ${message ? `
            <div style="background: white; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0;">
              <p style="color: #374151; margin: 0; font-style: italic;">"${message}"</p>
            </div>
          ` : ""}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" 
               style="background: #4F46E5; color: white; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
              Accept Invitation
            </a>
          </div>
          
          <p style="color: #9ca3af; font-size: 14px; text-align: center;">
            This invitation expires in ${INVITE_EXPIRY_DAYS} days.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px;">
          <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
        </div>
      </body>
    </html>
  `;
}

// ============================================
// Cleanup
// ============================================

export async function cleanupExpiredInvitations(): Promise<number> {
  const result = await db.invitation.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
      acceptedAt: null,
    },
  });

  return result.count;
}

