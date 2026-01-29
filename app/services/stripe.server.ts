/**
 * Stripe Service - Payment processing, subscriptions, and marketplace Connect
 * Supports: Subscriptions, One-time payments, Stripe Connect (Marketplace)
 */

import Stripe from "stripe";
import { db } from "~/lib/prisma";
import { logAuditEvent } from "./system-health.server";

// ============================================
// Configuration
// ============================================

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
  typescript: true,
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// ============================================
// Customer Management
// ============================================

export async function createStripeCustomer(
  userId: string,
  email: string,
  name?: string,
  organizationId?: string
): Promise<string> {
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId, organizationId: organizationId || "" },
  });

  // Update user or organization with Stripe customer ID
  if (organizationId) {
    await db.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId: customer.id },
    });
  }

  return customer.id;
}

export async function getOrCreateCustomer(
  userId: string,
  email: string,
  name?: string,
  organizationId?: string
): Promise<string> {
  // Check if organization has customer ID
  if (organizationId) {
    const org = await db.organization.findUnique({
      where: { id: organizationId },
      select: { stripeCustomerId: true },
    });
    if (org?.stripeCustomerId) return org.stripeCustomerId;
  }

  return createStripeCustomer(userId, email, name, organizationId);
}

// ============================================
// Subscriptions
// ============================================

export async function createSubscription(
  customerId: string,
  priceId: string,
  options: {
    userId?: string;
    organizationId?: string;
    trialDays?: number;
    metadata?: Record<string, string>;
  } = {}
): Promise<Stripe.Subscription> {
  const subscriptionParams: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    expand: ["latest_invoice.payment_intent"],
    metadata: {
      userId: options.userId || "",
      organizationId: options.organizationId || "",
      ...options.metadata,
    },
  };

  if (options.trialDays) {
    subscriptionParams.trial_period_days = options.trialDays;
  }

  return stripe.subscriptions.create(subscriptionParams);
}

export async function cancelSubscription(
  subscriptionId: string,
  cancelAtPeriodEnd: boolean = true
): Promise<Stripe.Subscription> {
  if (cancelAtPeriodEnd) {
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }
  return stripe.subscriptions.cancel(subscriptionId);
}

export async function updateSubscription(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return stripe.subscriptions.update(subscriptionId, {
    items: [{
      id: subscription.items.data[0].id,
      price: newPriceId,
    }],
    proration_behavior: "create_prorations",
  });
}

export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId);
}

// ============================================
// Checkout Sessions
// ============================================

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  mode: "subscription" | "payment",
  options: {
    successUrl?: string;
    cancelUrl?: string;
    trialDays?: number;
    metadata?: Record<string, string>;
    allowPromotionCodes?: boolean;
  } = {}
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: options.successUrl || `${APP_URL}/dashboard?checkout=success`,
    cancel_url: options.cancelUrl || `${APP_URL}/pricing?checkout=cancelled`,
    subscription_data: mode === "subscription" && options.trialDays
      ? { trial_period_days: options.trialDays }
      : undefined,
    allow_promotion_codes: options.allowPromotionCodes ?? true,
    metadata: options.metadata,
  });
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl?: string
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl || `${APP_URL}/dashboard/billing`,
  });
}

// ============================================
// One-Time Payments
// ============================================

export async function createPaymentIntent(
  amount: number,
  currency: string = "usd",
  options: {
    customerId?: string;
    description?: string;
    metadata?: Record<string, string>;
  } = {}
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount,
    currency,
    customer: options.customerId,
    description: options.description,
    metadata: options.metadata,
    automatic_payment_methods: { enabled: true },
  });
}

// ============================================
// Stripe Connect (Marketplace)
// ============================================

export async function createConnectAccount(
  organizationId: string,
  email: string,
  options: {
    country?: string;
    businessType?: "individual" | "company";
  } = {}
): Promise<Stripe.Account> {
  const account = await stripe.accounts.create({
    type: "express",
    email,
    country: options.country || "US",
    business_type: options.businessType || "company",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { organizationId },
  });

  await db.organization.update({
    where: { id: organizationId },
    data: {
      stripeAccountId: account.id,
      stripeAccountStatus: account.details_submitted ? "active" : "pending",
    },
  });

  return account;
}

