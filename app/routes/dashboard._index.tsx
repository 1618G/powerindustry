import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUser,
  faCog,
  faRightFromBracket,
  faHome,
  faChartLine,
} from "@fortawesome/free-solid-svg-icons";

import { requireUser } from "~/utils/session.server";

export const meta: MetaFunction = () => [
  { title: "Dashboard - ZZA Platform" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  return json({ user });
}

export default function DashboardIndex() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-xl font-bold text-primary-600">
            ZZA Platform
          </Link>
          <div className="flex items-center gap-4">
            {user.role === "ADMIN" || user.role === "SUPER_ADMIN" ? (
              <Link
                to="/admin"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Admin
              </Link>
            ) : null}
            <span className="text-sm text-gray-600">{user.email}</span>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
                title="Sign out"
              >
                <FontAwesomeIcon icon={faRightFromBracket} className="h-5 w-5" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Welcome back, {user.name || user.email}!
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-950/5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary-100">
                <FontAwesomeIcon icon={faChartLine} className="h-6 w-6 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Activity</p>
                <p className="text-2xl font-bold text-gray-900">--</p>
              </div>
            </div>
          </div>

          {/* Add more stat cards as needed */}
        </div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Quick Actions
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              to="/dashboard/profile"
              className="flex items-center gap-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-950/5 transition-shadow hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <FontAwesomeIcon icon={faUser} className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Edit Profile</h3>
                <p className="text-sm text-gray-600">Update your information</p>
              </div>
            </Link>

            <Link
              to="/dashboard/settings"
              className="flex items-center gap-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-950/5 transition-shadow hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
                <FontAwesomeIcon icon={faCog} className="h-6 w-6 text-gray-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Settings</h3>
                <p className="text-sm text-gray-600">Manage your preferences</p>
              </div>
            </Link>

            <Link
              to="/"
              className="flex items-center gap-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-950/5 transition-shadow hover:shadow-md"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                <FontAwesomeIcon icon={faHome} className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">View Site</h3>
                <p className="text-sm text-gray-600">Go to the public site</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Recent Activity
          </h2>
          <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-950/5">
            <p className="text-center text-gray-500">
              No recent activity to show.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

