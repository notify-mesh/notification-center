import { z } from "zod";

export const INTERNAL_NOTIFY_SEVERITY = z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]);
export const AUDIENCE_KIND = z.enum(["GLOBAL", "ORGANIZATION", "PROJECT", "TEAM", "USERS"]);
export const MIRROR_CHANNEL = z.enum(["email", "sms"]);

export const audienceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("GLOBAL") }),
  z.object({ kind: z.literal("ORGANIZATION"), organizationId: z.string() }),
  z.object({ kind: z.literal("PROJECT"), projectId: z.string() }),
  z.object({ kind: z.literal("TEAM"), teamId: z.string() }),
  z.object({ kind: z.literal("USERS"), userIds: z.array(z.string()).min(1).max(500) }),
]);

export const notificationActionSchema = z
  .object({
    label: z.string().min(1).max(60),
    url: z.string().min(1).max(500),
    kind: z.enum(["link", "primary", "danger"]).default("link"),
  })
  .nullable();

export const notificationDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  action: z
    .object({
      label: z.string(),
      url: z.string(),
      kind: z.string(),
    })
    .nullable(),
  severity: INTERNAL_NOTIFY_SEVERITY,
  category: z.string().nullable(),
  audienceKind: AUDIENCE_KIND,
  audienceLabel: z.string(),
  recipientCount: z.number().int(),
  readCount: z.number().int(),
  dismissedCount: z.number().int(),
  clickedCount: z.number().int(),
  mirrorChannels: z.array(z.string()),
  sender: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }),
  sentAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
});

export const inboxRowSchema = notificationDtoSchema.extend({
  recipientId: z.string(),
  readAt: z.iso.datetime().nullable(),
  dismissedAt: z.iso.datetime().nullable(),
  clickedAt: z.iso.datetime().nullable(),
});