export async function createConnectAccountLink(
  accountId: string,
  refreshUrl?: string,
  returnUrl?: string
): Promise<Stripe.AccountLink> {
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl || `${APP_URL}/dashboard/connect/refresh`,
    return_url: returnUrl || `${APP_URL}/dashboard/connect/complete`,
    type: "account_onboarding",
  });
}

export async function createConnectLoginLink(accountId: string): Promise<Stripe.LoginLink> {
  return stripe.accounts.createLoginLink(accountId);
}

export async function createMarketplacePayment(
  amount: number,
  destinationAccountId: string,
  platformFee: number,
  options: {
    currency?: string;
    customerId?: string;
    description?: string;
    metadata?: Record<string, string>;
  } = {}
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount,
    currency: options.currency || "usd",
    customer: options.customerId,
    description: options.description,
    application_fee_amount: platformFee,
    transfer_data: { destination: destinationAccountId },
    metadata: options.metadata,
    automatic_payment_methods: { enabled: true },
  });
}

// ============================================
// Webhook Handling
// ============================================

export function constructWebhookEvent(
  payload: string,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, WEBHOOK_SECRET);
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionChange(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
      break;
    case "payment_intent.succeeded":
      await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
      break;
    case "account.updated":
      await handleConnectAccountUpdated(event.data.object as Stripe.Account);
      break;
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription): Promise<void> {
  const userId = subscription.metadata.userId || null;
  const organizationId = subscription.metadata.organizationId || null;

  await db.subscription.upsert({
    where: { stripeSubscriptionId: subscription.id },
    create: {
      userId: userId || undefined,
      organizationId: organizationId || undefined,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      stripePriceId: subscription.items.data[0].price.id,
      status: subscription.status.toUpperCase() as any,
      plan: subscription.items.data[0].price.nickname || "default",
      interval: subscription.items.data[0].price.recurring?.interval || "month",
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    },
    update: {
      status: subscription.status.toUpperCase() as any,
      stripePriceId: subscription.items.data[0].price.id,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  await db.subscription.update({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
    },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;

  await db.payment.create({
    data: {
      stripePaymentId: invoice.payment_intent as string,
      stripeCustomerId: invoice.customer as string,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: "SUCCEEDED",
      type: "SUBSCRIPTION",
      description: `Invoice ${invoice.number}`,
      receiptUrl: invoice.hosted_invoice_url,
      invoiceId: invoice.id,
    },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  // Log failed payment for monitoring
  await logAuditEvent("payment.failed", {
    resource: "invoice",
    resourceId: invoice.id,
    details: {
      customerId: invoice.customer,
      amount: invoice.amount_due,
      attemptCount: invoice.attempt_count,
    },
  });
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  // Only process non-subscription payments
  if (paymentIntent.invoice) return;

  await db.payment.create({
    data: {
      stripePaymentId: paymentIntent.id,
      stripeCustomerId: paymentIntent.customer as string,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: "SUCCEEDED",
      type: paymentIntent.transfer_data ? "MARKETPLACE" : "ONE_TIME",
      description: paymentIntent.description,
    },
  });
}

async function handleConnectAccountUpdated(account: Stripe.Account): Promise<void> {
  const organizationId = account.metadata?.organizationId;
  if (!organizationId) return;

  await db.organization.update({
    where: { id: organizationId },
    data: {
      stripeAccountStatus: account.details_submitted ? "active" : "pending",
    },
  });
}

// ============================================
// Utility Functions
// ============================================

export async function getPlans(): Promise<Array<{
  id: string;
  name: string;
  price: number;
  interval: string;
  features: string[];
}>> {
  const plans = await db.plan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return plans.map((plan) => ({
    id: plan.stripePriceId,
    name: plan.name,
    price: plan.price,
    interval: plan.interval,
    features: plan.features as string[],
  }));
}

export async function hasActiveSubscription(
  userId?: string,
  organizationId?: string
): Promise<boolean> {
  const subscription = await db.subscription.findFirst({
    where: {
      OR: [
        { userId, status: { in: ["ACTIVE", "TRIALING"] } },
        { organizationId, status: { in: ["ACTIVE", "TRIALING"] } },
      ],
    },
  });
  return !!subscription;
}

export async function getActiveSubscription(
  userId?: string,
  organizationId?: string
) {
  return db.subscription.findFirst({
    where: {
      OR: [
        { userId, status: { in: ["ACTIVE", "TRIALING"] } },
        { organizationId, status: { in: ["ACTIVE", "TRIALING"] } },
      ],
    },
  });
}

export { stripe };

