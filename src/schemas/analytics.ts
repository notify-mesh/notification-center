import { z } from "zod";
import { ANALYTICS_BUCKET } from "./common";

export const analyticsSummarySchema = z.object({
  range: z.object({
    since: z.iso.datetime(),
    until: z.iso.datetime(),
    bucket: ANALYTICS_BUCKET,
  }),
  totals: z.object({
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    deliveryRatePct: z.number().int(),
    failureRatePct: z.number().int(),
  }),
  prior: z.object({
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  byChannel: z.array(z.object({ channel: z.string(), sent: z.number(), failed: z.number() })),
  byProvider: z.array(z.object({ provider: z.string(), sent: z.number(), failed: z.number() })),
  timeline: z.array(
    z.object({
      bucket: z.string(),
      sent: z.number(),
      failed: z.number(),
      total: z.number(),
    }),
  ),
  topTemplates: z.array(
    z.object({
      templateName: z.string(),
      sent: z.number(),
      failed: z.number(),
      share: z.number(),
    }),
  ),
  latency: z.object({
    p50: z.number(),
    p95: z.number(),
    p99: z.number(),
    count: z.number(),
  }),
  recentFailures: z.array(
    z.object({
      id: z.string(),
      channel: z.string(),
      reason: z.string().nullable(),
      createdAt: z.iso.datetime(),
      toPhone: z.string().nullable(),
      toEmail: z.string().nullable(),
      providerName: z.string().nullable(),
    }),
  ),
  costIrr: z.object({
    total: z.number().int(),
    perChannel: z.array(z.object({ channel: z.string(), total: z.number().int() })),
    perDay: z.array(z.object({ bucket: z.string(), cost: z.number().int() })),
  }),
});
