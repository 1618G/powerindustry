/**
 * Prometheus Metrics Endpoint
 * 
 * GET /api/metrics - Returns Prometheus-format metrics
 * 
 * Protected by METRICS_TOKEN header. Not exposed publicly via Traefik.
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { getMetricsOutput, validateMetricsAuth } from "~/observability/metrics.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Validate auth token
  if (!validateMetricsAuth(request)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="metrics"',
      },
    });
  }

  try {
    const metrics = await getMetricsOutput();
    
    return new Response(metrics, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(
      `# Error collecting metrics: ${error instanceof Error ? error.message : "Unknown"}`,
      {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }
    );
  }
}
