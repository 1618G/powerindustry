/**
 * Forgot Password - Request password reset email
 */

import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faArrowLeft, faCheck } from "@fortawesome/free-solid-svg-icons";

import { createPasswordResetToken } from "~/utils/auth.server";
import { sendEmail, passwordResetEmail } from "~/services/email.server";
import { withRateLimit } from "~/services/rate-limit.server";
import { emailSchema } from "~/services/security.server";
import { logAuditTrail } from "~/services/soc2-compliance.server";

export const meta: MetaFunction = () => [
  { title: "Forgot Password" },
  { name: "description", content: "Reset your password" },
];

export async function action({ request }: ActionFunctionArgs) {
  // Rate limit password reset requests
  const rateLimitResult = await withRateLimit(request, "forgot-password", "strict");
  if (rateLimitResult instanceof Response) {
    return rateLimitResult;
  }

  const formData = await request.formData();
  const email = formData.get("email");

  // Validate email
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return json({ error: "Please enter a valid email address" }, { status: 400 });
  }

  const validEmail = parsed.data.toLowerCase();

  try {
    // Create reset token (returns null if user doesn't exist, but we don't reveal that)
    const token = await createPasswordResetToken(validEmail);

    // Only send email if user exists
    if (token) {
      const resetUrl = `${process.env.APP_URL || "http://localhost:3000"}/reset-password/${token}`;
      
      await sendEmail({
        to: validEmail,
        subject: "Reset Your Password",
        html: passwordResetEmail(resetUrl),
      });

      // Log the password reset request
      await logAuditTrail(null, "password_reset.requested", {
        details: { email: validEmail },
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0].trim(),
      });
    }

    // Always return success to prevent email enumeration
    return json({ success: true });
  } catch (error) {
    console.error("Password reset error:", error);
    return json({ error: "An error occurred. Please try again." }, { status: 500 });
  }
}

export default function ForgotPasswordPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (actionData?.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <FontAwesomeIcon icon={faCheck} className="h-8 w-8 text-green-400" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">Check Your Email</h1>
            <p className="mb-6 text-gray-400">
              If an account exists with that email, we've sent password reset instructions.
            </p>
            <p className="mb-6 text-sm text-gray-500">
              Didn't receive the email? Check your spam folder or try again.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-red-400 hover:text-red-300"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-white">Forgot Password?</h1>
            <p className="mt-2 text-gray-400">
              Enter your email and we'll send you a reset link
            </p>
          </div>

          <Form method="post" className="space-y-4">
            {actionData?.error && (
              <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400">
                {actionData.error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-300">
                Email Address
              </label>
              <div className="relative">
                <FontAwesomeIcon
                  icon={faEnvelope}
                  className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send Reset Link"}
            </button>
          </Form>

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
