import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { sendNotification } from "@root/lib/notify/service";

interface ErrorsLike {
  NOT_FOUND: () => Error;
  UNAUTHORIZED: () => Error;
  CONFLICT: () => Error;
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

const CHANNEL = z.enum(["sms", "email", "push", "bale", "telegram", "slack", "webhook"]);

export const send = authedProcedure
  .route({
    method: "POST",
    path: "/notifications",
    summary: "Send a notification (unified)",
    description:
      "Resolves channel + provider + credentials from the database for the caller's active organization. Tries `channels` in order; first successful attempt wins. Returns the aggregate `Notification` id plus the per-channel attempt log.",
    tags: ["notifications"],
  })
  .input(
    z.object({
      projectId: z.string(),
      environmentId: z.string(),
      channels: z.array(CHANNEL).min(1),
      recipient: z.object({
        phone: z.string().optional(),
        email: z.email().optional(),
        externalUserId: z.string().optional(),
      }),
      content: z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("inline"),
          subject: z.string().optional(),
          body: z.string().optional(),
          html: z.string().optional(),
        }),
        z.object({
          kind: z.literal("template"),
          templateName: z.string(),
          variables: z.record(z.string(), z.unknown()).default({}),
          locale: z.string().optional(),
        }),
      ]),
      metadata: z.record(z.string(), z.unknown()).optional(),
      idempotencyKey: z.string().optional(),
      locale: z.string().optional(),
    }),
  )
  .output(
    z.object({
      id: z.string(),
      status: z.enum(["SENT", "FAILED", "QUEUED"]),
      channelUsed: CHANNEL.nullable(),
      attempts: z.array(
        z.object({
          channel: CHANNEL,
          status: z.enum(["SENT", "FAILED", "QUEUED"]),
          providerKey: z.string(),
          providerMessageId: z.string().optional(),
          reason: z.string().optional(),
        }),
      ),
    }),
  )
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const result = await sendNotification({
      organizationId,
      projectId: input.projectId,
      environmentId: input.environmentId,
      channels: input.channels,
      recipient: input.recipient,
      message: input.content,
      metadata: input.metadata,
      idempotencyKey: input.idempotencyKey,
      locale: input.locale,
    });
    return result;
  });
