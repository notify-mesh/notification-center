import "server-only";

import { prismaDbClient } from "@root/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * Analytics aggregations driven by the `Notification` + `NotificationAttempt`
 * tables.
 *
 * Output shapes are tuned for the dashboard's chart components — gap-filled
 * arrays for line/area charts, name/value pairs for donuts, table-ready
 * rows for the top-templates list, etc.
 *
 * Every aggregator accepts the same `AnalyticsFilters` shape so callers can
 * compose with the page-level filter bar without bespoke wiring.
 */

export type BucketSize = "hour" | "day" | "week";

export interface AnalyticsFilters {
  organizationId: string;
  projectId?: string;
  environmentId?: string;
  /** Restrict to a specific channelUsed value. */
  channel?: string;
  /** Restrict to a specific provider (via NotificationAttempt.providerName). */
  provider?: string;
  /** Restrict to a specific template name. */
  templateName?: string;
  /** Inclusive lower bound. Defaults to 7 days ago. */
  since?: Date;
  /** Inclusive upper bound. Defaults to now. */
  until?: Date;
  /** Time-axis bucket size for the timeline. */
  bucket?: BucketSize;
}

export interface AnalyticsSummary {
  range: { since: string; until: string; bucket: BucketSize };
  totals: {
    sent: number;
    failed: number;
    queued: number;
    deliveryRatePct: number;
    failureRatePct: number;
  };
  prior: { sent: number; failed: number };
  byChannel: Array<{ channel: string; sent: number; failed: number }>;
  byProvider: Array<{ provider: string; sent: number; failed: number }>;
  timeline: Array<{ bucket: string; sent: number; failed: number; total: number }>;
  topTemplates: Array<{ templateName: string; sent: number; failed: number; share: number }>;
  latency: { p50: number; p95: number; p99: number; count: number };
  recentFailures: Array<{
    id: string;
    channel: string;
    reason: string | null;
    createdAt: string;
    toPhone: string | null;
    toEmail: string | null;
    providerName: string | null;
  }>;
  costIrr: {
    total: number;
    perChannel: Array<{ channel: string; total: number }>;
    perDay: Array<{ bucket: string; cost: number }>;
  };
}

// ---------------------------------------------------------------------------
// Time bucketing helpers
// ---------------------------------------------------------------------------

