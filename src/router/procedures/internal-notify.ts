import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import {
  resolveAudience,
  listAudienceOptions,
  type AudienceTarget,
} from "@root/lib/internal-notify/audience";
import { publishEvent, subscribeUserEvents } from "@root/lib/internal-notify/pubsub";
import { sendNotification } from "@root/lib/notify/service";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Shared zod shapes
// ---------------------------------------------------------------------------

const SEVERITY = z.enum(["INFO", "SUCCESS", "WARNING", "CRITICAL"]);
const AUDIENCE_KIND = z.enum(["GLOBAL", "ORGANIZATION", "PROJECT", "TEAM", "USERS"]);
const MIRROR_CHANNEL = z.enum(["email", "sms"]);

const audienceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("GLOBAL") }),
  z.object({ kind: z.literal("ORGANIZATION"), organizationId: z.string() }),
  z.object({ kind: z.literal("PROJECT"), projectId: z.string() }),
  z.object({ kind: z.literal("TEAM"), teamId: z.string() }),
  z.object({ kind: z.literal("USERS"), userIds: z.array(z.string()).min(1).max(500) }),
]);

const actionSchema = z
  .object({
    label: z.string().min(1).max(60),
    url: z.string().min(1).max(500),
    kind: z.enum(["link", "primary", "danger"]).default("link"),
  })
  .nullable();

const notificationDtoSchema = z.object({
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
  severity: SEVERITY,
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

const inboxRowSchema = notificationDtoSchema.extend({
  recipientId: z.string(),
  readAt: z.iso.datetime().nullable(),
  dismissedAt: z.iso.datetime().nullable(),
  clickedAt: z.iso.datetime().nullable(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DbNotification {
  id: string;
  title: string;
  body: string;
  action: Prisma.JsonValue;
  severity: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  category: string | null;
  audienceKind: "GLOBAL" | "ORGANIZATION" | "PROJECT" | "TEAM" | "USERS";
  audienceLabel: string;
  recipientCount: number;
  readCount: number;
  dismissedCount: number;
  clickedCount: number;
  mirrorChannels: Prisma.JsonValue;
  sentAt: Date;
  expiresAt: Date | null;
  sender: { id: string; name: string; email: string; image: string | null };
}

function toNotificationDto(row: DbNotification): z.infer<typeof notificationDtoSchema> {
  const action =
    row.action && typeof row.action === "object" && !Array.isArray(row.action)
      ? (row.action as { label: string; url: string; kind: string })
      : null;
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    action: action ? { label: action.label, url: action.url, kind: action.kind ?? "link" } : null,
    severity: row.severity,
    category: row.category,
    audienceKind: row.audienceKind,
    audienceLabel: row.audienceLabel,
    recipientCount: row.recipientCount,
    readCount: row.readCount,
    dismissedCount: row.dismissedCount,
    clickedCount: row.clickedCount,
    mirrorChannels: Array.isArray(row.mirrorChannels) ? row.mirrorChannels.map(String) : [],
    sender: row.sender,
    sentAt: row.sentAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// User search (for the USERS audience picker)
//
// Visibility rules — kept in sync with `audience.ts`:
//   • Super-admin → every active, non-deleted user.
//   • Regular sender → every user who shares at least one organization with
//                      the caller.
//
// Query matches against name / email / username / phoneNumber, case-
// insensitive. Caller's own row is always excluded (you can't send a
// notification to yourself via the picker — use the inbox demo for that).
// ---------------------------------------------------------------------------

export const searchUsers = authedProcedure
  .route({
    method: "GET",
    path: "/internal-notifications/search-users",
    summary: "Search users the caller can include in a USERS audience",
    tags: ["internal-notify"],
  })
  .input(
    z.object({
      query: z.string().max(120).default(""),
      limit: z.number().int().min(1).max(50).default(20),
      /** When passed, *also* include these ids in the result (e.g. so the
       *  composer can hydrate already-selected chips from a fresh search). */
      includeIds: z.array(z.string()).max(200).optional(),
    }),
  )
  .output(
    z.object({
      users: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
          username: z.string().nullable(),
          image: z.string().nullable(),
          phoneNumber: z.string().nullable(),
          organizationNames: z.array(z.string()),
        }),
      ),
    }),
  )
  .handler(async ({ context, input }) => {
    const isAdmin = (context.user as { role?: string | null }).role === "admin";
    const trimmed = input.query.trim();
    const q = trimmed.length > 0 ? trimmed : null;

    // Build the visibility constraint once.
    const visibilityWhere = isAdmin
      ? {}
      : {
          members: {
            some: {
              organization: {
                members: { some: { userId: context.user.id } },
              },
            },
          },
        };

    const matchWhere = q
      ? {
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { username: { contains: q } },
            { phoneNumber: { contains: q } },
          ],
        }
      : {};

    // Two queries:
    //   1. The search results (limited, ordered by name).
    //   2. The "hydrate-already-selected" set (passed via `includeIds`).
    // Both pass through the visibility constraint so a malicious client can't
    // smuggle ids belonging to other tenants.
    const [results, included] = await Promise.all([
      prismaDbClient.user.findMany({
        where: {
          AND: [
            { id: { not: context.user.id } },
            { isActive: true, deletedAt: null },
            visibilityWhere,
            matchWhere,
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          username: true,
          image: true,
          phoneNumber: true,
          members: { select: { organization: { select: { name: true } } } },
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: input.limit,
      }),
      input.includeIds && input.includeIds.length > 0
        ? prismaDbClient.user.findMany({
            where: {
              AND: [
                { id: { in: input.includeIds } },
                { isActive: true, deletedAt: null },
                visibilityWhere,
              ],
            },
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
              image: true,
              phoneNumber: true,
              members: { select: { organization: { select: { name: true } } } },
            },
          })
        : Promise.resolve([]),
    ]);

    // Merge + dedupe — included rows take precedence when both lists carry
    // the same id (the data is identical, but this guarantees stable order).
    const byId = new Map<string, (typeof results)[number]>();
    for (const u of results) byId.set(u.id, u);
    for (const u of included) if (!byId.has(u.id)) byId.set(u.id, u);

    return {
      users: [...byId.values()].map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        username: u.username,
        image: u.image,
        phoneNumber: u.phoneNumber,
        organizationNames: u.members.map((m) => m.organization.name),
      })),
    };
  });

