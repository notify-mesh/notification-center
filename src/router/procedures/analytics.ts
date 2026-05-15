import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { getAnalyticsSummary } from "@root/lib/notify/analytics";

interface ErrorsLike {
  NOT_FOUND: () => Error;
  UNAUTHORIZED: () => Error;
}

async function activeOrg(context: ORPCContext, errors: ErrorsLike): Promise<string> {
  try {
    return await resolveActiveOrgId(context);
  } catch (e) {
    if (e instanceof ActiveOrgError) {
      throw e.kind === "UNAUTHORIZED" ? errors.UNAUTHORIZED() : errors.NOT_FOUND();
    }
    throw e;
  }
}

const BUCKET = z.enum(["hour", "day", "week"]);

const summarySchema = z.object({
  range: z.object({
    since: z.iso.datetime(),
    until: z.iso.datetime(),
    bucket: BUCKET,
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

export const summary = authedProcedure
  .route({
    method: "GET",
    path: "/analytics/summary",
    summary: "Aggregate notification analytics for the active organization",
    description:
      "Sent / failed / queued counts, delivery rate, gap-filled timeline, per-channel + per-provider breakdowns, top templates, latency percentiles, cost in IRR (total + per channel + per day), and a recent-failures slice. All scoped to the active organization, optionally narrowed by project/env/channel/provider/template.",
    tags: ["analytics"],
  })
  .input(
    z.object({
      projectId: z.string().optional(),
      environmentId: z.string().optional(),
      channel: z.string().optional(),
      provider: z.string().optional(),
      templateName: z.string().optional(),
      sinceDays: z.number().int().min(1).max(180).default(7).describe("Days back from now. 1-180."),
      bucket: BUCKET.optional().describe("Auto-picked from range when omitted."),
    }),
  )
  .output(summarySchema)
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const since = new Date(Date.now() - input.sinceDays * 86_400_000);
    return await getAnalyticsSummary({
      organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      channel: input.channel,
      provider: input.provider,
      templateName: input.templateName,
      since,
      bucket: input.bucket,
    });
  });