function startOfBucket(date: Date, bucket: BucketSize): Date {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(0);
  if (bucket === "hour") return d;
  d.setUTCHours(0);
  if (bucket === "day") return d;
  // Week: anchor to the Monday of the week (ISO week start).
  const dow = d.getUTCDay();
  const back = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

function bucketKey(date: Date, bucket: BucketSize): string {
  const d = startOfBucket(date, bucket);
  if (bucket === "hour") return d.toISOString().slice(0, 13); // "2025-01-12T10"
  return d.toISOString().slice(0, 10); // "2025-01-12"
}

function enumerateBuckets(since: Date, until: Date, bucket: BucketSize): string[] {
  const start = startOfBucket(since, bucket);
  const end = startOfBucket(until, bucket);
  const out: string[] = [];
  const step = bucket === "hour" ? 3_600_000 : bucket === "day" ? 86_400_000 : 7 * 86_400_000;
  for (let t = start.getTime(); t <= end.getTime(); t += step) {
    out.push(bucketKey(new Date(t), bucket));
  }
  return out;
}

function pickBucketByRange(since: Date, until: Date): BucketSize {
  const days = (until.getTime() - since.getTime()) / 86_400_000;
  if (days <= 2) return "hour";
  if (days <= 60) return "day";
  return "week";
}

function buildWhere(filters: AnalyticsFilters): Prisma.NotificationWhereInput {
  const since = filters.since ?? new Date(Date.now() - 7 * 86_400_000);
  const until = filters.until ?? new Date();
  return {
    organizationId: filters.organizationId,
    projectId: filters.projectId,
    environmentId: filters.environmentId,
    channelUsed: filters.channel,
    templateName: filters.templateName,
    createdAt: { gte: since, lte: until },
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getAnalyticsSummary(filters: AnalyticsFilters): Promise<AnalyticsSummary> {
  const since = filters.since ?? new Date(Date.now() - 7 * 86_400_000);
  const until = filters.until ?? new Date();
  const bucket = filters.bucket ?? pickBucketByRange(since, until);

  const where = buildWhere({ ...filters, since, until });
  const priorSince = new Date(since.getTime() - (until.getTime() - since.getTime()));
  const priorWhere = buildWhere({ ...filters, since: priorSince, until: since });

  const [sentCount, failedCount, queuedCount, priorSent, priorFailed] = await Promise.all([
    prismaDbClient.notification.count({ where: { ...where, status: "SENT" } }),
    prismaDbClient.notification.count({ where: { ...where, status: "FAILED" } }),
    prismaDbClient.notification.count({ where: { ...where, status: "QUEUED" } }),
    prismaDbClient.notification.count({ where: { ...priorWhere, status: "SENT" } }),
    prismaDbClient.notification.count({ where: { ...priorWhere, status: "FAILED" } }),
  ]);
  const total = sentCount + failedCount + queuedCount;
  const deliveryRatePct = total === 0 ? 0 : Math.round((sentCount / total) * 100);
  const failureRatePct = total === 0 ? 0 : Math.round((failedCount / total) * 100);

  // ---- By channel --------------------------------------------------------
  const channelGroups = await prismaDbClient.notification.groupBy({
    by: ["channelUsed", "status"],
    where: { ...where, channelUsed: { not: null } },
    _count: { _all: true },
  });
  const channelMap = new Map<string, { sent: number; failed: number }>();
  for (const g of channelGroups) {
    const key = g.channelUsed ?? "unknown";
    const row = channelMap.get(key) ?? { sent: 0, failed: 0 };
    if (g.status === "SENT") row.sent += g._count._all;
    else if (g.status === "FAILED" || g.status === "PARTIAL") row.failed += g._count._all;
    channelMap.set(key, row);
  }
  const byChannel = [...channelMap.entries()].map(([channel, v]) => ({ channel, ...v }));

  // ---- By provider (joined via attempts) --------------------------------
  const providerGroups = await prismaDbClient.notificationAttempt.groupBy({
    by: ["providerName", "status"],
    where: {
      providerName: filters.provider ?? { not: null },
      notification: where,
    },
    _count: { _all: true },
  });
  const providerMap = new Map<string, { sent: number; failed: number }>();
  for (const g of providerGroups) {
    const key = g.providerName ?? "unknown";
    const row = providerMap.get(key) ?? { sent: 0, failed: 0 };
    if (g.status === "SENT" || g.status === "DELIVERED") row.sent += g._count._all;
    else if (g.status === "FAILED" || g.status === "SKIPPED" || g.status === "TIMEOUT")
      row.failed += g._count._all;
    providerMap.set(key, row);
  }
  const byProvider = [...providerMap.entries()].map(([provider, v]) => ({ provider, ...v }));

  // ---- Timeline ----------------------------------------------------------
  const timelineKeys = enumerateBuckets(since, until, bucket);
  const timelineMap = new Map<string, { sent: number; failed: number; total: number }>(
    timelineKeys.map((k) => [k, { sent: 0, failed: 0, total: 0 }]),
  );
  const timelineRows = await prismaDbClient.notification.findMany({
    where,
    select: { createdAt: true, status: true },
  });
  for (const r of timelineRows) {
    const key = bucketKey(r.createdAt, bucket);
    const slot = timelineMap.get(key);
    if (!slot) continue;
    slot.total += 1;
    if (r.status === "SENT") slot.sent += 1;
    else if (r.status === "FAILED" || r.status === "PARTIAL") slot.failed += 1;
  }
  const timeline = [...timelineMap.entries()].map(([k, v]) => ({ bucket: k, ...v }));

  // ---- Top templates ----------------------------------------------------
  const templateGroups = await prismaDbClient.notification.groupBy({
    by: ["templateName", "status"],
    where: { ...where, templateName: { not: null } },
    _count: { _all: true },
  });
  const tmplMap = new Map<string, { sent: number; failed: number }>();
  for (const g of templateGroups) {
    const key = g.templateName ?? "(none)";
    const row = tmplMap.get(key) ?? { sent: 0, failed: 0 };
    if (g.status === "SENT") row.sent += g._count._all;
    else if (g.status === "FAILED" || g.status === "PARTIAL") row.failed += g._count._all;
    tmplMap.set(key, row);
  }
  const totalSent = sentCount || 1;
  const topTemplates = [...tmplMap.entries()]
    .map(([templateName, v]) => ({
      templateName,
      sent: v.sent,
      failed: v.failed,
      share: Math.round((v.sent / totalSent) * 100),
    }))
    .sort((a, b) => b.sent - a.sent)
    .slice(0, 10);

  // ---- Latency ----------------------------------------------------------
  const latencyRows = await prismaDbClient.notificationAttempt.findMany({
    where: {
      notification: where,
      status: "SENT",
      latencyMs: { gt: 0 },
    },
    select: { latencyMs: true },
    take: 5000,
    orderBy: { startedAt: "desc" },
  });
  const sortedLatencies = latencyRows
    .map((r) => r.latencyMs ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const latency = {
    p50: percentile(sortedLatencies, 0.5),
    p95: percentile(sortedLatencies, 0.95),
    p99: percentile(sortedLatencies, 0.99),
    count: sortedLatencies.length,
  };

  // ---- Recent failures -------------------------------------------------
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
        select: { reason: true, channel: true, providerName: true },
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
    providerName: r.attempts[0]?.providerName ?? null,
  }));

  // ---- Cost ------------------------------------------------------------
  const costAggregate = await prismaDbClient.notification.aggregate({
    where,
    _sum: { costIrr: true },
  });
  const costByChannel = await prismaDbClient.notification.groupBy({
    by: ["channelUsed"],
    where: { ...where, channelUsed: { not: null } },
    _sum: { costIrr: true },
  });
  const costPerDayMap = new Map<string, number>(timelineKeys.map((k) => [k, 0]));
  const costRows = await prismaDbClient.notification.findMany({
    where: { ...where, costIrr: { not: null } },
    select: { createdAt: true, costIrr: true },
  });
  for (const r of costRows) {
    const k = bucketKey(r.createdAt, bucket);
    if (!costPerDayMap.has(k)) continue;
    costPerDayMap.set(k, (costPerDayMap.get(k) ?? 0) + (r.costIrr ?? 0));
  }

  return {
    range: { since: since.toISOString(), until: until.toISOString(), bucket },
    totals: {
      sent: sentCount,
      failed: failedCount,
      queued: queuedCount,
      deliveryRatePct,
      failureRatePct,
    },
    prior: { sent: priorSent, failed: priorFailed },
    byChannel,
    byProvider,
    timeline,
    topTemplates,
    latency,
    recentFailures,
    costIrr: {
      total: costAggregate._sum.costIrr ?? 0,
      perChannel: costByChannel.map((r) => ({
        channel: r.channelUsed ?? "unknown",
        total: r._sum.costIrr ?? 0,
      })),
      perDay: [...costPerDayMap.entries()].map(([k, cost]) => ({ bucket: k, cost })),
    },
  };
}

/**
 * Stream filtered notification rows for CSV export. Returns an async
 * iterable so the route handler can pipe to a `ReadableStream` without
 * buffering everything in memory.
 */
export async function* streamNotificationRows(filters: AnalyticsFilters) {
  const where = buildWhere(filters);
  const PAGE = 500;
  let cursor: string | undefined;

  for (;;) {
    // eslint-disable-next-line react-doctor/async-await-in-loop
    const page = await prismaDbClient.notification.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: PAGE + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      select: {
        id: true,
        createdAt: true,
        status: true,
        channelUsed: true,
        templateName: true,
        projectId: true,
        environmentId: true,
        toPhone: true,
        toEmail: true,
        reason: true,
        costIrr: true,
      },
    });
    const slice = page.length > PAGE ? page.slice(0, PAGE) : page;
    for (const row of slice) yield row;
    if (page.length <= PAGE) return;
    cursor = slice[slice.length - 1].id;
  }
}
