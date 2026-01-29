/**
 * Admin System Health Dashboard
 */

import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faHeartPulse,
  faDatabase,
  faEnvelope,
  faHardDrive,
  faShield,
  faGaugeHigh,
  faCheck,
  faExclamationTriangle,
  faTimes,
  faMemory,
  faMicrochip,
  faClock,
  faRefresh,
} from "@fortawesome/free-solid-svg-icons";

import { requireAdmin } from "~/utils/auth.server";
import { getSystemHealth, getAuditLogs } from "~/services/system-health.server";

export const meta: MetaFunction = () => [{ title: "System Health - Admin" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdmin(request);

  const [health, recentAuditLogs] = await Promise.all([
    getSystemHealth(),
    getAuditLogs({ limit: 10 }),
  ]);

  return json({ health, recentAuditLogs });
}

export default function AdminHealthPage() {
  const { health, recentAuditLogs } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        revalidator.revalidate();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [revalidator]);

  const statusColors = {
    healthy: { bg: "bg-green-100", text: "text-green-700", icon: faCheck },
    degraded: { bg: "bg-yellow-100", text: "text-yellow-700", icon: faExclamationTriangle },
    down: { bg: "bg-red-100", text: "text-red-700", icon: faTimes },
  };

  const overallStatus = statusColors[health.overall as keyof typeof statusColors];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            <FontAwesomeIcon icon={faHeartPulse} className="mr-3 text-primary-600" />
            System Health
          </h1>
          <p className="mt-1 text-gray-600">Monitor system status and performance</p>
        </div>
        <div className="flex items-center gap-4">
          <div className={`rounded-full px-4 py-2 ${overallStatus.bg} ${overallStatus.text} font-medium`}>
            <FontAwesomeIcon icon={overallStatus.icon} className="mr-2" />
            System {health.overall.charAt(0).toUpperCase() + health.overall.slice(1)}
          </div>
          <button onClick={() => revalidator.revalidate()} className="btn-secondary" disabled={revalidator.state === "loading"}>
            <FontAwesomeIcon icon={faRefresh} className={`mr-2 ${revalidator.state === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Service Status Grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {health.services.map((service) => (
          <ServiceCard key={service.service} service={service} />
        ))}
      </div>

      {/* System Metrics */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Memory */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
            <FontAwesomeIcon icon={faMemory} className="mr-2 text-primary-600" />
            Memory Usage
          </h3>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-500">Used</span>
            <span className="font-medium">{formatBytes(health.metrics.memory.used)} / {formatBytes(health.metrics.memory.total)}</span>
          </div>
          <div className="h-4 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full transition-all ${health.metrics.memory.usagePercent > 90 ? "bg-red-500" : health.metrics.memory.usagePercent > 70 ? "bg-yellow-500" : "bg-green-500"}`}
              style={{ width: `${health.metrics.memory.usagePercent}%` }}
            />
          </div>
          <div className="mt-2 text-right text-sm text-gray-500">{health.metrics.memory.usagePercent}% used</div>
        </div>

        {/* CPU */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
            <FontAwesomeIcon icon={faMicrochip} className="mr-2 text-primary-600" />
            CPU Information
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Cores</span>
              <span className="font-medium">{health.metrics.cpu.cores}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Load Average (1m)</span>
              <span className="font-medium">{health.metrics.cpu.loadAverage[0].toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Load Average (5m)</span>
              <span className="font-medium">{health.metrics.cpu.loadAverage[1].toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Model</span>
              <span className="truncate font-medium text-sm">{health.metrics.cpu.model.slice(0, 30)}...</span>
            </div>
          </div>
        </div>

        {/* Uptime & Platform */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 flex items-center text-lg font-semibold text-gray-900">
            <FontAwesomeIcon icon={faClock} className="mr-2 text-primary-600" />
            Runtime Information
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Uptime</span>
              <span className="font-medium">{formatUptime(health.metrics.uptime)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Platform</span>
              <span className="font-medium">{health.metrics.platform}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Node.js</span>
              <span className="font-medium">{health.metrics.nodeVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Last Check</span>
              <span className="font-medium">{new Date(health.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-950/5">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Recent Audit Logs</h3>
          <div className="space-y-3">
            {recentAuditLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-start justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{log.action}</span>
                  {log.user && (
                    <span className="ml-2 text-gray-500">by {log.user.email}</span>
                  )}
                </div>
                <span className="text-gray-400">{new Date(log.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
            {recentAuditLogs.length === 0 && (
              <p className="text-gray-500">No recent activity</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: { service: string; status: string; latency?: number; details?: Record<string, unknown> } }) {
  const icons = {
    database: faDatabase,
    email: faEnvelope,
    storage: faHardDrive,
    authentication: faShield,
    rateLimit: faGaugeHigh,
  };

  const statusStyles = {
    healthy: { bg: "bg-green-50", border: "border-green-200", icon: "text-green-500" },
    degraded: { bg: "bg-yellow-50", border: "border-yellow-200", icon: "text-yellow-500" },
    down: { bg: "bg-red-50", border: "border-red-200", icon: "text-red-500" },
  };

  const style = statusStyles[service.status as keyof typeof statusStyles] || statusStyles.healthy;
  const icon = icons[service.service as keyof typeof icons] || faHeartPulse;

  return (
    <div className={`rounded-lg border p-4 ${style.bg} ${style.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={icon} className={`text-xl ${style.icon}`} />
          <div>
            <h4 className="font-medium capitalize text-gray-900">{service.service}</h4>
            {service.latency !== undefined && (
              <p className="text-sm text-gray-500">{service.latency}ms latency</p>
            )}
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${style.icon.replace("text-", "bg-").replace("500", "100")} ${style.icon}`}>
          {service.status}
        </span>
      </div>
      {service.details && Object.keys(service.details).length > 0 && (
        <div className="mt-3 border-t border-gray-200 pt-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(service.details).slice(0, 4).map(([key, value]) => (
              <div key={key}>
                <span className="text-gray-500">{key}:</span>
                <span className="ml-1 font-medium">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let value = bytes;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

