/**
 * Notifications Service - Push, in-app, and email notification management
 * Provides unified notification system across all channels
 */

import { db } from "~/lib/prisma";
import { sendEmail } from "./email.server";

// ============================================
// Types
// ============================================

export type NotificationType = "in_app" | "email" | "push" | "all";

export interface NotificationPayload {
  userId: string;
  title: string;
  body: string;
  type?: NotificationType;
  data?: Record<string, unknown>;
  link?: string;
  priority?: "low" | "normal" | "high";
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  inApp: boolean;
  digest: "instant" | "daily" | "weekly" | "none";
  categories: Record<string, boolean>;
}

// ============================================
// Default Preferences
// ============================================

const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: true,
  push: true,
  inApp: true,
  digest: "instant",
  categories: {
    security: true,
    billing: true,
    updates: true,
    marketing: false,
    social: true,
  },
};

// ============================================
// Create Notification
// ============================================

export async function createNotification(payload: NotificationPayload): Promise<string> {
  const { userId, title, body, type = "all", data, link, priority = "normal" } = payload;

  // Get user preferences
  const preferences = await getNotificationPreferences(userId);

  // Create in-app notification
  if (type === "in_app" || type === "all") {
    if (preferences.inApp) {
      await db.notification.create({
        data: {
          userId,
          type: "in_app",
          title,
          body,
          data: { ...data, link, priority } as object,
        },
      });
    }
  }

  // Send email notification
  if (type === "email" || type === "all") {
    if (preferences.email && preferences.digest === "instant") {
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user) {
        await sendEmail({
          to: user.email,
          subject: title,
          html: generateNotificationEmail(title, body, link, user.name),
        });
      }
    }
  }

  // Push notification placeholder
  if (type === "push" || type === "all") {
    if (preferences.push) {
      await sendPushNotification(userId, title, body, data);
    }
  }

  return `notification-${Date.now()}`;
}

// ============================================
// Batch Notifications
// ============================================

export async function createBulkNotifications(
  userIds: string[],
  payload: Omit<NotificationPayload, "userId">
): Promise<number> {
  let count = 0;

  for (const userId of userIds) {
    await createNotification({ ...payload, userId });
    count++;
  }

  return count;
}

export async function notifyOrganization(
  organizationId: string,
  payload: Omit<NotificationPayload, "userId">
): Promise<number> {
  const members = await db.user.findMany({
    where: { organizationId },
    select: { id: true },
  });

  return createBulkNotifications(
    members.map((m) => m.id),
    payload
  );
}

// ============================================
// Get Notifications
// ============================================

export async function getNotifications(
  userId: string,
  options: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ notifications: Array<object>; unreadCount: number }> {
  const { unreadOnly = false, limit = 50, offset = 0 } = options;

  const where = {
    userId,
    type: "in_app",
    ...(unreadOnly && { read: false }),
  };

  const [notifications, unreadCount] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.notification.count({
      where: { userId, type: "in_app", read: false },
    }),
  ]);

  return { notifications, unreadCount };
}

// ============================================
// Mark as Read
// ============================================

export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const notification = await db.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) return false;

  await db.notification.update({
    where: { id: notificationId },
    data: { read: true, readAt: new Date() },
  });

  return true;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, read: false },
    data: { read: true, readAt: new Date() },
  });

  return result.count;
}

// ============================================
// Preferences
// ============================================

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const setting = await db.setting.findFirst({
    where: { key: `notification_prefs_${userId}` },
  });

  if (!setting) return DEFAULT_PREFERENCES;

  try {
    return JSON.parse(setting.value) as NotificationPreferences;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const current = await getNotificationPreferences(userId);
  const updated = { ...current, ...preferences };

  await db.setting.upsert({
    where: { key: `notification_prefs_${userId}` },
    create: {
      key: `notification_prefs_${userId}`,
      value: JSON.stringify(updated),
      type: "json",
    },
    update: {
      value: JSON.stringify(updated),
    },
  });

  return updated;
}

// ============================================
// Push Notifications (Placeholder)
// ============================================

async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  // TODO: Implement with Firebase FCM, OneSignal, or similar
  console.log(`[Push] Would send to ${userId}: ${title}`);
}

// ============================================
// Email Template
// ============================================

function generateNotificationEmail(
  title: string,
  body: string,
  link?: string,
  name?: string | null
): string {
  const appName = process.env.APP_NAME || "ZZA Platform";
  const appUrl = process.env.APP_URL || "http://localhost:3000";

  return `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #4F46E5; margin: 0;">${appName}</h1>
        </div>
        
        <div style="background: #f9fafb; border-radius: 8px; padding: 24px;">
          <h2 style="margin-top: 0; color: #111827;">${title}</h2>
          <p style="color: #6b7280; line-height: 1.6;">Hi${name ? ` ${name}` : ""},</p>
          <p style="color: #374151; line-height: 1.6;">${body}</p>
          
          ${link ? `
            <p style="text-align: center; margin: 24px 0;">
              <a href="${link}" style="background: #4F46E5; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
                View Details
              </a>
            </p>
          ` : ""}
        </div>
        
        <div style="text-align: center; margin-top: 24px; color: #9ca3af; font-size: 12px;">
          <p>You received this because you have notifications enabled.</p>
          <p><a href="${appUrl}/settings/notifications" style="color: #6b7280;">Manage preferences</a></p>
        </div>
      </body>
    </html>
  `;
}

// ============================================
// Notification Templates
// ============================================

export const NotificationTemplates = {
  welcome: (userId: string) =>
    createNotification({
      userId,
      title: "Welcome to the platform! 🎉",
      body: "Your account is ready. Start exploring your dashboard.",
      link: "/dashboard",
    }),

  paymentReceived: (userId: string, amount: number) =>
    createNotification({
      userId,
      title: "Payment received",
      body: `We've received your payment of $${(amount / 100).toFixed(2)}.`,
      type: "all",
      data: { category: "billing" },
    }),

  subscriptionExpiring: (userId: string, daysLeft: number) =>
    createNotification({
      userId,
      title: "Subscription expiring soon",
      body: `Your subscription expires in ${daysLeft} days. Renew to keep access.`,
      link: "/dashboard/billing",
      priority: "high",
    }),

  securityAlert: (userId: string, message: string) =>
    createNotification({
      userId,
      title: "Security Alert",
      body: message,
      type: "all",
      priority: "high",
      data: { category: "security" },
    }),

  teamInvite: (userId: string, orgName: string, inviteLink: string) =>
    createNotification({
      userId,
      title: `You've been invited to ${orgName}`,
      body: "Click to accept the invitation and join the team.",
      link: inviteLink,
    }),
};

// ============================================
// Cleanup
// ============================================

export async function cleanupOldNotifications(daysOld: number = 90): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  const result = await db.notification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      read: true,
    },
  });

  return result.count;
}

