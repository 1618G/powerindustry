/**
 * Magic Link Verification - Verify and log in user
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { verifyMagicLink } from "~/services/magic-link.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { token } = params;

  if (!token) {
    return redirect("/login?error=invalid-link");
  }

  const result = await verifyMagicLink(token, request);

  if ("error" in result) {
    const errorMessage = encodeURIComponent(result.error);
    return redirect(`/login?error=${errorMessage}`);
  }

  // Result is a Response (redirect to dashboard)
  return result;
}

export default function MagicLinkVerify() {
  // This should never render as loader always redirects
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Signing you in...</p>
      </div>
    </div>
  );
}

