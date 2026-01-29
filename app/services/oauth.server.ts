/**
 * OAuth Service - Handles OAuth authentication with multiple providers
 * Supports: Google, GitHub, Microsoft
 */

import { db } from "~/lib/prisma";
import { createUserSession } from "~/utils/session.server";

// ============================================
// Types
// ============================================

export interface OAuthProfile {
  provider: string;
  providerUserId: string;
  email: string;
  name?: string;
  avatar?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
  scopes: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

// ============================================
// Provider Configurations
// ============================================

const providers: Record<string, () => OAuthConfig | null> = {
  google: () => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${process.env.APP_URL}/auth/google/callback`;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      callbackUrl,
      scopes: ["openid", "email", "profile"],
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
    };
  },
  github: () => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL || `${process.env.APP_URL}/auth/github/callback`;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      callbackUrl,
      scopes: ["read:user", "user:email"],
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      userInfoUrl: "https://api.github.com/user",
    };
  },
  microsoft: () => {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
    const callbackUrl = process.env.MICROSOFT_CALLBACK_URL || `${process.env.APP_URL}/auth/microsoft/callback`;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      callbackUrl,
      scopes: ["openid", "email", "profile", "User.Read"],
      authUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      userInfoUrl: "https://graph.microsoft.com/v1.0/me",
    };
  },
};

// ============================================
// Helper Functions
// ============================================

export function getEnabledProviders(): string[] {
  return Object.entries(providers)
    .filter(([, getConfig]) => getConfig() !== null)
    .map(([name]) => name);
}

export function isProviderEnabled(provider: string): boolean {
  const config = providers[provider]?.();
  return config !== null;
}

export function getAuthUrl(provider: string, state: string): string | null {
  const config = providers[provider]?.();
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });

  // Provider-specific params
  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }

  return `${config.authUrl}?${params.toString()}`;
}

// ============================================
// Token Exchange
// ============================================

export async function exchangeCodeForTokens(
  provider: string,
  code: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null> {
  const config = providers[provider]?.();
  if (!config) return null;

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.callbackUrl,
    grant_type: "authorization_code",
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    console.error(`OAuth token exchange failed: ${response.status}`);
    return null;
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// ============================================
// User Profile Fetching
// ============================================

export async function fetchUserProfile(provider: string, accessToken: string): Promise<OAuthProfile | null> {
  const config = providers[provider]?.();
  if (!config) return null;

  const response = await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    console.error(`OAuth profile fetch failed: ${response.status}`);
    return null;
  }

  const data = await response.json();

  // Normalize profile data based on provider
  switch (provider) {
    case "google":
      return {
        provider,
        providerUserId: data.sub,
        email: data.email,
        name: data.name,
        avatar: data.picture,
        accessToken,
      };
    case "github":
      // GitHub may require separate email fetch
      let email = data.email;
      if (!email) {
        const emailResponse = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (emailResponse.ok) {
          const emails = await emailResponse.json();
          const primary = emails.find((e: { primary: boolean }) => e.primary);
          email = primary?.email || emails[0]?.email;
        }
      }
      return {
        provider,
        providerUserId: String(data.id),
        email,
        name: data.name || data.login,
        avatar: data.avatar_url,
        accessToken,
      };
    case "microsoft":
      return {
        provider,
        providerUserId: data.id,
        email: data.mail || data.userPrincipalName,
        name: data.displayName,
        avatar: undefined, // Microsoft requires separate photo endpoint
        accessToken,
      };
    default:
      return null;
  }
}

// ============================================
// User Creation/Linking
// ============================================

export async function findOrCreateOAuthUser(profile: OAuthProfile): Promise<{ id: string; email: string } | null> {
  // Check if OAuth account already exists
  const existingAccount = await db.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
      },
    },
    include: { user: true },
  });

  if (existingAccount) {
    // Update tokens
    await db.oAuthAccount.update({
      where: { id: existingAccount.id },
      data: {
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        expiresAt: profile.expiresAt,
      },
    });

    // Update last login
    await db.user.update({
      where: { id: existingAccount.userId },
      data: { lastLoginAt: new Date() },
    });

    return { id: existingAccount.user.id, email: existingAccount.user.email };
  }

  // Check if user exists with same email
  const existingUser = await db.user.findUnique({
    where: { email: profile.email },
  });

  if (existingUser) {
    // Link OAuth account to existing user
    await db.oAuthAccount.create({
      data: {
        userId: existingUser.id,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
        expiresAt: profile.expiresAt,
      },
    });

    // Mark email as verified (OAuth confirms email ownership)
    await db.user.update({
      where: { id: existingUser.id },
      data: { emailVerified: true, lastLoginAt: new Date() },
    });

    return { id: existingUser.id, email: existingUser.email };
  }

  // Create new user with OAuth account
  const newUser = await db.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      emailVerified: true,
      oauthAccounts: {
        create: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
          accessToken: profile.accessToken,
          refreshToken: profile.refreshToken,
          expiresAt: profile.expiresAt,
        },
      },
      profile: profile.avatar
        ? { create: { avatar: profile.avatar } }
        : undefined,
    },
  });

  return { id: newUser.id, email: newUser.email };
}

// ============================================
// Session Creation
// ============================================

export async function createOAuthSession(
  request: Request,
  userId: string,
  redirectTo: string = "/dashboard"
) {
  return createUserSession({
    request,
    userId,
    remember: true,
    redirectTo,
  });
}

