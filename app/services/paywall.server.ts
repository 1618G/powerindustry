/**
 * Paywall Service - Subscription gating and feature access control
 * Provides middleware and utilities for paid feature protection
 */

import { redirect, json } from "@remix-run/node";
import { db } from "~/lib/prisma";
import { getActiveSubscription } from "./stripe.server";

// ============================================
// Types
// ============================================

export interface FeatureAccess {
  allowed: boolean;
  reason?: string;
  upgradeUrl?: string;
  currentPlan?: string;
  requiredPlan?: string;
}

export interface PlanLimits {
  users?: number;
  storage?: number;  // In MB
  aiTokens?: number;
  apiCalls?: number;
  features?: string[];
}

// ============================================
// Plan Configuration
// ============================================

const PLAN_FEATURES: Record<string, PlanLimits> = {
  free: {
    users: 1,
    storage: 100,  // 100 MB
    aiTokens: 1000,
    apiCalls: 100,
    features: ["basic_dashboard", "contact_form"],
  },
  starter: {
    users: 3,
    storage: 1024,  // 1 GB
    aiTokens: 10000,
    apiCalls: 1000,
    features: ["basic_dashboard", "contact_form", "file_upload", "api_access"],
  },
  professional: {
    users: 10,
    storage: 10240,  // 10 GB
    aiTokens: 100000,
    apiCalls: 10000,
    features: ["basic_dashboard", "contact_form", "file_upload", "api_access", "ai_assistant", "analytics", "custom_domain"],
  },
  enterprise: {
    users: -1,  // Unlimited
    storage: 102400,  // 100 GB
    aiTokens: -1,  // Unlimited
    apiCalls: -1,  // Unlimited
    features: ["basic_dashboard", "contact_form", "file_upload", "api_access", "ai_assistant", "analytics", "custom_domain", "sso", "audit_logs", "priority_support"],
  },
};

// ============================================
// Access Control
// ============================================

export async function checkFeatureAccess(
  featureName: string,
  userId?: string,
  organizationId?: string
): Promise<FeatureAccess> {
  // Get active subscription
  const subscription = await getActiveSubscription(userId, organizationId);

  if (!subscription) {
    // Free tier
    const freeLimits = PLAN_FEATURES.free;
    if (freeLimits.features?.includes(featureName)) {
      return { allowed: true, currentPlan: "free" };
    }
    return {
      allowed: false,
      reason: "This feature requires a paid subscription",
      upgradeUrl: "/pricing",
      currentPlan: "free",
      requiredPlan: findPlanWithFeature(featureName),
    };
  }

  const planLimits = PLAN_FEATURES[subscription.plan.toLowerCase()] || PLAN_FEATURES.free;

  if (planLimits.features?.includes(featureName)) {
    return { allowed: true, currentPlan: subscription.plan };
  }

  return {
    allowed: false,
    reason: `This feature is not included in your ${subscription.plan} plan`,
    upgradeUrl: "/pricing",
    currentPlan: subscription.plan,
    requiredPlan: findPlanWithFeature(featureName),
  };
}

export async function checkUsageLimit(
  limitType: keyof PlanLimits,
  currentUsage: number,
  userId?: string,
  organizationId?: string
): Promise<FeatureAccess> {
  const subscription = await getActiveSubscription(userId, organizationId);
  const plan = subscription?.plan.toLowerCase() || "free";
  const limits = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

  const limit = limits[limitType] as number | undefined;

  if (limit === undefined) {
    return { allowed: true, currentPlan: plan };
  }

  if (limit === -1) {
    // Unlimited
    return { allowed: true, currentPlan: plan };
  }

  if (currentUsage >= limit) {
    return {
      allowed: false,
      reason: `You've reached your ${limitType} limit (${limit})`,
      upgradeUrl: "/pricing",
      currentPlan: plan,
      requiredPlan: findPlanWithHigherLimit(limitType, limit),
    };
  }

  return { allowed: true, currentPlan: plan };
}

// ============================================
// Middleware
// ============================================

