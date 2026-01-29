/**
 * Admin User Management - List, search, and manage users
 */

import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSearchParams, Form, Link, useNavigation } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faSearch,
  faPlus,
  faEdit,
  faTrash,
  faToggleOn,
  faToggleOff,
  faKey,
  faEye,
  faCheck,
  faTimes,
  faShield,
} from "@fortawesome/free-solid-svg-icons";

import { requireAdmin } from "~/utils/auth.server";
import { listUsers, toggleUserStatus, revokeAllSessions, getUserStatistics } from "~/services/admin-users.server";
import type { Role } from "@prisma/client";

export const meta: MetaFunction = () => [{ title: "User Management - Admin" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const admin = await requireAdmin(request);
  const url = new URL(request.url);

  const filters = {
    search: url.searchParams.get("search") || undefined,
    role: (url.searchParams.get("role") as Role) || undefined,
    isActive: url.searchParams.get("status") === "active" ? true : url.searchParams.get("status") === "inactive" ? false : undefined,
    sortBy: (url.searchParams.get("sortBy") as "createdAt" | "email" | "name") || "createdAt",
    sortOrder: (url.searchParams.get("sortOrder") as "asc" | "desc") || "desc",
    limit: parseInt(url.searchParams.get("limit") || "25"),
    offset: parseInt(url.searchParams.get("offset") || "0"),
  };

  const [usersData, stats] = await Promise.all([
    listUsers(filters),
    getUserStatistics(),
  ]);

  return json({ ...usersData, stats, adminId: admin.id });
}

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const userId = formData.get("userId") as string;

  switch (intent) {
    case "toggle-status": {
      await toggleUserStatus(userId, admin.id, request);
      return json({ success: true });
    }
    case "revoke-sessions": {
      await revokeAllSessions(userId, admin.id, request);
      return json({ success: true });
    }
    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
}

export default function AdminUsersPage() {
  const { users, total, limit, offset, stats } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <FontAwesomeIcon icon={faUsers} className="mr-3 text-primary-600" />
            User Management
          </h1>
          <p className="mt-1 text-gray-600">Manage platform users and permissions</p>
        </div>
        <Link to="/admin/users/new" className="btn-primary">
          <FontAwesomeIcon icon={faPlus} className="mr-2" />
          Add User
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Users" value={stats.totalUsers} />
        <StatCard label="Active Users" value={stats.activeUsers} color="green" />
        <StatCard label="Verified" value={stats.verifiedUsers} color="blue" />
        <StatCard label="Logins (24h)" value={stats.recentLogins} color="purple" />
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-950/5">
        <Form className="flex flex-wrap items-end gap-4">
          <div className="flex-1">
            <label className="label">Search</label>
            <div className="relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                name="search"
                defaultValue={searchParams.get("search") || ""}
                placeholder="Search by email or name..."
                className="input pl-10"
              />
            </div>
          </div>
          <div>
            <label className="label">Role</label>
            <select name="role" defaultValue={searchParams.get("role") || ""} className="input">
              <option value="">All Roles</option>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
              <option value="SUPER_ADMIN">Super Admin</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select name="status" defaultValue={searchParams.get("status") || ""} className="input">
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">
            <FontAwesomeIcon icon={faSearch} className="mr-2" />
            Filter
          </button>
        </Form>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-950/5">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Sessions</th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">Last Login</th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0">
                      {user.profile?.avatar ? (
                        <img className="h-10 w-10 rounded-full" src={user.profile.avatar} alt="" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                          {(user.name || user.email)[0].toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="font-medium text-gray-900">{user.name || "—"}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <RoleBadge role={user.role} />
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <StatusBadge isActive={user.isActive} emailVerified={user.emailVerified} />
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {user._count.sessions} active
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : "Never"}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                  <div className="flex items-center justify-end gap-2">
                    <Link to={`/admin/users/${user.id}`} className="text-gray-400 hover:text-gray-600" title="View">
                      <FontAwesomeIcon icon={faEye} />
                    </Link>
                    <Link to={`/admin/users/${user.id}/edit`} className="text-gray-400 hover:text-blue-600" title="Edit">
                      <FontAwesomeIcon icon={faEdit} />
                    </Link>
                    <Form method="post" className="inline">
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        name="intent"
                        value="toggle-status"
                        className={user.isActive ? "text-gray-400 hover:text-red-600" : "text-gray-400 hover:text-green-600"}
                        title={user.isActive ? "Deactivate" : "Activate"}
                      >
                        <FontAwesomeIcon icon={user.isActive ? faToggleOn : faToggleOff} />
                      </button>
                    </Form>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-white px-6 py-3">
            <div className="text-sm text-gray-500">
              Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} users
            </div>
            <div className="flex gap-2">
              {currentPage > 1 && (
                <button
                  onClick={() => setSearchParams((prev) => { prev.set("offset", String((currentPage - 2) * limit)); return prev; })}
                  className="btn-secondary text-sm"
                >
                  Previous
                </button>
              )}
              {currentPage < totalPages && (
                <button
                  onClick={() => setSearchParams((prev) => { prev.set("offset", String(currentPage * limit)); return prev; })}
                  className="btn-secondary text-sm"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = "gray" }: { label: string; value: number; color?: string }) {
  const colors = {
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-100 text-green-600",
    blue: "bg-blue-100 text-blue-600",
    purple: "bg-purple-100 text-purple-600",
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-950/5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${colors[color as keyof typeof colors]?.split(" ")[1] || "text-gray-900"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles = {
    USER: "bg-gray-100 text-gray-700",
    ADMIN: "bg-blue-100 text-blue-700",
    SUPER_ADMIN: "bg-purple-100 text-purple-700",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[role as keyof typeof styles] || styles.USER}`}>
      {role === "SUPER_ADMIN" && <FontAwesomeIcon icon={faShield} className="mr-1" />}
      {role.replace("_", " ")}
    </span>
  );
}

function StatusBadge({ isActive, emailVerified }: { isActive: boolean; emailVerified: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
        <FontAwesomeIcon icon={isActive ? faCheck : faTimes} className="mr-1" />
        {isActive ? "Active" : "Inactive"}
      </span>
      {emailVerified && (
        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
          Verified
        </span>
      )}
    </div>
  );
}

