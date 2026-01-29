/**
 * Stripe Webhooks - Handle Stripe events
 * POST /api/webhooks/stripe
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import Stripe from "stripe";
import { 
  handleSubscriptionUpdate, 
  handlePaymentSuccess, 
  handlePaymentFailure 
} from "~/services/billing.service";
import { logSecurityEvent } from "~/services/soc2-compliance.server";
import { organizationRepository } from "~/repositories";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2023-10-16",
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const signature = request.headers.get("stripe-signature");
  
  if (!signature) {
    await logSecurityEvent("stripe_webhook_missing_signature", "high", "Stripe webhook received without signature");
    return json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  const payload = await request.text();

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logSecurityEvent("stripe_webhook_invalid_signature", "high", `Invalid Stripe signature: ${message}`);
    return json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionWebhook(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.updated":
        await handleCustomerUpdated(event.data.object as Stripe.Customer);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return json({ error: "Webhook handler failed" }, { status: 500 });
  }
}

// ============================================
// Event Handlers (thin wrappers to services)
// ============================================

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const customerId = session.customer as string;
  const organizationId = session.metadata?.organizationId;

  if (customerId && organizationId) {
    await organizationRepository.update(organizationId, { stripeCustomerId: customerId });
  }

  console.log(`Checkout completed for customer ${customerId}`);
}

async function handleSubscriptionWebhook(subscription: Stripe.Subscription) {
  await handleSubscriptionUpdate({
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer as string,
    stripePriceId: subscription.items.data[0]?.price.id || "",
    status: mapSubscriptionStatus(subscription.status),
    plan: subscription.items.data[0]?.price.nickname || "default",
    interval: subscription.items.data[0]?.price.recurring?.interval || "month",
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    metadata: subscription.metadata as Record<string, any>,
  });

  console.log(`Subscription ${subscription.id} updated`);
}

async function handleSubscriptionCancelled(subscription: Stripe.Subscription) {
  await handleSubscriptionUpdate({
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer as string,
    stripePriceId: subscription.items.data[0]?.price.id || "",
    status: "CANCELED",
    plan: subscription.items.data[0]?.price.nickname || "default",
    interval: subscription.items.data[0]?.price.recurring?.interval || "month",
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: true,
    canceledAt: new Date(),
    trialStart: null,
    trialEnd: null,
    metadata: subscription.metadata as Record<string, any>,
  });

  console.log(`Subscription ${subscription.id} cancelled`);
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const stripePaymentId = invoice.payment_intent as string;
  if (!stripePaymentId) return;

  await handlePaymentSuccess({
    stripePaymentId,
    stripeCustomerId: invoice.customer as string,
    amount: invoice.amount_paid,
    currency: invoice.currency,
    description: invoice.description || "Subscription payment",
    receiptUrl: invoice.hosted_invoice_url || undefined,
    invoiceId: invoice.id,
  });

  console.log(`Payment succeeded for invoice ${invoice.id}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripePaymentId = invoice.payment_intent as string;
  if (!stripePaymentId) return;

  await handlePaymentFailure({
    stripePaymentId,
    stripeCustomerId: invoice.customer as string,
    amount: invoice.amount_due,
    currency: invoice.currency,
    description: invoice.description || "Failed payment",
  });

  await logSecurityEvent(
    "payment_failed",
    "medium",
    `Payment failed for customer ${invoice.customer}`,
    { metadata: { invoiceId: invoice.id } }
  );

  console.log(`Payment failed for invoice ${invoice.id}`);
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  if (customer.email) {
    // Find org by customer ID and update billing email
    const { db } = await import("~/lib/prisma");
    const org = await db.organization.findFirst({
      where: { stripeCustomerId: customer.id },
    });

    if (org) {
      await organizationRepository.update(org.id, { billingEmail: customer.email });
    }
  }

  console.log(`Customer ${customer.id} updated`);
}

// ============================================
// Helpers
// ============================================

function mapSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): "ACTIVE" | "CANCELED" | "PAST_DUE" | "UNPAID" | "TRIALING" | "INCOMPLETE" | "INCOMPLETE_EXPIRED" {
  const statusMap: Record<Stripe.Subscription.Status, "ACTIVE" | "CANCELED" | "PAST_DUE" | "UNPAID" | "TRIALING" | "INCOMPLETE" | "INCOMPLETE_EXPIRED"> = {
    active: "ACTIVE",
    canceled: "CANCELED",
    past_due: "PAST_DUE",
    unpaid: "UNPAID",
    trialing: "TRIALING",
    incomplete: "INCOMPLETE",
    incomplete_expired: "INCOMPLETE_EXPIRED",
    paused: "ACTIVE",
  };
  return statusMap[stripeStatus] || "ACTIVE";
}
