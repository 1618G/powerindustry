/**
 * Dashboard Settings - Account settings and preferences
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData, useNavigation, useFetcher } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCog,
  faEnvelope,
  faShield,
  faDownload,
  faTrash,
  faCheck,
  faSpinner,
} from "@fortawesome/free-solid-svg-icons";

import { requireUser } from "~/utils/auth.server";
import { 
  getUserWithProfile, 
  countActiveSessions, 
  getDataExportRequests,
  requestDataExport,
  deactivateAccount 
} from "~/services/settings.service";
import { sendVerificationEmail } from "~/services/auth.service";

export const meta: MetaFunction = () => [{ title: "Account Settings" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  const [activeSessions, dataExportRequests] = await Promise.all([
    countActiveSessions(user.id),
    getDataExportRequests(user.id),
  ]);

  return json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
    },
    activeSessions,
    dataExportRequests,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "resend-verification": {
      if (user.emailVerified) {
        return json({ error: "Email already verified" }, { status: 400 });
      }

      try {
        await sendVerificationEmail(user.id);
        return json({ success: true, message: "Verification email sent!" });
      } catch (error) {
        return json({ error: "Failed to send verification email" }, { status: 500 });
      }
    }

    case "request-data-export": {
      try {
        await requestDataExport(user.id);
        return json({ success: true, message: "Data export requested. You'll receive an email when it's ready." });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to request export";
        return json({ error: message }, { status: 400 });
      }
    }

    case "delete-account": {
      try {
        await deactivateAccount(user.id);
        return json({ success: true, redirect: "/login" });
      } catch (error) {
        return json({ error: "Failed to delete account" }, { status: 500 });
      }
    }

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
}

export default function SettingsPage() {
  const { user, activeSessions, dataExportRequests } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const fetcher = useFetcher();

  const isSubmitting = navigation.state === "submitting" || fetcher.state === "submitting";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          <FontAwesomeIcon icon={faCog} className="mr-3 text-red-500" />
          Account Settings
        </h1>
        <p className="mt-1 text-gray-400">Manage your account preferences and security</p>
      </div>

      {actionData?.success && (
        <div className="mb-6 rounded-lg bg-green-500/10 p-4 text-green-400">
          <FontAwesomeIcon icon={faCheck} className="mr-2" />
          {actionData.message}
        </div>
      )}

      {actionData?.error && (
        <div className="mb-6 rounded-lg bg-red-500/10 p-4 text-red-400">
          {actionData.error}
        </div>
      )}

      <div className="space-y-6">
        {/* Email Verification */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <FontAwesomeIcon icon={faEnvelope} className="text-gray-400" />
            Email Verification
          </h2>
          
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300">{user.email}</p>
              <p className="text-sm text-gray-500">
                {user.emailVerified ? (
                  <span className="text-green-400">
                    <FontAwesomeIcon icon={faCheck} className="mr-1" />
                    Verified
                  </span>
                ) : (
                  <span className="text-yellow-400">Not verified</span>
                )}
              </p>
            </div>
            
            {!user.emailVerified && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="resend-verification" />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-white hover:bg-gray-700"
                >
                  {fetcher.state === "submitting" ? (
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
                  ) : (
                    "Resend Verification"
                  )}
                </button>
              </fetcher.Form>
            )}
          </div>
        </div>

        {/* Security Section */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <FontAwesomeIcon icon={faShield} className="text-gray-400" />
            Security
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-gray-800 p-4">
              <div>
                <p className="font-medium text-white">Password</p>
                <p className="text-sm text-gray-400">Change your password</p>
              </div>
              <Link
                to="/dashboard/security"
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
              >
                Change
              </Link>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-gray-800 p-4">
              <div>
                <p className="font-medium text-white">Two-Factor Authentication</p>
                <p className="text-sm text-gray-400">
                  {user.mfaEnabled ? (
                    <span className="text-green-400">Enabled</span>
                  ) : (
                    "Add an extra layer of security"
                  )}
                </p>
              </div>
              <Link
                to="/dashboard/security"
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
              >
                {user.mfaEnabled ? "Manage" : "Enable"}
              </Link>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-gray-800 p-4">
              <div>
                <p className="font-medium text-white">Active Sessions</p>
                <p className="text-sm text-gray-400">{activeSessions} active session(s)</p>
              </div>
              <Link
                to="/dashboard/security"
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
              >
                View All
              </Link>
            </div>
          </div>
        </div>

        {/* Data & Privacy */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <FontAwesomeIcon icon={faDownload} className="text-gray-400" />
            Data & Privacy
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-gray-800 p-4">
              <div>
                <p className="font-medium text-white">Export Your Data</p>
                <p className="text-sm text-gray-400">Download a copy of your data</p>
              </div>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="request-data-export" />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white hover:bg-gray-600"
                >
                  Request Export
                </button>
              </fetcher.Form>
            </div>

            {dataExportRequests.length > 0 && (
              <div className="rounded-lg bg-gray-800/50 p-4">
                <p className="mb-2 text-sm font-medium text-gray-300">Recent Export Requests</p>
                <div className="space-y-2">
                  {dataExportRequests.map((req) => (
                    <div key={req.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">
                        {new Date(req.createdAt).toLocaleDateString()}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        req.status === "COMPLETED" ? "bg-green-500/20 text-green-400" :
                        req.status === "FAILED" ? "bg-red-500/20 text-red-400" :
                        "bg-yellow-500/20 text-yellow-400"
                      }`}>
                        {req.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-red-500/30 bg-gray-900 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-red-400">
            <FontAwesomeIcon icon={faTrash} />
            Danger Zone
          </h2>
          
          <div className="rounded-lg bg-red-500/10 p-4">
            <p className="mb-4 text-sm text-gray-300">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <Form method="post" onSubmit={(e) => {
              if (!confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
                e.preventDefault();
              }
            }}>
              <input type="hidden" name="intent" value="delete-account" />
              <button
                type="submit"
                className="rounded-lg border border-red-500 bg-transparent px-4 py-2 text-sm text-red-400 hover:bg-red-500 hover:text-white"
              >
                Delete Account
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
