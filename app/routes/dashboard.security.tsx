/**
 * Dashboard Security - Password, MFA, and session management
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useFetcher } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faShield,
  faLock,
  faKey,
  faDesktop,
  faMobile,
  faSignOutAlt,
  faCheck,
  faExclamationTriangle,
  faQrcode,
} from "@fortawesome/free-solid-svg-icons";

import { requireUser } from "~/utils/auth.server";
import { changePassword } from "~/services/user.server";
import { getUserSessions, revokeSession, revokeAllSessions } from "~/services/auth.service";
import { passwordSchema } from "~/services/security.server";
import { generateTOTPSecret, verifyTOTP } from "~/services/mfa.server";
import { userRepository } from "~/repositories";

export const meta: MetaFunction = () => [{ title: "Security Settings" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const sessions = await getUserSessions(user.id);
  const currentSessionId = request.headers.get("cookie")?.match(/session=([^;]+)/)?.[1];

  return json({
    user: {
      id: user.id,
      email: user.email,
      mfaEnabled: user.mfaEnabled,
      passwordChangedAt: user.passwordChangedAt,
    },
    sessions,
    currentSessionId,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  switch (intent) {
    case "change-password": {
      const currentPassword = formData.get("currentPassword") as string;
      const newPassword = formData.get("newPassword") as string;
      const confirmPassword = formData.get("confirmPassword") as string;

      if (newPassword !== confirmPassword) {
        return json({ error: "New passwords do not match" }, { status: 400 });
      }

      const parsed = passwordSchema.safeParse(newPassword);
      if (!parsed.success) {
        return json({ error: parsed.error.errors[0]?.message }, { status: 400 });
      }

      try {
        await changePassword(user.id, currentPassword, newPassword);
        return json({ success: true, message: "Password updated successfully" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to change password";
        return json({ error: message }, { status: 400 });
      }
    }

    case "setup-mfa": {
      const { secret, qrCodeUrl, backupCodes } = await generateTOTPSecret(user.email);
      
      await userRepository.update(user.id, { mfaSecret: secret });

      return json({ 
        mfaSetup: true, 
        qrCodeUrl, 
        backupCodes,
        message: "Scan the QR code with your authenticator app" 
      });
    }

    case "verify-mfa": {
      const code = formData.get("code") as string;
      const dbUser = await userRepository.findById(user.id);

      if (!dbUser?.mfaSecret) {
        return json({ error: "MFA not set up" }, { status: 400 });
      }

      const isValid = verifyTOTP(dbUser.mfaSecret, code);
      if (!isValid) {
        return json({ error: "Invalid code. Please try again." }, { status: 400 });
      }

      await userRepository.setMfa(user.id, true, dbUser.mfaSecret);
      return json({ success: true, message: "Two-factor authentication enabled!" });
    }

    case "disable-mfa": {
      const code = formData.get("code") as string;
      const dbUser = await userRepository.findById(user.id);

      if (!dbUser?.mfaSecret) {
        return json({ error: "MFA not enabled" }, { status: 400 });
      }

      const isValid = verifyTOTP(dbUser.mfaSecret, code);
      if (!isValid) {
        return json({ error: "Invalid code" }, { status: 400 });
      }

      await userRepository.setMfa(user.id, false, null);
      return json({ success: true, message: "Two-factor authentication disabled" });
    }

    case "revoke-session": {
      const sessionId = formData.get("sessionId") as string;
      
      try {
        await revokeSession(user.id, sessionId);
        return json({ success: true, message: "Session revoked" });
      } catch (error) {
        return json({ error: "Failed to revoke session" }, { status: 400 });
      }
    }

    case "revoke-all-sessions": {
      await revokeAllSessions(user.id);
      return json({ success: true, message: "All sessions revoked. You will need to log in again." });
    }

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
}

export default function SecurityPage() {
  const { user, sessions, currentSessionId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const fetcher = useFetcher();

  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          <FontAwesomeIcon icon={faShield} className="mr-3 text-red-500" />
          Security Settings
        </h1>
        <p className="mt-1 text-gray-400">Manage your password, 2FA, and active sessions</p>
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
        {/* Change Password */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <FontAwesomeIcon icon={faLock} className="text-gray-400" />
            Change Password
          </h2>
          
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="change-password" />
            
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Current Password
              </label>
              <input
                type="password"
                name="currentPassword"
                required
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                New Password
              </label>
              <input
                type="password"
                name="newPassword"
                required
                minLength={8}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Min 8 characters, uppercase, lowercase, number, special character
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">
                Confirm New Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={8}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-red-500 px-6 py-2.5 font-semibold text-white hover:bg-red-600 disabled:opacity-50"
            >
              {isSubmitting ? "Updating..." : "Update Password"}
            </button>
          </Form>

          {user.passwordChangedAt && (
            <p className="mt-4 text-sm text-gray-500">
              Last changed: {new Date(user.passwordChangedAt).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Two-Factor Authentication */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <FontAwesomeIcon icon={faKey} className="text-gray-400" />
            Two-Factor Authentication
          </h2>

          {user.mfaEnabled ? (
            <div>
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-500/10 p-4 text-green-400">
                <FontAwesomeIcon icon={faCheck} />
                <span>Two-factor authentication is enabled</span>
              </div>

              <Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="disable-mfa" />
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Enter code to disable
                  </label>
                  <input
                    type="text"
                    name="code"
                    required
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    className="w-48 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-center text-lg tracking-widest text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg border border-red-500 bg-transparent px-6 py-2.5 text-red-400 hover:bg-red-500 hover:text-white"
                >
                  Disable 2FA
                </button>
              </Form>
            </div>
          ) : actionData?.mfaSetup ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-blue-500/10 p-4 text-blue-400">
                <FontAwesomeIcon icon={faQrcode} />
                <span>Scan this QR code with your authenticator app</span>
              </div>

              {actionData.qrCodeUrl && (
                <div className="flex justify-center rounded-lg bg-white p-4">
                  <img src={actionData.qrCodeUrl} alt="QR Code" className="h-48 w-48" />
                </div>
              )}

              {actionData.backupCodes && (
                <div className="rounded-lg bg-yellow-500/10 p-4">
                  <p className="mb-2 font-medium text-yellow-400">
                    <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
                    Save these backup codes
                  </p>
                  <div className="grid grid-cols-2 gap-2 font-mono text-sm text-gray-300">
                    {actionData.backupCodes.map((code: string, i: number) => (
                      <span key={i}>{code}</span>
                    ))}
                  </div>
                </div>
              )}

              <Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="verify-mfa" />
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">
                    Enter the 6-digit code from your app
                  </label>
                  <input
                    type="text"
                    name="code"
                    required
                    pattern="[0-9]{6}"
                    placeholder="000000"
                    className="w-48 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-center text-lg tracking-widest text-white focus:border-red-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-green-500 px-6 py-2.5 font-semibold text-white hover:bg-green-600"
                >
                  Verify & Enable
                </button>
              </Form>
            </div>
          ) : (
            <div>
              <p className="mb-4 text-gray-400">
                Add an extra layer of security by requiring a code from your phone.
              </p>
              <Form method="post">
                <input type="hidden" name="intent" value="setup-mfa" />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-lg bg-red-500 px-6 py-2.5 font-semibold text-white hover:bg-red-600"
                >
                  Set Up 2FA
                </button>
              </Form>
            </div>
          )}
        </div>

        {/* Active Sessions */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <FontAwesomeIcon icon={faDesktop} className="text-gray-400" />
              Active Sessions
            </h2>
            <Form method="post">
              <input type="hidden" name="intent" value="revoke-all-sessions" />
              <button
                type="submit"
                className="text-sm text-red-400 hover:text-red-300"
              >
                Revoke All
              </button>
            </Form>
          </div>

          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between rounded-lg bg-gray-800 p-4"
              >
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon
                    icon={session.deviceType === "mobile" ? faMobile : faDesktop}
                    className="text-gray-500"
                  />
                  <div>
                    <p className="text-sm text-white">
                      {session.userAgent?.substring(0, 50) || "Unknown device"}
                      {session.id === currentSessionId && (
                        <span className="ml-2 text-green-400">(current)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {session.ipAddress || "Unknown IP"} • 
                      {new Date(session.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                
                {session.id !== currentSessionId && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="revoke-session" />
                    <input type="hidden" name="sessionId" value={session.id} />
                    <button
                      type="submit"
                      className="text-gray-400 hover:text-red-400"
                    >
                      <FontAwesomeIcon icon={faSignOutAlt} />
                    </button>
                  </fetcher.Form>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
