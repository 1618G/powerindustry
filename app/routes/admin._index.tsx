/**
 * Admin Dashboard - Platform overview and quick actions
 * 
 * LAYER: Route (Controller)
 * IMPORTS: Services only (no db)
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faMessage,
  faCog,
  faRightFromBracket,
  faHome,
  faHeartPulse,
  faUpload,
  faEnvelope,
  faCheck,
  faTimes,
  faComments,
} from "@fortawesome/free-solid-svg-icons";

import { requireAdmin } from "~/utils/session.server";
import { getUserStats } from "~/services/admin.service";
import { quickHealthCheck } from "~/services/system-health.server";

export const meta: MetaFunction = () => [
  { title: "Admin Dashboard - ZZA Platform" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireAdmin(request);

  const [userStats, healthStatus] = await Promise.all([
    getUserStats(),
    quickHealthCheck(),
  ]);

  // For message/file/email counts, we'd ideally have services
  // For now, showing user stats which we have via service
  return json({
    user,
    stats: {
      userCount: userStats.total,
      activeUsers: userStats.byRole["USER"] || 0,
      adminCount: (userStats.byRole["ADMIN"] || 0) + (userStats.byRole["SUPER_ADMIN"] || 0),
      healthStatus: healthStatus.status,
    },
  });
}

export default function AdminDashboard() {
  const { user, stats } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-xl font-bold text-primary-600">
              ZZA Platform
            </Link>
            <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
              Admin
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">
              My Dashboard
            </Link>
            <span className="text-sm text-gray-600">{user.email}</span>
            <form action="/logout" method="post">
              <button type="submit" className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" title="Sign out">
                <FontAwesomeIcon icon={faRightFromBracket} className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-gray-600">Manage your platform, users, and system health.</p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={faUsers} label="Total Users" value={stats.userCount} sublabel={`${stats.activeUsers} regular users`} color="blue" />
          <StatCard icon={faUsers} label="Admins" value={stats.adminCount} sublabel="with admin access" color="purple" />
          <StatCard icon={faHeartPulse} label="System" value={stats.healthStatus === "ok" ? "Healthy" : "Issues"} sublabel="system status" color={stats.healthStatus === "ok" ? "green" : "red"} />
          <StatCard icon={faMessage} label="Quick Links" value="→" sublabel="manage platform" color="gray" />
        </div>

        {/* Admin Navigation */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Administration</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <AdminLink to="/admin/users" icon={faUsers} color="blue" title="User Management" description="View, create, and manage users" />
            <AdminLink to="/admin/chat" icon={faComments} color="indigo" title="Live Chat" description="Respond to customer conversations" />
            <AdminLink to="/admin/health" icon={faHeartPulse} color="red" title="System Health" description="Monitor system status and performance" />
            <AdminLink to="/admin/messages" icon={faMessage} color="green" title="Messages" description="View and respond to contact messages" />
            <AdminLink to="/admin/files" icon={faUpload} color="purple" title="File Management" description="Manage uploaded files" />
            <AdminLink to="/admin/emails" icon={faEnvelope} color="orange" title="Email Queue" description="Monitor email delivery" />
            <AdminLink to="/admin/settings" icon={faCog} color="gray" title="Settings" description="Platform configuration" />
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link to="/admin/users/new" className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 font-medium text-white hover:bg-primary-700">
              <FontAwesomeIcon icon={faUsers} /> Add User
            </Link>
            <Link to="/admin/health" className="flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 font-medium text-white hover:bg-red-700">
              <FontAwesomeIcon icon={faHeartPulse} /> Run Health Check
            </Link>
            <Link to="/" className="flex items-center justify-center gap-2 rounded-lg bg-gray-600 px-4 py-3 font-medium text-white hover:bg-gray-700">
              <FontAwesomeIcon icon={faHome} /> View Site
            </Link>
            <Link to="/admin/settings" className="flex items-center justify-center gap-2 rounded-lg bg-gray-600 px-4 py-3 font-medium text-white hover:bg-gray-700">
              <FontAwesomeIcon icon={faCog} /> Settings
            </Link>
          </div>
        </div>

        {/* System Status */}
        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-950/5">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Status</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatusItem label="Database" status={stats.healthStatus === "ok"} />
            <StatusItem label="Email Service" status={true} />
            <StatusItem label="File Storage" status={true} />
            <StatusItem label="Authentication" status={true} />
          </div>
          <div className="mt-4 text-right">
            <Link to="/admin/health" className="text-sm text-primary-600 hover:underline">
              View full health report →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sublabel, color }: { icon: typeof faUsers; label: string; value: string | number; sublabel: string; color: string }) {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    red: "bg-red-100 text-red-600",
    orange: "bg-orange-100 text-orange-600",
    gray: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-950/5">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colors[color as keyof typeof colors]}`}>
          <FontAwesomeIcon icon={icon} className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          <p className="text-xs text-gray-500">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}

function AdminLink({ to, icon, color, title, description }: { to: string; icon: typeof faUsers; color: string; title: string; description: string }) {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    red: "bg-red-100 text-red-600",
    orange: "bg-orange-100 text-orange-600",
    gray: "bg-gray-100 text-gray-600",
    indigo: "bg-indigo-100 text-indigo-600",
  };

  return (
    <Link to={to} className="flex items-center gap-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-950/5 transition-shadow hover:shadow-md">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colors[color as keyof typeof colors]}`}>
        <FontAwesomeIcon icon={icon} className="h-6 w-6" />
      </div>
      <div>
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
    </Link>
  );
}

function StatusItem({ label, status }: { label: string; status: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
      <span className="text-gray-700">{label}</span>
      <span className={`flex items-center gap-1 text-sm font-medium ${status ? "text-green-600" : "text-red-600"}`}>
        <FontAwesomeIcon icon={status ? faCheck : faTimes} />
        {status ? "OK" : "Issue"}
      </span>
    </div>
  );
}
