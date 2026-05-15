import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { sendNotification } from "@root/lib/notify/service";
import { sendNotificationInput, sendNotificationOutput } from "@root/schemas/notifications-send";

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

export const send = authedProcedure
  .route({
    method: "POST",
    path: "/notifications",
    summary: "Send a notification (unified)",
    description:
      "Resolves channel + provider + credentials from the database for the caller's active organization. Tries `channels` in order; first successful attempt wins. Returns the aggregate `Notification` id plus the per-channel attempt log.",
    tags: ["notifications"],
  })
  .input(sendNotificationInput)
  .output(sendNotificationOutput)
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
