/**
 * Billing Service - Subscription and payment business logic
 * 
 * Uses repositories for data access, Stripe service for payments.
 */

import { subscriptionRepository, organizationRepository, planRepository, paymentRepository } from "~/repositories";
import { createBillingPortalSession, createCheckoutSession as stripeCheckout } from "./stripe.server";
import { logAuditTrail } from "./soc2-compliance.server";
import { NotFoundError, ForbiddenError } from "~/lib/errors";
import { config } from "~/lib/config.server";

// ============================================
// Subscription Management
// ============================================

/**
 * Get active subscription for organization
 */
export async function getActiveSubscription(organizationId: string) {
  return subscriptionRepository.findByOrganizationId(organizationId, true);
}

/**
 * Get subscription by Stripe ID
 */
export async function getSubscriptionByStripeId(stripeSubscriptionId: string) {
  return subscriptionRepository.findByStripeId(stripeSubscriptionId);
}

/**
 * Get all plans
 */
export async function getActivePlans() {
  return planRepository.findActive();
}

/**
 * Get plan by Stripe price ID
 */
export async function getPlanByPriceId(stripePriceId: string) {
  return planRepository.findByStripePriceId(stripePriceId);
}

// ============================================
// Payment Management
// ============================================

/**
 * Get recent payments for organization
 */
export async function getRecentPayments(organizationId: string, limit: number = 10) {
  return paymentRepository.findByOrganization(organizationId, limit);
}

/**
 * Get payments for user
 */
export async function getUserPayments(userId: string, limit: number = 10) {
  return paymentRepository.findByUser(userId, limit);
}

// ============================================
// Stripe Integration
// ============================================

/**
 * Open Stripe billing portal
 */
export async function openBillingPortal(
  userId: string,
  returnUrl: string
): Promise<string> {
  const org = await organizationRepository.findByMemberId(userId);
  
  if (!org?.stripeCustomerId) {
    throw new NotFoundError("No billing account found");
  }

  const portalUrl = await createBillingPortalSession(org.stripeCustomerId, returnUrl);

  await logAuditTrail(userId, "billing.portal_accessed", {
    resource: "organization",
    resourceId: org.id,
  });

  return portalUrl;
}

/**
 * Create checkout session for subscription
 */
export async function createCheckoutSession(
  userId: string,
  priceId: string
): Promise<string> {
  // Get or create organization
  let org = await organizationRepository.findByOwnerId(userId);
  
  if (!org) {
    const user = await import("~/repositories").then(m => m.userRepository.findById(userId));
    if (!user) throw new NotFoundError("User not found");
    
    org = await organizationRepository.create({
      name: `${user.name || user.email}'s Organization`,
      slug: `org-${userId}`,
      ownerId: userId,
    });
  }

  const checkoutUrl = await stripeCheckout({
    priceId,
    userId,
    organizationId: org.id,
    successUrl: `${config.app.url}/dashboard/billing?success=true`,
    cancelUrl: `${config.app.url}/dashboard/billing?cancelled=true`,
  });

  await logAuditTrail(userId, "subscription.checkout_started", {
    newValue: { priceId },
  });

  return checkoutUrl;
}

// ============================================
// Webhook Handlers (called by webhook route)
// ============================================

/**
 * Handle subscription update from webhook
 */
export async function handleSubscriptionUpdate(data: {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string;
  status: "ACTIVE" | "CANCELED" | "PAST_DUE" | "UNPAID" | "TRIALING" | "INCOMPLETE" | "INCOMPLETE_EXPIRED";
  plan: string;
  interval: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  metadata: Record<string, any>;
}) {
  const existing = await subscriptionRepository.findByStripeId(data.stripeSubscriptionId);

  if (existing) {
    await subscriptionRepository.update(existing.id, {
      status: data.status,
      plan: data.plan,
      stripePriceId: data.stripePriceId,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd,
      canceledAt: data.canceledAt,
      trialStart: data.trialStart,
      trialEnd: data.trialEnd,
      metadata: data.metadata,
    });
  } else {
    // Find org by customer ID
    const org = await organizationRepository.findByMemberId(data.stripeCustomerId);

    await subscriptionRepository.create({
      stripeSubscriptionId: data.stripeSubscriptionId,
      stripeCustomerId: data.stripeCustomerId,
      stripePriceId: data.stripePriceId,
      organizationId: org?.id,
      status: data.status,
      plan: data.plan,
      interval: data.interval,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      metadata: data.metadata,
    });
  }
}

/**
 * Handle payment success from webhook
 */
export async function handlePaymentSuccess(data: {
  stripePaymentId: string;
  stripeCustomerId: string;
  amount: number;
  currency: string;
  description: string;
  receiptUrl?: string;
  invoiceId?: string;
}) {
  const org = await organizationRepository.findByMemberId(data.stripeCustomerId);

  await paymentRepository.upsertByStripeId(data.stripePaymentId, {
    stripePaymentId: data.stripePaymentId,
    stripeCustomerId: data.stripeCustomerId,
    organizationId: org?.id,
    amount: data.amount,
    currency: data.currency,
    status: "SUCCEEDED",
    type: "SUBSCRIPTION",
    description: data.description,
    receiptUrl: data.receiptUrl,
    invoiceId: data.invoiceId,
  });
}

/**
 * Handle payment failure from webhook
 */
export async function handlePaymentFailure(data: {
  stripePaymentId: string;
  stripeCustomerId: string;
  amount: number;
  currency: string;
  description: string;
}) {
  const org = await organizationRepository.findByMemberId(data.stripeCustomerId);

  await paymentRepository.upsertByStripeId(data.stripePaymentId, {
    stripePaymentId: data.stripePaymentId,
    stripeCustomerId: data.stripeCustomerId,
    organizationId: org?.id,
    amount: data.amount,
    currency: data.currency,
    status: "FAILED",
    type: "SUBSCRIPTION",
    description: data.description,
  });
}
