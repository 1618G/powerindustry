/**
 * Dashboard Team - Team member management and invitations
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation, useFetcher } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faUserPlus,
  faEnvelope,
  faCrown,
  faUser,
  faTrash,
  faClock,
  faCheck,
  faRedo,
} from "@fortawesome/free-solid-svg-icons";

import { requireUser } from "~/utils/auth.server";
import { 
  getOrganizationWithMembers, 
  getPendingInvitations,
  sendInvitation,
  resendInvitation,
  revokeInvitation,
  removeMember
} from "~/services/team.service";
import { emailSchema } from "~/services/security.server";

export const meta: MetaFunction = () => [{ title: "Team Management" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const organization = await getOrganizationWithMembers(user.id);

  if (!organization) {
    return json({
      user,
      organization: null,
      members: [],
      invitations: [],
      isOwner: false,
    });
  }

  const invitations = await getPendingInvitations(organization.id);

  return json({
    user,
    organization: {
      id: organization.id,
      name: organization.name,
    },
    members: organization.members,
    invitations,
    isOwner: true,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const organization = await getOrganizationWithMembers(user.id);

  if (!organization) {
    return json({ error: "You must create an organization first" }, { status: 400 });
  }

  switch (intent) {
    case "invite": {
      const email = formData.get("email") as string;
      const role = (formData.get("role") as string) || "USER";

      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) {
        return json({ error: "Invalid email address" }, { status: 400 });
      }

      try {
        await sendInvitation({
          organizationId: organization.id,
          email: parsed.data,
          role,
          invitedBy: user.id,
        });
        return json({ success: true, message: "Invitation sent!" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to send invitation";
        return json({ error: message }, { status: 400 });
      }
    }

    case "resend": {
      const invitationId = formData.get("invitationId") as string;

      try {
        await resendInvitation(invitationId);
        return json({ success: true, message: "Invitation resent!" });
      } catch (error) {
        return json({ error: "Failed to resend invitation" }, { status: 500 });
      }
    }

    case "revoke": {
      const invitationId = formData.get("invitationId") as string;

      try {
        await revokeInvitation(invitationId, user.id);
        return json({ success: true, message: "Invitation revoked" });
      } catch (error) {
        return json({ error: "Failed to revoke invitation" }, { status: 500 });
      }
    }

    case "remove-member": {
      const memberId = formData.get("memberId") as string;

      try {
        await removeMember(organization.id, memberId, user.id);
        return json({ success: true, message: "Member removed" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to remove member";
        return json({ error: message }, { status: 400 });
      }
    }

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
}

export default function TeamPage() {
  const { user, organization, members, invitations, isOwner } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const fetcher = useFetcher();

  const isSubmitting = navigation.state === "submitting";

  if (!organization) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
          <FontAwesomeIcon icon={faUsers} className="mb-4 text-4xl text-gray-500" />
          <h2 className="mb-2 text-xl font-semibold text-white">No Organization</h2>
          <p className="mb-6 text-gray-400">
            Create an organization to start inviting team members.
          </p>
          <Form method="post" action="/api/create-org">
            <button
              type="submit"
              className="rounded-lg bg-red-500 px-6 py-2 font-semibold text-white hover:bg-red-600"
            >
              Create Organization
            </button>
          </Form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          <FontAwesomeIcon icon={faUsers} className="mr-3 text-red-500" />
          Team Management
        </h1>
        <p className="mt-1 text-gray-400">
          Manage your team members and invitations for {organization.name}
        </p>
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Invite Form */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
              <FontAwesomeIcon icon={faUserPlus} className="text-gray-400" />
              Invite Member
            </h2>

            <Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="invite" />

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="colleague@company.com"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">
                  Role
                </label>
                <select
                  name="role"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-white focus:border-red-500 focus:outline-none"
                >
                  <option value="USER">Member</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-lg bg-red-500 py-2.5 font-semibold text-white hover:bg-red-600 disabled:opacity-50"
              >
                {isSubmitting ? "Sending..." : "Send Invitation"}
              </button>
            </Form>
          </div>
        </div>

        {/* Members & Invitations */}
        <div className="space-y-6 lg:col-span-2">
          {/* Team Members */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="mb-4 text-lg font-semibold text-white">
              Team Members ({members.length})
            </h2>

            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between rounded-lg bg-gray-800 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700 text-gray-400">
                      {(member.name || member.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {member.name || member.email}
                        {member.id === user.id && (
                          <span className="ml-2 text-sm text-gray-400">(you)</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-400">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      member.role === "ADMIN" || member.role === "SUPER_ADMIN"
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-gray-700 text-gray-400"
                    }`}>
                      <FontAwesomeIcon icon={member.role === "ADMIN" ? faCrown : faUser} />
                      {member.role}
                    </span>

                    {member.id !== user.id && isOwner && (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="remove-member" />
                        <input type="hidden" name="memberId" value={member.id} />
                        <button
                          type="submit"
                          className="text-gray-400 hover:text-red-400"
                          onClick={(e) => {
                            if (!confirm("Remove this team member?")) {
                              e.preventDefault();
                            }
                          }}
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </fetcher.Form>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Invitations */}
          {invitations.length > 0 && (
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="mb-4 text-lg font-semibold text-white">
                Pending Invitations ({invitations.length})
              </h2>

              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex items-center justify-between rounded-lg bg-gray-800 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700">
                        <FontAwesomeIcon icon={faEnvelope} className="text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{invitation.email}</p>
                        <p className="flex items-center gap-2 text-sm text-gray-400">
                          <FontAwesomeIcon icon={faClock} className="text-xs" />
                          Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                        {invitation.role}
                      </span>
                      
                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="resend" />
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <button
                          type="submit"
                          className="p-2 text-gray-400 hover:text-white"
                          title="Resend invitation"
                        >
                          <FontAwesomeIcon icon={faRedo} />
                        </button>
                      </fetcher.Form>

                      <fetcher.Form method="post" className="inline">
                        <input type="hidden" name="intent" value="revoke" />
                        <input type="hidden" name="invitationId" value={invitation.id} />
                        <button
                          type="submit"
                          className="p-2 text-gray-400 hover:text-red-400"
                          title="Revoke invitation"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </fetcher.Form>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
