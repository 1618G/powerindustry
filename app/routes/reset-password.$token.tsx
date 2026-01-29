/**
 * Reset Password - Complete password reset with token
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faCheck, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";

import { verifyPasswordResetToken, completePasswordReset } from "~/services/auth.service";
import { passwordSchema } from "~/services/security.server";

export const meta: MetaFunction = () => [
  { title: "Reset Password" },
  { name: "description", content: "Set your new password" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const { token } = params;

  if (!token) {
    return json({ valid: false, error: "Invalid reset link" });
  }

  const result = await verifyPasswordResetToken(token);

  if (!result) {
    return json({ valid: false, error: "This reset link is invalid or has expired" });
  }

  return json({ valid: true, token });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { token } = params;

  if (!token) {
    return json({ error: "Invalid reset link" }, { status: 400 });
  }

  const formData = await request.formData();
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  // Validate passwords match
  if (password !== confirmPassword) {
    return json({ error: "Passwords do not match" }, { status: 400 });
  }

  // Validate password strength
  const passwordParsed = passwordSchema.safeParse(password);
  if (!passwordParsed.success) {
    return json({ 
      error: passwordParsed.error.errors[0]?.message || "Password is too weak" 
    }, { status: 400 });
  }

  try {
    await completePasswordReset(token, password);
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset password";
    return json({ error: message }, { status: 400 });
  }
}

export default function ResetPasswordPage() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Show success message
  if (actionData?.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <FontAwesomeIcon icon={faCheck} className="h-8 w-8 text-green-400" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">Password Reset!</h1>
            <p className="mb-6 text-gray-400">
              Your password has been successfully reset. You can now log in with your new password.
            </p>
            <Link
              to="/login"
              className="inline-block w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600"
            >
              Go to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Show error for invalid token
  if (!loaderData.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20">
              <FontAwesomeIcon icon={faExclamationTriangle} className="h-8 w-8 text-yellow-400" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-white">Invalid Link</h1>
            <p className="mb-6 text-gray-400">{loaderData.error}</p>
            <Link
              to="/forgot-password"
              className="inline-block w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600"
            >
              Request New Reset Link
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
            <h1 className="text-2xl font-bold text-white">Set New Password</h1>
            <p className="mt-2 text-gray-400">
              Create a strong password for your account
            </p>
          </div>

          <Form method="post" className="space-y-4">
            {actionData?.error && (
              <div className="rounded-lg bg-red-500/10 p-4 text-sm text-red-400">
                {actionData.error}
              </div>
            )}

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-300">
                New Password
              </label>
              <div className="relative">
                <FontAwesomeIcon
                  icon={faLock}
                  className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="password"
                  id="password"
                  name="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  placeholder="••••••••"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Min 8 characters, include uppercase, lowercase, number, and special character
              </p>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-gray-300">
                Confirm Password
              </label>
              <div className="relative">
                <FontAwesomeIcon
                  icon={faLock}
                  className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500"
                />
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 py-3 pl-10 pr-4 text-white placeholder-gray-500 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-red-500 py-3 font-semibold text-white transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50"
            >
              {isSubmitting ? "Resetting..." : "Reset Password"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
