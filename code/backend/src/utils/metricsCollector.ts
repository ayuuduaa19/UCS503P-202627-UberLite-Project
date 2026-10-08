export interface RequestMetric {
  id: string;
  method: string;
  path: string;
  route: string;
  statusCode: number;
  durationMs: number;
  timestamp: Date;
}

export interface RouteMetricSummary {
  route: string;
  method: string;
  totalRequests: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p95DurationMs: number;
  status2xx: number;
  status4xx: number;
  status5xx: number;
}

export interface ApiResponseTimeMetrics {
  totalRequests: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  statusBreakdown: {
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
  };
  routes: RouteMetricSummary[];
  slowRequestsCount: number;
  recentSlowRequests: RequestMetric[];
}

export class MetricsCollector {
  private metrics: RequestMetric[] = [];
  private maxBufferSize: number;
  private slowThresholdMs: number;

  constructor(maxBufferSize: number = 2000, slowThresholdMs: number = 500) {
    this.maxBufferSize = maxBufferSize;
    this.slowThresholdMs = slowThresholdMs;
  }

  /**
   * Record a completed HTTP request execution
   */
  recordRequest(
    method: string,
    path: string,
    route: string,
    statusCode: number,
    durationMs: number
  ): RequestMetric {
    const metric: RequestMetric = {
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      method: method.toUpperCase(),
      path,
      route: route || path,
      statusCode,
      durationMs: parseFloat(durationMs.toFixed(2)),
      timestamp: new Date(),
    };

    if (this.metrics.length >= this.maxBufferSize) {
      this.metrics.shift(); // Evict oldest metric
    }
    this.metrics.push(metric);

    return metric;
  }

  /**
   * Calculate percentile helper
   */
  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    const index = (percentile / 100) * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sortedValues[lower];
    return parseFloat((sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight).toFixed(2));
  }

  /**
   * Get aggregated API response time metrics
   */
  getApiResponseMetrics(): ApiResponseTimeMetrics {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        avgDurationMs: 0,
        minDurationMs: 0,
        maxDurationMs: 0,
        p50DurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        statusBreakdown: {
          status2xx: 0,
          status3xx: 0,
          status4xx: 0,
          status5xx: 0,
        },
        routes: [],
        slowRequestsCount: 0,
        recentSlowRequests: [],
      };
    }

    const durations = this.metrics.map((m) => m.durationMs).sort((a, b) => a - b);
    const sumDuration = durations.reduce((acc, val) => acc + val, 0);
    const avgDurationMs = parseFloat((sumDuration / durations.length).toFixed(2));
    const minDurationMs = durations[0];
    const maxDurationMs = durations[durations.length - 1];

    const statusBreakdown = {
      status2xx: 0,
      status3xx: 0,
      status4xx: 0,
      status5xx: 0,
    };

    const routeGroups = new Map<string, RequestMetric[]>();

    for (const m of this.metrics) {
      if (m.statusCode >= 200 && m.statusCode < 300) statusBreakdown.status2xx++;
      else if (m.statusCode >= 300 && m.statusCode < 400) statusBreakdown.status3xx++;
      else if (m.statusCode >= 400 && m.statusCode < 500) statusBreakdown.status4xx++;
      else if (m.statusCode >= 500) statusBreakdown.status5xx++;

      const groupKey = `${m.method} ${m.route}`;
      const group = routeGroups.get(groupKey) || [];
      group.push(m);
      routeGroups.set(groupKey, group);
    }

    const routes: RouteMetricSummary[] = [];
    for (const [key, group] of routeGroups.entries()) {
      const [method, ...routeParts] = key.split(' ');
      const route = routeParts.join(' ');
      const groupDurations = group.map((g) => g.durationMs).sort((a, b) => a - b);
      const groupSum = groupDurations.reduce((acc, v) => acc + v, 0);

      let s2xx = 0;
      let s4xx = 0;
      let s5xx = 0;
      for (const req of group) {
        if (req.statusCode >= 200 && req.statusCode < 300) s2xx++;
        else if (req.statusCode >= 400 && req.statusCode < 500) s4xx++;
        else if (req.statusCode >= 500) s55(req.statusCode) ? s5xx++ : null;
      }

      function s55(code: number) {
        return code >= 500;
      }

      routes.push({
        route,
        method,
        totalRequests: group.length,
        avgDurationMs: parseFloat((groupSum / group.length).toFixed(2)),
        minDurationMs: groupDurations[0],
        maxDurationMs: groupDurations[groupDurations.length - 1],
        p95DurationMs: this.calculatePercentile(groupDurations, 95),
        status2xx: s2xx,
        status4xx: s4xx,
        status5xx: s5xx,
      });
    }

    const slowRequests = this.metrics
      .filter((m) => m.durationMs >= this.slowThresholdMs)
      .slice(-20);

    return {
      totalRequests: this.metrics.length,
      avgDurationMs,
      minDurationMs,
      maxDurationMs,
      p50DurationMs: this.calculatePercentile(durations, 50),
      p95DurationMs: this.calculatePercentile(durations, 95),
      p99DurationMs: this.calculatePercentile(durations, 99),
      statusBreakdown,
      routes,
      slowRequestsCount: this.metrics.filter((m) => m.durationMs >= this.slowThresholdMs).length,
      recentSlowRequests: slowRequests,
    };
  }

  /**
   * Reset all collected metrics (useful for testing and benchmarking)
   */
  reset(): void {
    this.metrics = [];
  }

  /**
   * Get all raw recorded metrics
   */
  getRawMetrics(): RequestMetric[] {
    return [...this.metrics];
  }
}

export const metricsCollector = new MetricsCollector();