export async function requireSubscription(
  request: Request,
  userId?: string,
  organizationId?: string,
  requiredPlan?: string
): Promise<void> {
  const subscription = await getActiveSubscription(userId, organizationId);

  if (!subscription) {
    throw redirect("/pricing?reason=subscription_required");
  }

  if (requiredPlan && subscription.plan.toLowerCase() !== requiredPlan.toLowerCase()) {
    const planOrder = ["free", "starter", "professional", "enterprise"];
    const currentIndex = planOrder.indexOf(subscription.plan.toLowerCase());
    const requiredIndex = planOrder.indexOf(requiredPlan.toLowerCase());

    if (currentIndex < requiredIndex) {
      throw redirect(`/pricing?reason=upgrade_required&current=${subscription.plan}&required=${requiredPlan}`);
    }
  }
}

export async function requireFeature(
  request: Request,
  featureName: string,
  userId?: string,
  organizationId?: string
): Promise<void> {
  const access = await checkFeatureAccess(featureName, userId, organizationId);

  if (!access.allowed) {
    throw redirect(`/pricing?reason=feature_required&feature=${featureName}`);
  }
}

export function featureNotAvailable(access: FeatureAccess) {
  return json(
    {
      error: "Feature not available",
      reason: access.reason,
      currentPlan: access.currentPlan,
      requiredPlan: access.requiredPlan,
      upgradeUrl: access.upgradeUrl,
    },
    { status: 402 }
  );
}

// ============================================
// Usage Tracking
// ============================================

export async function getUsageCounts(
  userId?: string,
  organizationId?: string
): Promise<{
  storage: number;
  aiTokens: number;
  apiCalls: number;
  users: number;
}> {
  const [files, aiUsage, orgUsers] = await Promise.all([
    db.file.aggregate({
      where: { userId },
      _sum: { size: true },
    }),
    db.aIUsage.aggregate({
      where: {
        OR: [{ userId }, { organizationId }],
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
      _sum: { totalTokens: true },
    }),
    organizationId
      ? db.user.count({ where: { organizationId } })
      : Promise.resolve(1),
  ]);

  return {
    storage: Math.round((files._sum.size || 0) / 1024 / 1024),  // Convert to MB
    aiTokens: aiUsage._sum.totalTokens || 0,
    apiCalls: 0,  // Would track from rate limit entries or API key usage
    users: orgUsers,
  };
}

export async function getUsageWithLimits(
  userId?: string,
  organizationId?: string
): Promise<{
  usage: { storage: number; aiTokens: number; apiCalls: number; users: number };
  limits: PlanLimits;
  percentages: Record<string, number>;
}> {
  const usage = await getUsageCounts(userId, organizationId);
  const subscription = await getActiveSubscription(userId, organizationId);
  const plan = subscription?.plan.toLowerCase() || "free";
  const limits = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

  const percentages: Record<string, number> = {};

  if (limits.storage && limits.storage !== -1) {
    percentages.storage = Math.round((usage.storage / limits.storage) * 100);
  }
  if (limits.aiTokens && limits.aiTokens !== -1) {
    percentages.aiTokens = Math.round((usage.aiTokens / limits.aiTokens) * 100);
  }
  if (limits.users && limits.users !== -1) {
    percentages.users = Math.round((usage.users / limits.users) * 100);
  }

  return { usage, limits, percentages };
}

// ============================================
// Helper Functions
// ============================================

function findPlanWithFeature(featureName: string): string | undefined {
  const planOrder = ["starter", "professional", "enterprise"];

  for (const plan of planOrder) {
    if (PLAN_FEATURES[plan].features?.includes(featureName)) {
      return plan;
    }
  }

  return undefined;
}

function findPlanWithHigherLimit(limitType: keyof PlanLimits, currentLimit: number): string | undefined {
  const planOrder = ["starter", "professional", "enterprise"];

  for (const plan of planOrder) {
    const limit = PLAN_FEATURES[plan][limitType] as number;
    if (limit === -1 || limit > currentLimit) {
      return plan;
    }
  }

  return undefined;
}

export function getPlanFeatures(planName: string): PlanLimits {
  return PLAN_FEATURES[planName.toLowerCase()] || PLAN_FEATURES.free;
}

export function getAllPlans(): Array<{ name: string; limits: PlanLimits }> {
  return Object.entries(PLAN_FEATURES).map(([name, limits]) => ({ name, limits }));
}

