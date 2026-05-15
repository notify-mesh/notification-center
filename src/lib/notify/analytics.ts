import "server-only";

import { prismaDbClient } from "@root/lib/prisma";

/**
 * Analytics aggregations driven by the `Notification` + `NotificationAttempt`
 * tables. Output shapes are tuned for the dashboard's chart components
 * (Recharts-friendly bucket arrays + a small set of headline KPIs).
 *
 * All queries are scoped to (organizationId [, projectId, environmentId]);
 * filters are anded.
 */

export interface AnalyticsFilters {
  organizationId: string;
  projectId?: string;
  environmentId?: string;
  /** Inclusive lower bound. Defaults to 7 days ago. */
  since?: Date;
  /** Inclusive upper bound. Defaults to now. */
  until?: Date;
}

export interface AnalyticsSummary {
  totals: {
    sent: number;
    failed: number;
    queued: number;
    deliveryRatePct: number;
  };
  byChannel: Array<{ channel: string; sent: number; failed: number }>;
  byProvider: Array<{ provider: string; sent: number; failed: number }>;
  /** Daily buckets — gaps are filled with zero so charts don't have holes. */
  timeline: Array<{ day: string; sent: number; failed: number }>;
  recentFailures: Array<{
    id: string;
    channel: string;
    reason: string | null;
    createdAt: string;
    toPhone: string | null;
    toEmail: string | null;
  }>;
  costIrr: { total: number; perChannel: Array<{ channel: string; total: number }> };
}

export async function getAnalyticsSummary(filters: AnalyticsFilters): Promise<AnalyticsSummary> {
  const since = filters.since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const until = filters.until ?? new Date();
  const where = {
    organizationId: filters.organizationId,
    projectId: filters.projectId,
    environmentId: filters.environmentId,
    createdAt: { gte: since, lte: until },
  };

  // ---- KPIs ---------------------------------------------------------------
  const [sentCount, failedCount, queuedCount] = await Promise.all([
    prismaDbClient.notification.count({ where: { ...where, status: "SENT" } }),
    prismaDbClient.notification.count({ where: { ...where, status: "FAILED" } }),
    prismaDbClient.notification.count({ where: { ...where, status: "QUEUED" } }),
  ]);
  const total = sentCount + failedCount + queuedCount;
  const deliveryRatePct = total === 0 ? 0 : Math.round((sentCount / total) * 100);

  // ---- By channel ---------------------------------------------------------
  const channelRows = await prismaDbClient.notification.groupBy({
    by: ["channelUsed", "status"],
    where: { ...where, channelUsed: { not: null } },
    _count: { _all: true },
  });
  const byChannelMap = new Map<string, { sent: number; failed: number }>();
  for (const r of channelRows) {
    const key = r.channelUsed ?? "unknown";
    const bucket = byChannelMap.get(key) ?? { sent: 0, failed: 0 };
    if (r.status === "SENT") bucket.sent += r._count._all;
    else if (r.status === "FAILED" || r.status === "PARTIAL") bucket.failed += r._count._all;
    byChannelMap.set(key, bucket);
  }
  const byChannel = [...byChannelMap.entries()].map(([channel, v]) => ({ channel, ...v }));

  // ---- By provider --------------------------------------------------------
  const providerRows = await prismaDbClient.notificationAttempt.groupBy({
    by: ["providerName", "status"],
    where: { notification: { ...where }, providerName: { not: null } },
    _count: { _all: true },
  });
  const byProviderMap = new Map<string, { sent: number; failed: number }>();
  for (const r of providerRows) {
    const key = r.providerName ?? "unknown";
    const bucket = byProviderMap.get(key) ?? { sent: 0, failed: 0 };
    if (r.status === "SENT" || r.status === "DELIVERED") bucket.sent += r._count._all;
    else if (r.status === "FAILED" || r.status === "SKIPPED" || r.status === "TIMEOUT")
      bucket.failed += r._count._all;
    byProviderMap.set(key, bucket);
  }
  const byProvider = [...byProviderMap.entries()].map(([provider, v]) => ({ provider, ...v }));

  // ---- Timeline (per day, gap-filled) ------------------------------------
  const days = enumerateDays(since, until);
  const dayBuckets = new Map<string, { sent: number; failed: number }>(
    days.map((d) => [d, { sent: 0, failed: 0 }]),
  );
  const rows = await prismaDbClient.notification.findMany({
    where,
    select: { createdAt: true, status: true },
  });
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const bucket = dayBuckets.get(day);
    if (!bucket) continue;
    if (r.status === "SENT") bucket.sent += 1;
    else if (r.status === "FAILED" || r.status === "PARTIAL") bucket.failed += 1;
  }
  const timeline = [...dayBuckets.entries()].map(([day, v]) => ({ day, ...v }));

  // ---- Recent failures ---------------------------------------------------
  const recent = await prismaDbClient.notification.findMany({
    where: { ...where, status: "FAILED" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      channelUsed: true,
      reason: true,
      createdAt: true,
      toPhone: true,
      toEmail: true,
      attempts: {
        select: { reason: true, channel: true },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });
  const recentFailures = recent.map((r) => ({
    id: r.id,
    channel: r.channelUsed ?? r.attempts[0]?.channel ?? "unknown",
    reason: r.reason ?? r.attempts[0]?.reason ?? null,
    createdAt: r.createdAt.toISOString(),
    toPhone: r.toPhone,
    toEmail: r.toEmail,
  }));

  // ---- Cost --------------------------------------------------------------
  const costAggregate = await prismaDbClient.notification.aggregate({
    where,
    _sum: { costIrr: true },
  });
  const costByChannel = await prismaDbClient.notification.groupBy({
    by: ["channelUsed"],
    where: { ...where, channelUsed: { not: null } },
    _sum: { costIrr: true },
  });

  return {
    totals: { sent: sentCount, failed: failedCount, queued: queuedCount, deliveryRatePct },
    byChannel,
    byProvider,
    timeline,
    recentFailures,
    costIrr: {
      total: costAggregate._sum.costIrr ?? 0,
      perChannel: costByChannel.map((r) => ({
        channel: r.channelUsed ?? "unknown",
        total: r._sum.costIrr ?? 0,
      })),
    },
  };
}

function enumerateDays(since: Date, until: Date): string[] {
  const days: string[] = [];
  const day = new Date(since);
  day.setUTCHours(0, 0, 0, 0);
  const end = new Date(until);
  end.setUTCHours(0, 0, 0, 0);
  while (day <= end) {
    days.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return days;
}
