/**
 * Verify Email - Complete email verification with token
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";

import { verifyEmailToken } from "~/services/auth.service";
import { recordConsent } from "~/services/soc2-compliance.server";
import { magicLinkRepository } from "~/repositories";

export const meta: MetaFunction = () => [
  { title: "Verify Email" },
  { name: "description", content: "Verify your email address" },
];

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { token } = params;

  if (!token) {
    return json({ success: false, error: "Invalid verification link" });
  }

  try {
    const result = await verifyEmailToken(token);

    if (result.alreadyVerified) {
      return json({ 
        success: true, 
        alreadyVerified: true,
        message: "Your email has already been verified" 
      });
    }

    if (!result.success) {
      return json({ 
        success: false, 
        error: "This verification link is invalid or has expired. Please request a new one." 
      });
    }

    // Get user ID for consent recording
    const magicLink = await magicLinkRepository.findByToken(token);
    if (magicLink) {
      await recordConsent(
        magicLink.userId,
        "email_verification",
        "1.0",
        true,
        request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
        request.headers.get("user-agent") || undefined
      );
    }

    return json({ success: true, message: "Your email has been verified!" });
  } catch (error) {
    console.error("Email verification error:", error);
    return json({ success: false, error: "Verification failed. Please try again." });
  }
}

export default function VerifyEmailPage() {
  const data = useLoaderData<typeof loader>();

  if (data.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <FontAwesomeIcon icon={faCheck} className="h-8 w-8 text-green-400" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">Email Verified!</h1>
            <p className="mb-6 text-gray-400">{data.message}</p>
            <Link
              to="/dashboard"
              className="inline-block w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20">
            <FontAwesomeIcon icon={faExclamationTriangle} className="h-8 w-8 text-yellow-400" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white">Verification Failed</h1>
          <p className="mb-6 text-gray-400">{data.error}</p>
          <div className="space-y-3">
            <Link
              to="/dashboard"
              className="inline-block w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600"
            >
              Go to Dashboard
            </Link>
            <Link
              to="/dashboard/settings"
              className="inline-block w-full rounded-lg border border-gray-700 bg-gray-800 py-3 font-semibold text-white transition hover:bg-gray-700"
            >
              Resend Verification Email
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
