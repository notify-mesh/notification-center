import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import {
  AUTH_ACTIONS,
  AUTH_OUTCOMES,
  authEventSchema,
  adminEventSchema,
} from "@root/schemas/audit";
import { AUDIT_SEVERITY as SEVERITIES } from "@root/schemas/common";

function jsonRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function jsonArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

/**
 * `GET /audit/auth` — paginated authentication-event feed.
 *
 * Cursor pagination ordered by `createdAt DESC`. Filtering supports the
 * dimensions the dashboard surfaces (action, outcome, identifier, userId).
 * Without a userId filter, only admins see every row; everyone else sees
 * their own events.
 */
export const listAuthEvents = authedProcedure
  .route({
    method: "GET",
    path: "/audit/auth",
    summary: "List authentication audit events",
    description:
      "Cursor-paginated feed of identity events (sign-in, 2FA, passkey, session lifecycle, etc.). Non-admin callers are silently scoped to their own userId. Includes IP/UA, parsed geo, and risk signals.",
    tags: ["audit"],
  })
  .input(
    z.object({
      limit: z.number().int().min(1).max(100).default(50),
      cursor: z.string().optional().describe("`id` of the last row from the previous page."),
      action: AUTH_ACTIONS.optional(),
      outcome: AUTH_OUTCOMES.optional(),
      userId: z.string().optional(),
    }),
  )
  .output(
    z.object({
      events: z.array(authEventSchema),
      nextCursor: z.string().nullable(),
    }),
  )
  .handler(async ({ context, input }) => {
    const isAdmin = (context.user as { role?: string | null }).role === "admin";
    const userId = isAdmin ? input.userId : context.user.id;

    const rows = await prismaDbClient.authAuditLog.findMany({
      where: {
        userId: userId ?? undefined,
        action: input.action,
        outcome: input.outcome,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      skip: input.cursor ? 1 : 0,
    });

    const hasMore = rows.length > input.limit;
    const events = hasMore ? rows.slice(0, input.limit) : rows;

    return {
      events: events.map((e) => ({
        id: e.id,
        userId: e.userId,
        action: e.action,
        outcome: e.outcome,
        reason: e.reason,
        identifier: e.identifier,
        identifierKind: e.identifierKind,
        method: e.method,
        sessionId: e.sessionId,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        country: e.country,
        region: e.region,
        city: e.city,
        riskScore: e.riskScore,
        riskFactors: jsonArray(e.riskFactors),
        metadata: jsonRecord(e.metadata),
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (events[events.length - 1]?.id ?? null) : null,
    };
  });

/**
 * `GET /audit/admin` — paginated administrator-action feed.
 *
 * Captures dashboard-side state-changing operations (org create, project
 * archive, key rotate, etc.) with before/after diffs. Admin-only.
 */
export const listAdminEvents = authedProcedure
  .route({
    method: "GET",
    path: "/audit/admin",
    summary: "List administrator action audit events",
    description:
      "Cursor-paginated feed of admin actions (ban, rotate, publish, etc.) with diff payloads and severity. Restricted to users with the `admin` role.",
    tags: ["audit"],
  })
  .input(
    z.object({
      limit: z.number().int().min(1).max(100).default(50),
      cursor: z.string().optional(),
      action: z.string().optional(),
      severity: SEVERITIES.optional(),
      organizationId: z.string().optional(),
      targetType: z.string().optional(),
    }),
  )
  .output(
    z.object({
      events: z.array(adminEventSchema),
      nextCursor: z.string().nullable(),
    }),
  )
  .handler(async ({ context, input, errors }) => {
    if ((context.user as { role?: string | null }).role !== "admin") {
      throw errors.FORBIDDEN();
    }

    const rows = await prismaDbClient.adminAuditLog.findMany({
      where: {
        action: input.action,
        severity: input.severity,
        organizationId: input.organizationId,
        targetType: input.targetType,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      skip: input.cursor ? 1 : 0,
    });

    const hasMore = rows.length > input.limit;
    const events = hasMore ? rows.slice(0, input.limit) : rows;

    return {
      events: events.map((e) => ({
        id: e.id,
        actorUserId: e.actorUserId,
        actorEmail: e.actorEmail,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        targetLabel: e.targetLabel,
        organizationId: e.organizationId,
        projectId: e.projectId,
        environmentId: e.environmentId,
        before: jsonRecord(e.before),
        after: jsonRecord(e.after),
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        reason: e.reason,
        severity: e.severity,
        freshSession: e.freshSession,
        correlationId: e.correlationId,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? (events[events.length - 1]?.id ?? null) : null,
    };
  });
