import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, Link, useActionData, useSearchParams, useSubmit } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faLock, faUserShield, faUser, faRocket } from "@fortawesome/free-solid-svg-icons";

import { verifyLogin } from "~/utils/auth.server";
import { createUserSession, getUserId } from "~/utils/session.server";
import { loginSchema } from "~/utils/validation";
import { config } from "~/lib/config.server";

// ============================================
// DEMO USERS - Customize for your platform
// ============================================
// These appear as quick-login buttons on the login page.
// Update after running create-new-project.sh to match your platform's roles.
const DEMO_USERS = [
  {
    email: "admin@example.com",
    password: "Demo123!",
    label: "Admin",
    description: "Full system access",
    icon: faUserShield,
    color: "bg-red-500 hover:bg-red-600",
  },
  {
    email: "user@example.com",
    password: "Demo123!",
    label: "User",
    description: "Standard dashboard",
    icon: faUser,
    color: "bg-primary-500 hover:bg-primary-600",
  },
  // Add more demo users as needed:
  // {
  //   email: "manager@example.com",
  //   password: "Demo123!",
  //   label: "Manager",
  //   description: "Team management",
  //   icon: faUsers,
  //   color: "bg-purple-500 hover:bg-purple-600",
  // },
];

export const meta: MetaFunction = () => [
  { title: "Sign In - ZZA Platform" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await getUserId(request);
  if (userId) return redirect("/dashboard");
  
  // Return whether we're in dev mode (to show demo logins)
  return json({ 
    isDev: config.isDevelopment,
    appName: config.app.name,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");
  const password = formData.get("password");
  const remember = formData.get("remember") === "on";
  const redirectTo = formData.get("redirectTo") || "/dashboard";

  // Validate input
  const result = loginSchema.safeParse({
    email,
    password,
    remember,
    redirectTo,
  });

  if (!result.success) {
    return json(
      { errors: result.error.flatten().fieldErrors, success: false },
      { status: 400 }
    );
  }

  const user = await verifyLogin(result.data.email, result.data.password);

  if (!user) {
    return json(
      { errors: { email: ["Invalid email or password"] }, success: false },
      { status: 400 }
    );
  }

  return createUserSession({
    request,
    userId: user.id,
    remember: result.data.remember,
    redirectTo: result.data.redirectTo as string,
  });
}

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  // Quick login handler for demo users
  const handleQuickLogin = (email: string, password: string) => {
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    formData.set("redirectTo", redirectTo);
    submit(formData, { method: "post" });
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gray-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link to="/" className="flex justify-center">
          <span className="text-3xl font-bold text-primary-600">ZZA Platform</span>
        </Link>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-gray-900">
          Sign in to your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{" "}
          <Link
            to="/register"
            className="font-medium text-primary-600 hover:text-primary-500"
          >
            create a new account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {/* Demo Quick Login Section */}
        <div className="mb-6 bg-white px-4 py-5 shadow sm:rounded-lg sm:px-6">
          <div className="flex items-center gap-2 mb-4">
            <FontAwesomeIcon icon={faRocket} className="h-4 w-4 text-primary-500" />
            <h3 className="text-sm font-semibold text-gray-900">Quick Demo Access</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Click to instantly log in as a demo user. Password: Demo123!
          </p>
          <div className="grid grid-cols-2 gap-3">
            {DEMO_USERS.map((user) => (
              <button
                key={user.email}
                type="button"
                onClick={() => handleQuickLogin(user.email, user.password)}
                className={`flex flex-col items-center justify-center p-3 rounded-lg text-white transition-all transform hover:scale-105 ${user.color}`}
              >
                <FontAwesomeIcon icon={user.icon} className="h-5 w-5 mb-1" />
                <span className="text-sm font-medium">{user.label}</span>
                <span className="text-xs opacity-80">{user.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-50 px-2 text-gray-500">Or sign in with credentials</span>
          </div>
        </div>

        {/* Main Login Form */}
        <div className="bg-white px-4 py-8 shadow sm:rounded-lg sm:px-10">
          <Form method="post" className="space-y-6">
            <input type="hidden" name="redirectTo" value={redirectTo} />

            <div>
              <label htmlFor="email" className="label">
                Email address
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className={`input pl-10 ${actionData?.errors?.email ? "input-error" : ""}`}
                  placeholder="you@example.com"
                />
              </div>
              {actionData?.errors?.email && (
                <p className="mt-1 text-sm text-red-600">{actionData.errors.email[0]}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <FontAwesomeIcon icon={faLock} className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className={`input pl-10 ${actionData?.errors?.password ? "input-error" : ""}`}
                  placeholder="••••••••"
                />
              </div>
              {actionData?.errors?.password && (
                <p className="mt-1 text-sm text-red-600">{actionData.errors.password[0]}</p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember"
                  name="remember"
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="remember" className="ml-2 block text-sm text-gray-900">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link
                  to="/forgot-password"
                  className="font-medium text-primary-600 hover:text-primary-500"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            <div>
              <button type="submit" className="btn-primary w-full py-3">
                Sign in
              </button>
            </div>
          </Form>
        </div>

        {/* Demo Credentials Help */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Demo accounts use password: <code className="bg-gray-200 px-1 py-0.5 rounded">Demo123!</code>
          </p>
        </div>
      </div>
    </div>
  );
}

