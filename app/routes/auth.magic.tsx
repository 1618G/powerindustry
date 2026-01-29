/**
 * Magic Link Authentication - Send magic link
 */

import type { ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faMagicWandSparkles, faCheck } from "@fortawesome/free-solid-svg-icons";

import { sendMagicLink } from "~/services/magic-link.server";
import { withRateLimit } from "~/services/rate-limit.server";
import { emailSchema } from "~/utils/validation";
import { Navigation, Footer } from "~/components";

export const meta: MetaFunction = () => [{ title: "Sign in with Magic Link" }];

export async function action({ request }: ActionFunctionArgs) {
  // Rate limit
  const rateCheck = await withRateLimit(request, "magic-link", "auth");
  if ("status" in rateCheck) return rateCheck;

  const formData = await request.formData();
  const emailResult = emailSchema.safeParse(formData.get("email"));

  if (!emailResult.success) {
    return json({ success: false, error: emailResult.error.errors[0].message }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  const result = await sendMagicLink(emailResult.data, ip);

  if (!result.success) {
    return json({ success: false, error: result.error }, { status: 400 });
  }

  return json({ success: true });
}

export default function MagicLinkPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
              <FontAwesomeIcon icon={faMagicWandSparkles} className="h-8 w-8 text-primary-600" />
            </div>
            <h1 className="mt-6 text-3xl font-bold text-gray-900">Sign in with Magic Link</h1>
            <p className="mt-2 text-gray-600">No password needed. We'll email you a secure sign-in link.</p>
          </div>

          {actionData?.success ? (
            <div className="mt-8 rounded-lg bg-green-50 p-6 text-center">
              <FontAwesomeIcon icon={faCheck} className="mx-auto h-12 w-12 text-green-500" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Check your email!</h3>
              <p className="mt-2 text-gray-600">
                We've sent a magic link to your email. Click it to sign in instantly.
              </p>
              <p className="mt-4 text-sm text-gray-500">
                Didn't receive it? Check your spam folder or{" "}
                <button onClick={() => window.location.reload()} className="text-primary-600 hover:underline">
                  try again
                </button>
              </p>
            </div>
          ) : (
            <Form method="post" className="mt-8 space-y-6">
              <div>
                <label htmlFor="email" className="label">Email address</label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className={`input pl-10 ${actionData?.error ? "input-error" : ""}`}
                    placeholder="you@example.com"
                  />
                </div>
                {actionData?.error && (
                  <p className="mt-1 text-sm text-red-600">{actionData.error}</p>
                )}
              </div>

              <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
                {isSubmitting ? (
                  "Sending..."
                ) : (
                  <>
                    <FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />
                    Send Magic Link
                  </>
                )}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-gray-500">Or sign in with</span>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Link to="/login" className="btn-secondary w-full">
                  Email & Password
                </Link>
                <Link to="/auth/oauth" className="btn-secondary w-full">
                  Social Login
                </Link>
              </div>
            </Form>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