// ---------------------------------------------------------------------------
// Audience options + preview
// ---------------------------------------------------------------------------

export const audienceOptions = authedProcedure
  .route({
    method: "GET",
    path: "/internal-notifications/audience-options",
    summary: "List audiences the caller can target",
    tags: ["internal-notify"],
  })
  .output(
    z.object({
      isAdmin: z.boolean(),
      organizations: z.array(
        z.object({ id: z.string(), name: z.string(), memberCount: z.number().int() }),
      ),
      projects: z.array(
        z.object({ id: z.string(), name: z.string(), organizationName: z.string() }),
      ),
      teams: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          organizationName: z.string(),
          memberCount: z.number().int(),
        }),
      ),
    }),
  )
  .handler(async ({ context }) => {
    return listAudienceOptions({
      senderUserId: context.user.id,
      senderRole: (context.user as { role?: string | null }).role ?? null,
    });
  });

export const audiencePreview = authedProcedure
  .route({
    method: "POST",
    path: "/internal-notifications/audience-preview",
    summary: "Preview recipient count + sample for a given audience target",
    tags: ["internal-notify"],
  })
  .input(z.object({ target: audienceTargetSchema }))
  .output(
    z.object({
      audienceKind: AUDIENCE_KIND,
      audienceLabel: z.string(),
      count: z.number().int(),
      sample: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
          image: z.string().nullable(),
        }),
      ),
      denied: z.string().nullable(),
    }),
  )
  .handler(async ({ context, input }) => {
    const resolved = await resolveAudience(input.target as AudienceTarget, {
      senderUserId: context.user.id,
      senderRole: (context.user as { role?: string | null }).role ?? null,
    });
    if (resolved.denied) {
      return {
        audienceKind: resolved.audienceKind,
        audienceLabel: resolved.audienceLabel,
        count: 0,
        sample: [],
        denied: resolved.denied,
      };
    }
    const sample = await prismaDbClient.user.findMany({
      where: { id: { in: resolved.userIds.slice(0, 10) } },
      select: { id: true, name: true, email: true, image: true },
    });
    return {
      audienceKind: resolved.audienceKind,
      audienceLabel: resolved.audienceLabel,
      count: resolved.userIds.length,
      sample,
      denied: null,
    };
  });

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export const send = authedProcedure
  .route({
    method: "POST",
    path: "/internal-notifications",
    summary: "Compose + dispatch an internal notification",
    description:
      "Resolves the audience to a concrete recipient set, fans out one row per recipient, and optionally mirrors through email / SMS via the existing notify pipeline. Returns the created notification id + resolved recipient count.",
    tags: ["internal-notify"],
  })
  .input(
    z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(10_000),
      severity: SEVERITY.default("INFO"),
      category: z.string().max(60).optional(),
      action: actionSchema.optional(),
      target: audienceTargetSchema,
      mirrorChannels: z.array(MIRROR_CHANNEL).default([]),
      /** When mirroring email/SMS, pick which project/env provides the credentials. */
      mirrorProjectId: z.string().optional(),
      mirrorEnvironmentId: z.string().optional(),
      expiresAt: z.iso.datetime().optional(),
    }),
  )
  .output(
    z.object({
      id: z.string(),
      recipientCount: z.number().int(),
      audienceLabel: z.string(),
      mirrorAttempted: z.number().int(),
    }),
  )
  .handler(async ({ context, input, errors }) => {
    const resolved = await resolveAudience(input.target as AudienceTarget, {
      senderUserId: context.user.id,
      senderRole: (context.user as { role?: string | null }).role ?? null,
    });
    if (resolved.denied) throw errors.FORBIDDEN({ message: resolved.denied });
    if (resolved.userIds.length === 0) throw errors.NOT_FOUND({ message: "No recipients." });

    // Validate mirror config eagerly so we don't half-fan out.
    if (input.mirrorChannels.length > 0) {
      if (!input.mirrorProjectId || !input.mirrorEnvironmentId) {
        throw errors.VALIDATION_ERROR({
          data: {
            issues: [
              {
                path: ["mirrorProjectId"],
                message:
                  "mirrorProjectId + mirrorEnvironmentId are required when mirrorChannels is non-empty.",
              },
            ],
          },
        });
      }
    }

    const notification = await prismaDbClient.internalNotification.create({
      data: {
        senderUserId: context.user.id,
        title: input.title,
        body: input.body,
        severity: input.severity,
        category: input.category,
        action: (input.action ?? null) as never,
        audienceKind: resolved.audienceKind,
        audienceLabel: resolved.audienceLabel,
        target: input.target as never,
        recipientCount: resolved.userIds.length,
        mirrorChannels: input.mirrorChannels as never,
        mirrorJobIds: [] as never,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    // Fan out recipient rows in chunks (createMany handles up to a few
    // thousand cleanly).
    const CHUNK = 500;
    for (let i = 0; i < resolved.userIds.length; i += CHUNK) {
      const slice = resolved.userIds.slice(i, i + CHUNK);
      // eslint-disable-next-line react-doctor/async-await-in-loop
      await prismaDbClient.internalNotificationRecipient.createMany({
        data: slice.map((userId) => ({
          notificationId: notification.id,
          userId,
          channel: "inApp",
        })),
        skipDuplicates: true,
      });
    }

    // Optional mirror through email/SMS via the existing service. Best-effort;
    // failures are recorded in mirrorJobIds but do not fail the send.
    const mirrorJobIds: string[] = [];
    if (input.mirrorChannels.length > 0) {
      const recipientUsers = await prismaDbClient.user.findMany({
        where: { id: { in: resolved.userIds } },
        select: { id: true, email: true, phoneNumber: true, locale: true },
      });
      const organizationId =
        input.target.kind === "ORGANIZATION"
          ? input.target.organizationId
          : input.target.kind === "PROJECT"
            ? (
                await prismaDbClient.project.findUnique({
                  where: { id: input.target.projectId },
                  select: { organizationId: true },
                })
              )?.organizationId
            : input.target.kind === "TEAM"
              ? (
                  await prismaDbClient.team.findUnique({
                    where: { id: input.target.teamId },
                    select: { organizationId: true },
                  })
                )?.organizationId
              : (
                  await prismaDbClient.member.findFirst({
                    where: { userId: context.user.id },
                    select: { organizationId: true },
                  })
                )?.organizationId;

      if (organizationId && input.mirrorProjectId && input.mirrorEnvironmentId) {
        const subject = input.title;
        const bodyText = input.body;
        const bodyHtml = `<h2>${escapeHtml(subject)}</h2><pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(bodyText)}</pre>${
          input.action
            ? `<p><a href="${escapeAttr(input.action.url)}">${escapeHtml(input.action.label)}</a></p>`
            : ""
        }`;
        for (const user of recipientUsers) {
          for (const channel of input.mirrorChannels) {
            const recipient =
              channel === "email"
                ? { email: user.email }
                : { phone: user.phoneNumber ?? undefined };
            if (channel === "email" && !user.email) continue;
            if (channel === "sms" && !user.phoneNumber) continue;
            try {
              // eslint-disable-next-line react-doctor/async-await-in-loop
              const res = await sendNotification({
                organizationId,
                projectId: input.mirrorProjectId,
                environmentId: input.mirrorEnvironmentId,
                channels: [channel],
                recipient,
                message: {
                  kind: "inline",
                  subject,
                  body: bodyText,
                  html: channel === "email" ? bodyHtml : undefined,
                },
                metadata: { internalNotificationId: notification.id },
              });
              if (res.id) mirrorJobIds.push(res.id);
            } catch {
              // Per-recipient mirror failure — swallow, keep going.
            }
          }
        }

        if (mirrorJobIds.length > 0) {
          await prismaDbClient.internalNotification.update({
            where: { id: notification.id },
            data: { mirrorJobIds: mirrorJobIds as never },
          });
        }
      }
    }

    // Publish a "new" SSE event to every recipient so live tabs update.
    void Promise.all(
      resolved.userIds.map((userId) =>
        publishEvent({
          type: "new",
          notificationId: notification.id,
          userId,
          preview: { title: input.title, severity: input.severity },
        }),
      ),
    );

    return {
      id: notification.id,
      recipientCount: resolved.userIds.length,
      audienceLabel: resolved.audienceLabel,
      mirrorAttempted: mirrorJobIds.length,
    };
  });

// ---------------------------------------------------------------------------
// Inbox / Outbox
// ---------------------------------------------------------------------------

export const inbox = authedProcedure
  .route({
    method: "GET",
    path: "/internal-notifications/inbox",
    summary: "List notifications the caller has received",
    tags: ["internal-notify"],
  })
  .input(
    z.object({
      filter: z.enum(["all", "unread", "read"]).default("all"),
      limit: z.number().int().min(1).max(100).default(30),
      cursor: z.string().optional(),
    }),
  )
  .output(
    z.object({
      items: z.array(inboxRowSchema),
      nextCursor: z.string().nullable(),
      unreadCount: z.number().int(),
    }),
  )
  .handler(async ({ context, input }) => {
    const where: Prisma.InternalNotificationRecipientWhereInput = {
      userId: context.user.id,
      dismissedAt: null,
    };
    if (input.filter === "unread") where.readAt = null;
    if (input.filter === "read") where.readAt = { not: null };

    const rows = await prismaDbClient.internalNotificationRecipient.findMany({
      where,
      include: {
        notification: {
          include: {
            sender: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      skip: input.cursor ? 1 : 0,
    });

    const slice = rows.length > input.limit ? rows.slice(0, input.limit) : rows;
    const nextCursor = rows.length > input.limit ? slice[slice.length - 1].id : null;

    // Mark as delivered (idempotent).
    const undelivered = slice.filter((r) => r.deliveredAt === null).map((r) => r.id);
    if (undelivered.length > 0) {
      await prismaDbClient.internalNotificationRecipient.updateMany({
        where: { id: { in: undelivered } },
        data: { deliveredAt: new Date() },
      });
    }

    const unreadCount = await prismaDbClient.internalNotificationRecipient.count({
      where: { userId: context.user.id, readAt: null, dismissedAt: null },
    });

    return {
      items: slice.map((r) => ({
        recipientId: r.id,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        dismissedAt: r.dismissedAt ? r.dismissedAt.toISOString() : null,
        clickedAt: r.clickedAt ? r.clickedAt.toISOString() : null,
        ...toNotificationDto(r.notification),
      })),
      nextCursor,
      unreadCount,
    };
  });

export const unreadCount = authedProcedure
  .route({
    method: "GET",
    path: "/internal-notifications/unread-count",
    summary: "Get caller's unread internal-notification count",
    tags: ["internal-notify"],
  })
  .output(z.object({ count: z.number().int() }))
  .handler(async ({ context }) => {
    const count = await prismaDbClient.internalNotificationRecipient.count({
      where: { userId: context.user.id, readAt: null, dismissedAt: null },
    });
    return { count };
  });

export const outbox = authedProcedure
  .route({
    method: "GET",
    path: "/internal-notifications/outbox",
    summary: "List notifications the caller has sent",
    tags: ["internal-notify"],
  })
  .input(
    z.object({
      limit: z.number().int().min(1).max(50).default(20),
      cursor: z.string().optional(),
    }),
  )
  .output(
    z.object({
      items: z.array(notificationDtoSchema),
      nextCursor: z.string().nullable(),
    }),
  )
  .handler(async ({ context, input }) => {
    const rows = await prismaDbClient.internalNotification.findMany({
      where: { senderUserId: context.user.id, cancelledAt: null },
      include: { sender: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      skip: input.cursor ? 1 : 0,
    });
    const slice = rows.length > input.limit ? rows.slice(0, input.limit) : rows;
    const nextCursor = rows.length > input.limit ? slice[slice.length - 1].id : null;
    return {
      items: slice.map((r) => toNotificationDto(r)),
      nextCursor,
    };
  });

// ---------------------------------------------------------------------------
// Mark read / dismissed / clicked
// ---------------------------------------------------------------------------

async function markRecipient(
  notificationId: string,
  userId: string,
  patch: { readAt?: Date; dismissedAt?: Date; clickedAt?: Date },
): Promise<{ updated: boolean }> {
  const recipient = await prismaDbClient.internalNotificationRecipient.findUnique({
    where: { notificationId_userId: { notificationId, userId } },
    select: { id: true, readAt: true, dismissedAt: true, clickedAt: true },
  });
  if (!recipient) return { updated: false };

  // Skip if the relevant field is already set (idempotent).
  const willChange =
    (patch.readAt && !recipient.readAt) ||
    (patch.dismissedAt && !recipient.dismissedAt) ||
    (patch.clickedAt && !recipient.clickedAt);
  if (!willChange) return { updated: false };

  await prismaDbClient.$transaction(async (tx) => {
    await tx.internalNotificationRecipient.update({
      where: { id: recipient.id },
      data: patch,
    });
    const incs: { readCount?: number; dismissedCount?: number; clickedCount?: number } = {};
    if (patch.readAt && !recipient.readAt) incs.readCount = 1;
    if (patch.dismissedAt && !recipient.dismissedAt) incs.dismissedCount = 1;
    if (patch.clickedAt && !recipient.clickedAt) incs.clickedCount = 1;
    if (Object.keys(incs).length > 0) {
      await tx.internalNotification.update({
        where: { id: notificationId },
        data: {
          readCount: incs.readCount ? { increment: incs.readCount } : undefined,
          dismissedCount: incs.dismissedCount ? { increment: incs.dismissedCount } : undefined,
          clickedCount: incs.clickedCount ? { increment: incs.clickedCount } : undefined,
        },
      });
    }
  });
  return { updated: true };
}

export const markRead = authedProcedure
  .route({
    method: "POST",
    path: "/internal-notifications/{id}/read",
    summary: "Mark a single notification as read",
    tags: ["internal-notify"],
  })
  .input(z.object({ id: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input }) => {
    const result = await markRecipient(input.id, context.user.id, { readAt: new Date() });
    if (result.updated) {
      void publishEvent({ type: "read", notificationId: input.id, userId: context.user.id });
    }
    return { success: true };
  });

export const markManyRead = authedProcedure
  .route({
    method: "POST",
    path: "/internal-notifications/mark-many-read",
    summary: "Mark a specific subset of inbox notifications as read",
    description:
      "Takes a list of notification ids. Only the caller's own recipient rows are touched; ids that don't belong to the caller are silently skipped.",
    tags: ["internal-notify"],
  })
  .input(z.object({ ids: z.array(z.string()).min(1).max(200) }))
  .output(z.object({ updatedCount: z.number().int() }))
  .handler(async ({ context, input }) => {
    const recipients = await prismaDbClient.internalNotificationRecipient.findMany({
      where: {
        userId: context.user.id,
        notificationId: { in: input.ids },
        readAt: null,
        dismissedAt: null,
      },
      select: { id: true, notificationId: true },
    });
    if (recipients.length === 0) return { updatedCount: 0 };
    const now = new Date();
    await prismaDbClient.$transaction([
      prismaDbClient.internalNotificationRecipient.updateMany({
        where: { id: { in: recipients.map((r) => r.id) } },
        data: { readAt: now },
      }),
      ...recipients.map((r) =>
        prismaDbClient.internalNotification.update({
          where: { id: r.notificationId },
          data: { readCount: { increment: 1 } },
        }),
      ),
    ]);
    for (const r of recipients) {
      void publishEvent({
        type: "read",
        notificationId: r.notificationId,
        userId: context.user.id,
      });
    }
    return { updatedCount: recipients.length };
  });

export const dismissMany = authedProcedure
  .route({
    method: "POST",
    path: "/internal-notifications/dismiss-many",
    summary: "Dismiss a specific subset of inbox notifications",
    tags: ["internal-notify"],
  })
  .input(z.object({ ids: z.array(z.string()).min(1).max(200) }))
  .output(z.object({ updatedCount: z.number().int() }))
  .handler(async ({ context, input }) => {
    const recipients = await prismaDbClient.internalNotificationRecipient.findMany({
      where: {
        userId: context.user.id,
        notificationId: { in: input.ids },
        dismissedAt: null,
      },
      select: { id: true, notificationId: true },
    });
    if (recipients.length === 0) return { updatedCount: 0 };
    const now = new Date();
    await prismaDbClient.$transaction([
      prismaDbClient.internalNotificationRecipient.updateMany({
        where: { id: { in: recipients.map((r) => r.id) } },
        data: { dismissedAt: now },
      }),
      ...recipients.map((r) =>
        prismaDbClient.internalNotification.update({
          where: { id: r.notificationId },
          data: { dismissedCount: { increment: 1 } },
        }),
      ),
    ]);
    for (const r of recipients) {
      void publishEvent({
        type: "dismissed",
        notificationId: r.notificationId,
        userId: context.user.id,
      });
    }
    return { updatedCount: recipients.length };
  });

export const markAllRead = authedProcedure
  .route({
    method: "POST",
    path: "/internal-notifications/mark-all-read",
    summary: "Mark every unread notification in the caller's inbox as read",
    tags: ["internal-notify"],
  })
  .output(z.object({ updatedCount: z.number().int() }))
  .handler(async ({ context }) => {
    const unread = await prismaDbClient.internalNotificationRecipient.findMany({
      where: { userId: context.user.id, readAt: null, dismissedAt: null },
      select: { id: true, notificationId: true },
    });
    if (unread.length === 0) return { updatedCount: 0 };
    const now = new Date();
    await prismaDbClient.$transaction([
      prismaDbClient.internalNotificationRecipient.updateMany({
        where: { id: { in: unread.map((u) => u.id) } },
        data: { readAt: now },
      }),
      ...unread.map((u) =>
        prismaDbClient.internalNotification.update({
          where: { id: u.notificationId },
          data: { readCount: { increment: 1 } },
        }),
      ),
    ]);
    for (const u of unread) {
      void publishEvent({
        type: "read",
        notificationId: u.notificationId,
        userId: context.user.id,
      });
    }
    return { updatedCount: unread.length };
  });

export const dismiss = authedProcedure
  .route({
    method: "POST",
    path: "/internal-notifications/{id}/dismiss",
    summary: "Hide a notification from the caller's inbox",
    tags: ["internal-notify"],
  })
  .input(z.object({ id: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input }) => {
    const result = await markRecipient(input.id, context.user.id, { dismissedAt: new Date() });
    if (result.updated) {
      void publishEvent({ type: "dismissed", notificationId: input.id, userId: context.user.id });
    }
    return { success: true };
  });

export const click = authedProcedure
  .route({
    method: "POST",
    path: "/internal-notifications/{id}/click",
    summary: "Record a CTA click against a notification",
    tags: ["internal-notify"],
  })
  .input(z.object({ id: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input }) => {
    const result = await markRecipient(input.id, context.user.id, {
      clickedAt: new Date(),
      readAt: new Date(),
    });
    if (result.updated) {
      void publishEvent({ type: "clicked", notificationId: input.id, userId: context.user.id });
      void publishEvent({ type: "read", notificationId: input.id, userId: context.user.id });
    }
    return { success: true };
  });

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const analytics = authedProcedure
  .route({
    method: "GET",
    path: "/internal-notifications/{id}/analytics",
    summary: "Detailed delivery analytics for one sent notification",
    tags: ["internal-notify", "analytics"],
  })
  .input(z.object({ id: z.string() }))
  .output(
    z.object({
      notification: notificationDtoSchema,
      totals: z.object({
        recipients: z.number().int(),
        delivered: z.number().int(),
        read: z.number().int(),
        dismissed: z.number().int(),
        clicked: z.number().int(),
        unread: z.number().int(),
        readRatePct: z.number().int(),
        clickRatePct: z.number().int(),
      }),
      readOverTime: z.array(z.object({ bucket: z.string(), reads: z.number().int() })),
      recentRecipients: z.array(
        z.object({
          userId: z.string(),
          name: z.string(),
          email: z.string(),
          image: z.string().nullable(),
          readAt: z.iso.datetime().nullable(),
          deliveredAt: z.iso.datetime().nullable(),
          clickedAt: z.iso.datetime().nullable(),
        }),
      ),
      unreadRecipients: z.array(
        z.object({
          userId: z.string(),
          name: z.string(),
          email: z.string(),
        }),
      ),
    }),
  )
  .handler(async ({ context, input, errors }) => {
    const isAdmin = (context.user as { role?: string | null }).role === "admin";
    const notification = await prismaDbClient.internalNotification.findUnique({
      where: { id: input.id },
      include: { sender: { select: { id: true, name: true, email: true, image: true } } },
    });
    if (!notification) throw errors.NOT_FOUND();
    if (!isAdmin && notification.senderUserId !== context.user.id) {
      throw errors.FORBIDDEN();
    }

    const recipients = await prismaDbClient.internalNotificationRecipient.findMany({
      where: { notificationId: input.id },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    });

    const recipientsCount = recipients.length;
    const delivered = recipients.filter((r) => r.deliveredAt).length;
    const read = recipients.filter((r) => r.readAt).length;
    const dismissed = recipients.filter((r) => r.dismissedAt).length;
    const clicked = recipients.filter((r) => r.clickedAt).length;
    const unread = recipientsCount - read - dismissed;
    const readRatePct = recipientsCount === 0 ? 0 : Math.round((read / recipientsCount) * 100);
    const clickRatePct = recipientsCount === 0 ? 0 : Math.round((clicked / recipientsCount) * 100);

    // Read-over-time bucketed by hour for first 24h, then day.
    const sentAt = notification.sentAt.getTime();
    const buckets = new Map<string, number>();
    for (const r of recipients) {
      if (!r.readAt) continue;
      const offsetMs = r.readAt.getTime() - sentAt;
      let key: string;
      if (offsetMs < 24 * 3_600_000) {
        const hour = Math.floor(offsetMs / 3_600_000);
        key = `+${hour}h`;
      } else {
        const day = Math.floor(offsetMs / 86_400_000);
        key = `+${day}d`;
      }
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const readOverTime = [...buckets.entries()]
      .map(([bucket, reads]) => ({ bucket, reads }))
      .sort((a, b) => offsetKeyToNumber(a.bucket) - offsetKeyToNumber(b.bucket));

    const sorted = [...recipients].sort((a, b) => {
      // Most recent activity first: readAt > clickedAt > deliveredAt > createdAt
      const aT = (a.readAt ?? a.clickedAt ?? a.deliveredAt ?? a.createdAt).getTime();
      const bT = (b.readAt ?? b.clickedAt ?? b.deliveredAt ?? b.createdAt).getTime();
      return bT - aT;
    });

    return {
      notification: toNotificationDto(notification),
      totals: {
        recipients: recipientsCount,
        delivered,
        read,
        dismissed,
        clicked,
        unread,
        readRatePct,
        clickRatePct,
      },
      readOverTime,
      recentRecipients: sorted.slice(0, 20).map((r) => ({
        userId: r.user.id,
        name: r.user.name,
        email: r.user.email,
        image: r.user.image,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
        clickedAt: r.clickedAt ? r.clickedAt.toISOString() : null,
      })),
      unreadRecipients: recipients
        .filter((r) => !r.readAt && !r.dismissedAt)
        .slice(0, 20)
        .map((r) => ({ userId: r.user.id, name: r.user.name, email: r.user.email })),
    };
  });

function offsetKeyToNumber(key: string): number {
  // "+3h" → 3, "+2d" → 48 — used purely for sort ordering.
  const sign = key.startsWith("+") ? 1 : -1;
  const stripped = key.replace("+", "").replace("-", "");
  const unit = stripped.endsWith("h") ? "h" : "d";
  const n = Number.parseInt(stripped.slice(0, -1), 10);
  return sign * n * (unit === "d" ? 24 : 1);
}

// ---------------------------------------------------------------------------
// SSE stream
// ---------------------------------------------------------------------------

export const stream = authedProcedure
  .route({
    method: "GET",
    path: "/internal-notifications/stream",
    summary: "Server-Sent Events stream of inbox + read events for the caller",
    tags: ["internal-notify"],
  })
  .handler(async function* ({ context, signal }) {
    const userId = context.user.id;
    const ac = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => ac.abort(), { once: true });
    }
    // Yield a connect ping immediately so the client knows we're live.
    yield { type: "ping" as const, ts: Date.now() };
    for await (const event of subscribeUserEvents(userId, ac.signal)) {
      yield event;
    }
  });

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
