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

const summarySchema = z.object({
  totals: z.object({
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    deliveryRatePct: z.number().int(),
  }),
  byChannel: z.array(z.object({ channel: z.string(), sent: z.number(), failed: z.number() })),
  byProvider: z.array(z.object({ provider: z.string(), sent: z.number(), failed: z.number() })),
  timeline: z.array(z.object({ day: z.string(), sent: z.number(), failed: z.number() })),
  recentFailures: z.array(
    z.object({
      id: z.string(),
      channel: z.string(),
      reason: z.string().nullable(),
      createdAt: z.iso.datetime(),
      toPhone: z.string().nullable(),
      toEmail: z.string().nullable(),
    }),
  ),
  costIrr: z.object({
    total: z.number().int(),
    perChannel: z.array(z.object({ channel: z.string(), total: z.number().int() })),
  }),
});

export const summary = authedProcedure
  .route({
    method: "GET",
    path: "/analytics/summary",
    summary: "Aggregate notification analytics for the active organization",
    description:
      "Sent / failed / queued counts, daily timeline, per-channel + per-provider breakdowns, cost in IRR, and a recent-failures slice. Defaults to the last 7 days.",
    tags: ["analytics"],
  })
  .input(
    z.object({
      projectId: z.string().optional(),
      environmentId: z.string().optional(),
      sinceDays: z.number().int().min(1).max(90).default(7),
    }),
  )
  .output(summarySchema)
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const since = new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000);
    return await getAnalyticsSummary({
      organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      since,
    });
  });
