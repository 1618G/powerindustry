/**
 * Webhooks Service - Outgoing webhook management
 * Allows platforms to send events to external services
 */

import crypto from "crypto";
import { db } from "~/lib/prisma";
import { logAuditTrail } from "./soc2-compliance.server";

// ============================================
// Types
// ============================================

export interface WebhookConfig {
  organizationId: string;
  url: string;
  events: string[];
  secret?: string;
}

export interface WebhookEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// Webhook Events
// ============================================

export const WebhookEventTypes = {
  // User events
  "user.created": "When a new user registers",
  "user.updated": "When user profile is updated",
  "user.deleted": "When a user is deleted",

  // Subscription events
  "subscription.created": "When a new subscription is created",
  "subscription.updated": "When subscription is updated",
  "subscription.cancelled": "When subscription is cancelled",

  // Payment events
  "payment.succeeded": "When payment is successful",
  "payment.failed": "When payment fails",
  "payment.refunded": "When payment is refunded",

  // Organization events
  "organization.member_added": "When member joins organization",
  "organization.member_removed": "When member leaves organization",

  // File events
  "file.uploaded": "When file is uploaded",
  "file.deleted": "When file is deleted",

  // Custom events
  "custom.event": "Custom application event",
} as const;

// ============================================
// Webhook Management
// ============================================

export async function createWebhook(config: WebhookConfig): Promise<string> {
  const secret = config.secret || crypto.randomBytes(32).toString("hex");

  const webhook = await db.webhook.create({
    data: {
      organizationId: config.organizationId,
      url: config.url,
      events: config.events,
      secret,
    },
  });

  await logAuditTrail(null, "webhook.created", {
    resource: "webhook",
    resourceId: webhook.id,
    newValue: { url: config.url, events: config.events },
  });

  return webhook.id;
}

export async function updateWebhook(
  webhookId: string,
  updates: Partial<WebhookConfig>
): Promise<boolean> {
  await db.webhook.update({
    where: { id: webhookId },
    data: {
      url: updates.url,
      events: updates.events,
      isActive: true,
    },
  });

  return true;
}

export async function deleteWebhook(webhookId: string): Promise<boolean> {
  await db.webhook.delete({ where: { id: webhookId } });
  return true;
}

export async function getWebhooks(organizationId: string) {
  return db.webhook.findMany({
    where: { organizationId },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      failCount: true,
      lastSuccess: true,
      createdAt: true,
    },
  });
}

export async function regenerateWebhookSecret(webhookId: string): Promise<string> {
  const secret = crypto.randomBytes(32).toString("hex");

  await db.webhook.update({
    where: { id: webhookId },
    data: { secret },
  });

  return secret;
}

// ============================================
// Webhook Delivery
// ============================================

export async function triggerWebhook(
  eventType: string,
  data: Record<string, unknown>,
  organizationId?: string
): Promise<number> {
  // Find all webhooks subscribed to this event
  const webhooks = await db.webhook.findMany({
    where: {
      isActive: true,
      events: { has: eventType },
      ...(organizationId && { organizationId }),
    },
  });

  let delivered = 0;

  for (const webhook of webhooks) {
    const success = await deliverWebhook(webhook, eventType, data);
    if (success) delivered++;
  }

  return delivered;
}

async function deliverWebhook(
  webhook: { id: string; url: string; secret: string },
  eventType: string,
  data: Record<string, unknown>,
  attempt: number = 1
): Promise<boolean> {
  const timestamp = Date.now();
  const payload = {
    id: `evt_${crypto.randomBytes(16).toString("hex")}`,
    type: eventType,
    data,
    timestamp: new Date(timestamp).toISOString(),
  };

  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, webhook.secret, timestamp);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": String(timestamp),
        "X-Webhook-ID": payload.id,
      },
      body: payloadString,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    // Log delivery
    await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: eventType,
        payload: payload as object,
        status: response.status,
        response: response.ok ? null : await response.text().catch(() => null),
        attempts: attempt,
      },
    });

    if (response.ok) {
      // Reset fail count on success
      await db.webhook.update({
        where: { id: webhook.id },
        data: { failCount: 0, lastSuccess: new Date() },
      });
      return true;
    }

    // Handle failure
    return handleWebhookFailure(webhook, eventType, data, attempt, response.status);
  } catch (error) {
    // Log delivery failure
    await db.webhookDelivery.create({
      data: {
        webhookId: webhook.id,
        event: eventType,
        payload: payload as object,
        status: 0,
        response: error instanceof Error ? error.message : "Unknown error",
        attempts: attempt,
      },
    });

    return handleWebhookFailure(webhook, eventType, data, attempt, 0);
  }
}

async function handleWebhookFailure(
  webhook: { id: string; url: string; secret: string },
  eventType: string,
  data: Record<string, unknown>,
  attempt: number,
  status: number
): Promise<boolean> {
  const MAX_ATTEMPTS = 5;
  const RETRY_DELAYS = [60, 300, 900, 3600, 7200]; // seconds: 1m, 5m, 15m, 1h, 2h

  // Update fail count
  const updated = await db.webhook.update({
    where: { id: webhook.id },
    data: { failCount: { increment: 1 } },
  });

  // Disable webhook after too many failures
  if (updated.failCount >= 10) {
    await db.webhook.update({
      where: { id: webhook.id },
      data: { isActive: false },
    });
    return false;
  }

  // Retry if under max attempts
  if (attempt < MAX_ATTEMPTS) {
    const delay = RETRY_DELAYS[attempt - 1] * 1000;
    setTimeout(() => {
      deliverWebhook(webhook, eventType, data, attempt + 1);
    }, delay);
  }

  return false;
}

// ============================================
// Signature Generation & Verification
// ============================================

function generateSignature(payload: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(signedPayload);
  return `v1=${hmac.digest("hex")}`;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number,
  toleranceSeconds: number = 300
): boolean {
  // Check timestamp freshness
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.abs(now - Math.floor(timestamp / 1000));
  if (diff > toleranceSeconds) {
    return false;
  }

  const expectedSignature = generateSignature(payload, secret, timestamp);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ============================================
// Webhook Testing
// ============================================

export async function testWebhook(webhookId: string): Promise<{
  success: boolean;
  status?: number;
  error?: string;
}> {
  const webhook = await db.webhook.findUnique({
    where: { id: webhookId },
  });

  if (!webhook) {
    return { success: false, error: "Webhook not found" };
  }

  const testPayload = {
    type: "webhook.test",
    data: { message: "This is a test webhook delivery" },
  };

  try {
    const timestamp = Date.now();
    const payloadString = JSON.stringify(testPayload);
    const signature = generateSignature(payloadString, webhook.secret, timestamp);

    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": String(timestamp),
        "X-Webhook-ID": `test_${Date.now()}`,
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000),
    });

    return {
      success: response.ok,
      status: response.status,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

// ============================================
// Delivery History
// ============================================

export async function getWebhookDeliveries(
  webhookId: string,
  options: { limit?: number; offset?: number } = {}
) {
  const { limit = 50, offset = 0 } = options;

  return db.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export async function retryWebhookDelivery(deliveryId: string): Promise<boolean> {
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { webhook: true },
  });

  if (!delivery || !delivery.webhook) return false;

  return deliverWebhook(
    delivery.webhook,
    delivery.event,
    delivery.payload as Record<string, unknown>,
    1
  );
}

// ============================================
// Cleanup
// ============================================

export async function cleanupWebhookDeliveries(daysOld: number = 30): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await db.webhookDelivery.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  return result.count;
}

