import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { getAnalyticsSummary } from "@root/lib/notify/analytics";
import { analyticsSummarySchema as summarySchema } from "@root/schemas/analytics";
import { ANALYTICS_BUCKET as BUCKET } from "@root/schemas/common";

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
