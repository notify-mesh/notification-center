import { z } from "zod";
import { CHANNEL } from "./common";

/** Re-export for callers that still import the legacy constant name. */
export const SEND_CHANNEL = CHANNEL;

export const sendNotificationInput = z.object({
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
});

export const sendNotificationOutput = z.object({
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
});
