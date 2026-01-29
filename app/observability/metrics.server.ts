/**
 * Prometheus-compatible Metrics Service
 * 
 * Provides application metrics exposed at /api/metrics (protected by token).
 * Works without OTEL - uses simple counters/gauges stored in memory.
 */

import { config } from "~/lib/config.server";
import { getJobStats } from "~/services/jobs.server";

// ============================================
// Types
// ============================================

interface Counter {
  name: string;
  help: string;
  labels: string[];
  values: Map<string, number>;
}

interface Gauge {
  name: string;
  help: string;
  labels: string[];
  values: Map<string, number>;
}

interface Histogram {
  name: string;
  help: string;
  labels: string[];
  buckets: number[];
  values: Map<string, { sum: number; count: number; buckets: number[] }>;
}

// ============================================
// Registry
// ============================================

const counters = new Map<string, Counter>();
const gauges = new Map<string, Gauge>();
const histograms = new Map<string, Histogram>();

// ============================================
// Counter Operations
// ============================================

export function incCounter(
  name: string,
  labels: Record<string, string> = {},
  value: number = 1
): void {
  let counter = counters.get(name);
  if (!counter) {
    counter = {
      name,
      help: `Counter ${name}`,
      labels: Object.keys(labels),
      values: new Map(),
    };
    counters.set(name, counter);
  }

  const labelKey = JSON.stringify(labels);
  const current = counter.values.get(labelKey) || 0;
  counter.values.set(labelKey, current + value);
}

// ============================================
// Gauge Operations
// ============================================

export function setGauge(
  name: string,
  value: number,
  labels: Record<string, string> = {}
): void {
  let gauge = gauges.get(name);
  if (!gauge) {
    gauge = {
      name,
      help: `Gauge ${name}`,
      labels: Object.keys(labels),
      values: new Map(),
    };
    gauges.set(name, gauge);
  }

  const labelKey = JSON.stringify(labels);
  gauge.values.set(labelKey, value);
}

export function incGauge(
  name: string,
  labels: Record<string, string> = {},
  value: number = 1
): void {
  let gauge = gauges.get(name);
  if (!gauge) {
    gauge = {
      name,
      help: `Gauge ${name}`,
      labels: Object.keys(labels),
      values: new Map(),
    };
    gauges.set(name, gauge);
  }

  const labelKey = JSON.stringify(labels);
  const current = gauge.values.get(labelKey) || 0;
  gauge.values.set(labelKey, current + value);
}

export function decGauge(
  name: string,
  labels: Record<string, string> = {},
  value: number = 1
): void {
  incGauge(name, labels, -value);
}

// ============================================
// Histogram Operations
// ============================================

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

export function observeHistogram(
  name: string,
  value: number,
  labels: Record<string, string> = {},
  buckets: number[] = DEFAULT_BUCKETS
): void {
  let histogram = histograms.get(name);
  if (!histogram) {
    histogram = {
      name,
      help: `Histogram ${name}`,
      labels: Object.keys(labels),
      buckets,
      values: new Map(),
    };
    histograms.set(name, histogram);
  }

  const labelKey = JSON.stringify(labels);
  let current = histogram.values.get(labelKey);
  if (!current) {
    current = { sum: 0, count: 0, buckets: new Array(buckets.length).fill(0) };
    histogram.values.set(labelKey, current);
  }

  current.sum += value;
  current.count += 1;
  for (let i = 0; i < buckets.length; i++) {
    if (value <= buckets[i]) {
      current.buckets[i]++;
    }
  }
}

// ============================================
// Timer Helper
// ============================================

export function startTimer(): () => number {
  const start = process.hrtime.bigint();
  return () => {
    const end = process.hrtime.bigint();
    return Number(end - start) / 1e9; // seconds
  };
}

// ============================================
// Pre-defined Metrics
// ============================================

