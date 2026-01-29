/**
 * Team Service - Team and invitation management
 */

import { organizationRepository, invitationRepository, userRepository } from "~/repositories";
import { sendEmail } from "./email.server";
import { logAuditTrail } from "./soc2-compliance.server";
import { NotFoundError, ForbiddenError, ConflictError } from "~/lib/errors";
import { config } from "~/lib/config.server";

// ============================================
// Organization
// ============================================

/**
 * Get organization with members
 */
export async function getOrganizationWithMembers(userId: string) {
  const org = await organizationRepository.findByOwnerId(userId);
  if (!org) return null;
  
  return organizationRepository.findByIdWithMembers(org.id);
}

/**
 * Get pending invitations for organization
 */
export async function getPendingInvitations(organizationId: string) {
  return invitationRepository.findPendingByOrganization(organizationId);
}

// ============================================
// Invitations
// ============================================

/**
 * Send team invitation
 */
export async function sendInvitation(data: {
  organizationId: string;
  email: string;
  role?: string;
  invitedBy: string;
}): Promise<void> {
  // Check if user is org owner
  const org = await organizationRepository.findById(data.organizationId);
  if (!org || org.ownerId !== data.invitedBy) {
    throw new ForbiddenError("Only the organization owner can send invitations");
  }

  // Check if already a member
  const existingUser = await userRepository.findByEmail(data.email);
  if (existingUser?.organizationId === data.organizationId) {
    throw new ConflictError("This user is already a team member");
  }

  // Check for pending invitation
  const existingInvitation = await invitationRepository.findByEmail(data.email, data.organizationId);
  if (existingInvitation) {
    throw new ConflictError("An invitation is already pending for this email");
  }

  // Create invitation
  const invitation = await invitationRepository.create({
    organizationId: data.organizationId,
    email: data.email,
    role: data.role || "USER",
    invitedById: data.invitedBy,
  });

  // Send email
  const inviteUrl = `${config.app.url}/accept-invite/${invitation.token}`;
  await sendEmail({
    to: data.email,
    subject: `You're invited to join ${org.name}`,
    html: `
      <h1>Team Invitation</h1>
      <p>You've been invited to join <strong>${org.name}</strong>.</p>
      <p><a href="${inviteUrl}">Accept Invitation</a></p>
      <p>This invitation expires in 7 days.</p>
    `,
  });

  await logAuditTrail(data.invitedBy, "invitation.sent", {
    resource: "invitation",
    newValue: { email: data.email, role: data.role },
  });
}

/**
 * Resend invitation
 */
export async function resendInvitation(invitationId: string): Promise<void> {
  const invitation = await invitationRepository.findById(invitationId);
  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  // Extend expiry
  const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await invitationRepository.updateExpiry(invitationId, newExpiry);

  const org = await organizationRepository.findById(invitation.organizationId);
  if (!org) throw new NotFoundError("Organization not found");

  const inviteUrl = `${config.app.url}/accept-invite/${invitation.token}`;
  await sendEmail({
    to: invitation.email,
    subject: `Reminder: You're invited to join ${org.name}`,
    html: `
      <h1>Team Invitation Reminder</h1>
      <p>You've been invited to join <strong>${org.name}</strong>.</p>
      <p><a href="${inviteUrl}">Accept Invitation</a></p>
      <p>This invitation expires in 7 days.</p>
    `,
  });
}

/**
 * Revoke invitation
 */
export async function revokeInvitation(invitationId: string, revokedBy: string): Promise<void> {
  const invitation = await invitationRepository.findById(invitationId);
  if (!invitation) {
    throw new NotFoundError("Invitation not found");
  }

  const org = await organizationRepository.findById(invitation.organizationId);
  if (!org || org.ownerId !== revokedBy) {
    throw new ForbiddenError("Only the organization owner can revoke invitations");
  }

  await invitationRepository.delete(invitationId);

  await logAuditTrail(revokedBy, "invitation.revoked", {
    resource: "invitation",
    resourceId: invitationId,
  });
}

// ============================================
// Member Management
// ============================================

/**
 * Remove member from organization
 */
export async function removeMember(
  organizationId: string,
  memberId: string,
  removedBy: string
): Promise<void> {
  const org = await organizationRepository.findById(organizationId);
  if (!org || org.ownerId !== removedBy) {
    throw new ForbiddenError("Only the organization owner can remove members");
  }

  if (memberId === org.ownerId) {
    throw new ForbiddenError("Cannot remove the organization owner");
  }

  await organizationRepository.removeMember(organizationId, memberId);

  await logAuditTrail(removedBy, "member.removed", {
    resource: "organization",
    resourceId: organizationId,
    details: { removedUserId: memberId },
  });
}
