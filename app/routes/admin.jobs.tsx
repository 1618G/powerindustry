/**
 * Job Queue Admin UI
 * 
 * GET /admin/jobs - View job queue status, dead letter, and worker health
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBriefcase,
  faExclamationTriangle,
  faRedo,
  faCheck,
  faSpinner,
  faClock,
  faHeartbeat,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { requireAdmin } from "~/utils/auth.server";
import { getJobStats, retryJob } from "~/services/jobs.server";
import {
  listDeadLetterJobs,
  resolveDeadLetter,
  getDeadLetterStats,
} from "~/services/dead-letter.server";
import { db } from "~/lib/prisma";

// ============================================
// Loader
// ============================================

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const url = new URL(request.url);
  const tab = url.searchParams.get("tab") || "overview";

  const [jobStats, deadLetterStats, deadLetterJobs, workerHeartbeats] = await Promise.all([
    getJobStats(),
    getDeadLetterStats(),
    listDeadLetterJobs({ resolved: false, limit: 20 }),
    db.workerHeartbeat.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 10,
    }),
  ]);

  return json({
    tab,
    jobStats,
    deadLetterStats,
    deadLetterJobs: deadLetterJobs.jobs,
    workerHeartbeats,
  });
}

// ============================================
// Action
// ============================================

export async function action({ request }: ActionFunctionArgs) {
  const admin = await requireAdmin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "retry-dead-letter": {
        const id = formData.get("id") as string;
        const deadLetter = await db.deadLetterJob.findUnique({ where: { id } });
        if (!deadLetter) {
          return json({ error: "Dead letter job not found" }, { status: 404 });
        }

        // Re-queue the job
        const { createJob } = await import("~/services/jobs.server");
        await createJob({
          type: deadLetter.jobName,
          payload: deadLetter.payload as Record<string, unknown>,
        });

        // Mark as resolved
        await resolveDeadLetter(id, admin.id, "Re-queued via admin UI");

        return json({ success: true, message: "Job re-queued" });
      }

      case "resolve-dead-letter": {
        const id = formData.get("id") as string;
        const notes = formData.get("notes") as string;
        await resolveDeadLetter(id, admin.id, notes || "Manually resolved");
        return json({ success: true, message: "Job resolved" });
      }

      case "retry-failed-job": {
        const jobId = formData.get("jobId") as string;
        await retryJob(jobId);
        return json({ success: true, message: "Job retried" });
      }

      default:
        return json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 400 }
    );
  }
}

// ============================================
// Component
// ============================================

export default function AdminJobs() {
  const { jobStats, deadLetterStats, deadLetterJobs, workerHeartbeats } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <FontAwesomeIcon icon={faBriefcase} className="text-2xl text-red-500" />
          <h1 className="text-2xl font-bold text-white">Job Queue</h1>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Pending"
            value={jobStats.pending}
            icon={faClock}
            color="yellow"
          />
          <StatCard
            label="Processing"
            value={jobStats.processing}
            icon={faSpinner}
            color="blue"
          />
          <StatCard
            label="Failed"
            value={jobStats.failed}
            icon={faExclamationTriangle}
            color="red"
          />
          <StatCard
            label="Dead Letter"
            value={deadLetterStats.unresolved}
            icon={faTrash}
            color="red"
          />
        </div>

        {/* Worker Health */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FontAwesomeIcon icon={faHeartbeat} className="text-green-500" />
            Worker Health
          </h2>
          {workerHeartbeats.length === 0 ? (
            <p className="text-gray-500">No workers registered</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {workerHeartbeats.map((worker) => {
                const isHealthy =
                  new Date(worker.lastSeenAt).getTime() > Date.now() - 2 * 60 * 1000;
                return (
                  <div
                    key={worker.id}
                    className={`p-4 rounded-lg border ${
                      isHealthy
                        ? "border-green-500/30 bg-green-500/10"
                        : "border-red-500/30 bg-red-500/10"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isHealthy ? "bg-green-500" : "bg-red-500"
                        }`}
                      />
                      <span className="text-white font-medium">
                        {worker.workerId}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">
                      Last seen:{" "}
                      {new Date(worker.lastSeenAt).toLocaleString()}
                    </p>
                    {worker.hostname && (
                      <p className="text-sm text-gray-500">{worker.hostname}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dead Letter Queue */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500" />
              Dead Letter Queue ({deadLetterStats.unresolved} unresolved)
            </h2>
          </div>

          {deadLetterJobs.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No dead letter jobs - all jobs are healthy!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left text-gray-400 text-sm font-medium px-6 py-3">
                      Job Name
                    </th>
                    <th className="text-left text-gray-400 text-sm font-medium px-6 py-3">
                      Error
                    </th>
                    <th className="text-center text-gray-400 text-sm font-medium px-6 py-3">
                      Attempts
                    </th>
                    <th className="text-left text-gray-400 text-sm font-medium px-6 py-3">
                      Created
                    </th>
                    <th className="text-right text-gray-400 text-sm font-medium px-6 py-3">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deadLetterJobs.map((job) => (
                    <DeadLetterRow key={job.id} job={job} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Queue Depth by Type */}
        {Object.keys(jobStats.byType).length > 0 && (
          <div className="mt-8 bg-gray-900 rounded-xl border border-gray-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              Queue Depth by Job Type
            </h2>
            <div className="space-y-2">
              {Object.entries(jobStats.byType).map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0"
                >
                  <code className="text-sm text-red-400">{type}</code>
                  <span className="text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof faClock;
  color: "yellow" | "blue" | "red" | "green";
}) {
  const colors = {
    yellow: "text-yellow-400 bg-yellow-500/10",
    blue: "text-blue-400 bg-blue-500/10",
    red: "text-red-400 bg-red-500/10",
    green: "text-green-400 bg-green-500/10",
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
          <FontAwesomeIcon icon={icon} />
        </div>
        <span className="text-gray-400">{label}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}

function DeadLetterRow({
  job,
}: {
  job: {
    id: string;
    jobName: string;
    error: string;
    attempts: number;
    createdAt: string;
  };
}) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  return (
    <tr className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50">
      <td className="px-6 py-4">
        <code className="text-sm text-red-400">{job.jobName}</code>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm text-gray-300 truncate max-w-xs" title={job.error}>
          {job.error}
        </p>
      </td>
      <td className="px-6 py-4 text-center">
        <span className="text-gray-400">{job.attempts}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-500">
          {new Date(job.createdAt).toLocaleString()}
        </span>
      </td>
      <td className="px-6 py-4 text-right space-x-2">
        <fetcher.Form method="post" className="inline">
          <input type="hidden" name="intent" value="retry-dead-letter" />
          <input type="hidden" name="id" value={job.id} />
          <button
            type="submit"
            disabled={isLoading}
            className="text-blue-400 hover:text-blue-300 px-2 py-1"
            title="Retry job"
          >
            {isLoading ? (
              <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
            ) : (
              <FontAwesomeIcon icon={faRedo} />
            )}
          </button>
        </fetcher.Form>
        <fetcher.Form method="post" className="inline">
          <input type="hidden" name="intent" value="resolve-dead-letter" />
          <input type="hidden" name="id" value={job.id} />
          <button
            type="submit"
            disabled={isLoading}
            className="text-green-400 hover:text-green-300 px-2 py-1"
            title="Mark resolved"
          >
            <FontAwesomeIcon icon={faCheck} />
          </button>
        </fetcher.Form>
      </td>
    </tr>
  );
}
