/**
 * Registration Page - Business and Personal signup flows
 * SOC II Compliant with consent tracking
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useNavigation, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faBuilding,
  faEnvelope,
  faLock,
  faEye,
  faEyeSlash,
  faArrowRight,
} from "@fortawesome/free-solid-svg-icons";
import { faGoogle, faGithub } from "@fortawesome/free-brands-svg-icons";

import { Navigation, Footer } from "~/components";
import { getUserId } from "~/utils/session.server";
import { registrationSchema, hashPassword } from "~/services/security.server";
import { recordConsent, validatePasswordStrength, logAuditTrail } from "~/services/soc2-compliance.server";
import { withRateLimit } from "~/services/rate-limit.server";
import { createUserSession } from "~/utils/auth.server";
import { userRepository, organizationRepository } from "~/repositories";
import { sendEmail, welcomeEmail } from "~/services/email.server";

export const meta: MetaFunction = () => [
  { title: "Create Account - ZZA Platform" },
  { name: "description", content: "Sign up for a personal or business account" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) return redirect("/dashboard");
  return json({});
}

export async function action({ request }: ActionFunctionArgs) {
  // Rate limiting
  const rateCheck = await withRateLimit(request, "register", "auth");
  if ("status" in rateCheck) return rateCheck;

  const formData = await request.formData();
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0].trim();
  const userAgent = request.headers.get("user-agent") || "";

  // Parse form data
  const rawData = {
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
    userType: formData.get("userType") || "PERSONAL",
    organizationName: formData.get("organizationName"),
    terms: formData.get("terms") === "on",
    marketing: formData.get("marketing") === "on",
  };

  // Validate with Zod
  const result = registrationSchema.safeParse(rawData);
  if (!result.success) {
    return json(
      { errors: result.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = result.data;

  // Check password strength
  const passwordCheck = validatePasswordStrength(data.password);
  if (!passwordCheck.valid) {
    return json(
      { errors: { password: passwordCheck.feedback } },
      { status: 400 }
    );
  }

  // Check if email exists using repository
  const emailExists = await userRepository.emailExists(data.email);
  if (emailExists) {
    return json(
      { errors: { email: ["An account with this email already exists"] } },
      { status: 400 }
    );
  }

  // If business account, check org slug
  if (data.userType === "BUSINESS" && data.organizationName) {
    const slug = data.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);

    const slugExists = await organizationRepository.slugExists(slug);
    if (slugExists) {
      return json(
        { errors: { organizationName: ["This organization name is already taken"] } },
        { status: 400 }
      );
    }
  }

  // Hash password
  const passwordHash = await hashPassword(data.password);

  // Create user using repository
  const user = await userRepository.create({
    email: data.email,
    passwordHash,
    name: data.name,
  });

  // Create organization if business
  if (data.userType === "BUSINESS" && data.organizationName) {
    const slug = data.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);

    const org = await organizationRepository.create({
      name: data.organizationName,
      slug,
      ownerId: user.id,
    });

    await userRepository.update(user.id, { organizationId: org.id });
  }

  // Record consent
  await recordConsent(user.id, "terms", "1.0", true, ipAddress, userAgent);
  await recordConsent(user.id, "privacy", "1.0", true, ipAddress, userAgent);
  if (data.marketing) {
    await recordConsent(user.id, "marketing", "1.0", true, ipAddress, userAgent);
  }

  // Audit log
  await logAuditTrail(user.id, "user.registered", {
    resource: "user",
    resourceId: user.id,
    newValue: { email: data.email, userType: data.userType },
    ipAddress,
    userAgent,
  });

  // Send welcome email
  await sendEmail({
    to: data.email,
    subject: `Welcome to ${process.env.APP_NAME || "ZZA Platform"}`,
    html: welcomeEmail(data.name || data.email),
  });

  // Create session
  return createUserSession({
    request,
    userId: user.id,
    remember: true,
    redirectTo: data.userType === "BUSINESS" ? "/onboarding/business" : "/dashboard",
  });
}

export default function RegisterPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const isSubmitting = navigation.state === "submitting";

  const [userType, setUserType] = useState<"PERSONAL" | "BUSINESS">(
    (searchParams.get("type")?.toUpperCase() as "PERSONAL" | "BUSINESS") || "PERSONAL"
  );
  const [showPassword, setShowPassword] = useState(false);

  const errors = (actionData as { errors?: Record<string, string[]> })?.errors || {};

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center px-4 py-16 pt-24">
        <div className="w-full max-w-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Create your account</h1>
            <p className="mt-2 text-gray-600">Start building with ZZA Platform</p>
          </div>

          {/* Account Type Toggle */}
          <div className="mt-8 flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setUserType("PERSONAL")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition ${
                userType === "PERSONAL"
                  ? "bg-white text-gray-900 shadow"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <FontAwesomeIcon icon={faUser} />
              Personal
            </button>
            <button
              type="button"
              onClick={() => setUserType("BUSINESS")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition ${
                userType === "BUSINESS"
                  ? "bg-white text-gray-900 shadow"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <FontAwesomeIcon icon={faBuilding} />
              Business
            </button>
          </div>

          <Form method="post" className="mt-6 space-y-5">
            <input type="hidden" name="userType" value={userType} />

            {/* Name */}
            <div>
              <label htmlFor="name" className="label">Full name</label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                className={`input ${errors.name ? "input-error" : ""}`}
                placeholder="John Doe"
              />
              {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name[0]}</p>}
            </div>

            {/* Organization Name (Business only) */}
            {userType === "BUSINESS" && (
              <div>
                <label htmlFor="organizationName" className="label">Organization name</label>
                <input
                  id="organizationName"
                  name="organizationName"
                  type="text"
                  className={`input ${errors.organizationName ? "input-error" : ""}`}
                  placeholder="Acme Inc."
                />
                {errors.organizationName && (
                  <p className="mt-1 text-sm text-red-600">{errors.organizationName[0]}</p>
                )}
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="label">Email address</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`input pl-10 ${errors.email ? "input-error" : ""}`}
                  placeholder="you@example.com"
                />
              </div>
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email[0]}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <FontAwesomeIcon icon={faLock} className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  className={`input pl-10 pr-10 ${errors.password ? "input-error" : ""}`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                >
                  <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} />
                </button>
              </div>
              {errors.password && (
                <div className="mt-1 text-sm text-red-600">
                  {errors.password.map((err, i) => <p key={i}>{err}</p>)}
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500">
                8+ characters, uppercase, lowercase, number, and special character
              </p>
            </div>

            {/* Terms & Conditions */}
            <div className="space-y-3">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="terms"
                  required
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600">
                  I agree to the{" "}
                  <Link to="/terms" className="text-primary-600 hover:underline">Terms of Service</Link>
                  {" "}and{" "}
                  <Link to="/privacy" className="text-primary-600 hover:underline">Privacy Policy</Link>
                </span>
              </label>
              {errors.terms && <p className="text-sm text-red-600">{errors.terms[0]}</p>}

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  name="marketing"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-600">
                  Send me product updates and marketing emails (optional)
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-3">
              {isSubmitting ? (
                "Creating account..."
              ) : (
                <>
                  Create {userType === "BUSINESS" ? "Business" : "Personal"} Account
                  <FontAwesomeIcon icon={faArrowRight} className="ml-2" />
                </>
              )}
            </button>
          </Form>

          {/* OAuth Options */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-gray-50 px-2 text-gray-500">Or continue with</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <a
                href="/auth/google"
                className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FontAwesomeIcon icon={faGoogle} className="text-red-500" />
                Google
              </a>
              <a
                href="/auth/github"
                className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <FontAwesomeIcon icon={faGithub} />
                GitHub
              </a>
            </div>
          </div>

          {/* Sign In Link */}
          <p className="mt-8 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-primary-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <Footer />
    </div>
  );
}
