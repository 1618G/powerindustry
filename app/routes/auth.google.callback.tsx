/**
 * Google OAuth Callback - Handle OAuth response
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import {
  exchangeCodeForTokens,
  fetchUserProfile,
  findOrCreateOAuthUser,
  createOAuthSession,
} from "~/services/oauth.server";
import { getSession } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirect(`/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return redirect("/login?error=Invalid+OAuth+response");
  }

  // Verify state
  const session = await getSession(request);
  const savedState = session.get("oauth_state");
  if (state !== savedState) {
    return redirect("/login?error=Invalid+OAuth+state");
  }

  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens("google", code);
  if (!tokens) {
    return redirect("/login?error=Failed+to+authenticate");
  }

  // Fetch user profile
  const profile = await fetchUserProfile("google", tokens.accessToken);
  if (!profile) {
    return redirect("/login?error=Failed+to+get+user+info");
  }

  // Add token info to profile
  profile.refreshToken = tokens.refreshToken;
  if (tokens.expiresIn) {
    profile.expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);
  }

  // Find or create user
  const user = await findOrCreateOAuthUser(profile);
  if (!user) {
    return redirect("/login?error=Failed+to+create+account");
  }

  // Create session and redirect
  return createOAuthSession(request, user.id, "/dashboard");
}

