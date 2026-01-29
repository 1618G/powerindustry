/**
 * Google OAuth - Initiate login flow
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { nanoid } from "nanoid";
import { getAuthUrl, isProviderEnabled } from "~/services/oauth.server";
import { getSession, commitSession } from "~/utils/session.server";

export async function loader({ request }: LoaderFunctionArgs) {
  if (!isProviderEnabled("google")) {
    return redirect("/login?error=Google+login+not+configured");
  }

  const session = await getSession(request);
  const state = nanoid(32);
  session.set("oauth_state", state);

  const authUrl = getAuthUrl("google", state);
  if (!authUrl) {
    return redirect("/login?error=OAuth+configuration+error");
  }

  return redirect(authUrl, {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