export function recordHttpRequest(
  method: string,
  path: string,
  statusCode: number,
  durationSeconds: number
): void {
  incCounter("http_requests_total", { method, path, status: String(statusCode) });
  observeHistogram("http_request_duration_seconds", durationSeconds, { method, path });
}

export function recordJobProcessed(
  jobType: string,
  status: "success" | "failure"
): void {
  incCounter("job_processed_total", { type: jobType, status });
}

export function recordJobDuration(jobType: string, durationSeconds: number): void {
  observeHistogram("job_duration_seconds", durationSeconds, { type: jobType });
}

// ============================================
// Prometheus Format Export
// ============================================

export async function getMetricsOutput(): Promise<string> {
  const lines: string[] = [];

  // Add process metrics
  const memUsage = process.memoryUsage();
  setGauge("process_memory_heap_bytes", memUsage.heapUsed);
  setGauge("process_memory_rss_bytes", memUsage.rss);
  setGauge("process_uptime_seconds", process.uptime());

  // Add job queue metrics
  try {
    const jobStats = await getJobStats();
    setGauge("job_queue_pending", jobStats.pending);
    setGauge("job_queue_processing", jobStats.processing);
    setGauge("job_queue_failed", jobStats.failed);
    setGauge("job_queue_completed", jobStats.completed);
  } catch {
    // Job stats not available
  }

  // Add app info
  lines.push(`# HELP app_info Application information`);
  lines.push(`# TYPE app_info gauge`);
  lines.push(`app_info{version="${config.app.version}",name="${config.app.name}"} 1`);

  // Export counters
  for (const counter of counters.values()) {
    lines.push(`# HELP ${counter.name} ${counter.help}`);
    lines.push(`# TYPE ${counter.name} counter`);
    for (const [labelKey, value] of counter.values) {
      const labels = labelKey !== "{}" ? JSON.parse(labelKey) : {};
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      lines.push(`${counter.name}${labelStr ? `{${labelStr}}` : ""} ${value}`);
    }
  }

  // Export gauges
  for (const gauge of gauges.values()) {
    lines.push(`# HELP ${gauge.name} ${gauge.help}`);
    lines.push(`# TYPE ${gauge.name} gauge`);
    for (const [labelKey, value] of gauge.values) {
      const labels = labelKey !== "{}" ? JSON.parse(labelKey) : {};
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      lines.push(`${gauge.name}${labelStr ? `{${labelStr}}` : ""} ${value}`);
    }
  }

  // Export histograms
  for (const histogram of histograms.values()) {
    lines.push(`# HELP ${histogram.name} ${histogram.help}`);
    lines.push(`# TYPE ${histogram.name} histogram`);
    for (const [labelKey, data] of histogram.values) {
      const labels = labelKey !== "{}" ? JSON.parse(labelKey) : {};
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(",");
      const prefix = labelStr ? `{${labelStr},` : "{";
      const suffix = labelStr ? "}" : "}";
      
      let cumulative = 0;
      for (let i = 0; i < histogram.buckets.length; i++) {
        cumulative += data.buckets[i];
        lines.push(`${histogram.name}_bucket${prefix}le="${histogram.buckets[i]}"${suffix} ${cumulative}`);
      }
      lines.push(`${histogram.name}_bucket${prefix}le="+Inf"${suffix} ${data.count}`);
      lines.push(`${histogram.name}_sum${labelStr ? `{${labelStr}}` : ""} ${data.sum}`);
      lines.push(`${histogram.name}_count${labelStr ? `{${labelStr}}` : ""} ${data.count}`);
    }
  }

  return lines.join("\n");
}

// ============================================
// Auth Helper
// ============================================

export function validateMetricsAuth(request: Request): boolean {
  const token = config.observability.metricsToken;
  if (!token) return true; // No token configured = allow access (dev mode)

  const authHeader = request.headers.get("Authorization");
  const tokenHeader = request.headers.get("X-Metrics-Token");

  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7) === token;
  }
  if (tokenHeader) {
    return tokenHeader === token;
  }
  return false;
}
