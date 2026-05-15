import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";

const AUTH_ACTIONS = [
  "SIGN_IN",
  "SIGN_OUT",
  "SIGN_UP",
  "PASSWORD_CHANGE",
  "PASSWORD_RESET_REQUEST",
  "PASSWORD_RESET_COMPLETE",
  "EMAIL_VERIFY_REQUEST",
  "EMAIL_VERIFY_COMPLETE",
  "PHONE_VERIFY_REQUEST",
  "PHONE_VERIFY_COMPLETE",
  "TWO_FACTOR_ENABLE",
  "TWO_FACTOR_DISABLE",
  "TWO_FACTOR_CHALLENGE",
  "TWO_FACTOR_VERIFY",
  "BACKUP_CODE_USED",
  "PASSKEY_REGISTER",
  "PASSKEY_REMOVE",
  "PASSKEY_AUTHENTICATE",
  "SESSION_CREATE",
  "SESSION_REFRESH",
  "SESSION_REVOKE",
  "SESSION_REVOKE_ALL",
  "DEVICE_TRUST",
  "DEVICE_UNTRUST",
  "DEVICE_REVOKE",
  "IMPERSONATION_START",
  "IMPERSONATION_END",
  "ACCOUNT_BAN",
  "ACCOUNT_UNBAN",
  "ACCOUNT_DELETE",
  "ROLE_CHANGE",
  "ORG_JOIN",
  "ORG_LEAVE",
  "ORG_INVITE_ACCEPT",
  "ORG_INVITE_DECLINE",
  "DEVICE_AUTH_REQUEST",
  "DEVICE_AUTH_APPROVE",
  "DEVICE_AUTH_REJECT",
  "COMPROMISED_PASSWORD_DETECTED",
  "RATE_LIMITED",
] as const;

const AUTH_OUTCOMES = ["SUCCESS", "FAILURE", "BLOCKED"] as const;
const SEVERITIES = ["INFO", "WARN", "CRITICAL"] as const;

const authEventSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  action: z.enum(AUTH_ACTIONS),
  outcome: z.enum(AUTH_OUTCOMES),
  reason: z.string().nullable(),
  identifier: z.string().nullable(),
  identifierKind: z.string().nullable(),
  method: z.string().nullable(),
  sessionId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  country: z.string().nullable(),
  region: z.string().nullable(),
  city: z.string().nullable(),
  riskScore: z.number().int().nullable(),
  riskFactors: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
});

const adminEventSchema = z.object({
  id: z.string(),
  actorUserId: z.string(),
  actorEmail: z.string().nullable(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  targetLabel: z.string().nullable(),
  organizationId: z.string().nullable(),
  projectId: z.string().nullable(),
  environmentId: z.string().nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  reason: z.string().nullable(),
  severity: z.enum(SEVERITIES),
  freshSession: z.boolean().nullable(),
  correlationId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

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
      action: z.enum(AUTH_ACTIONS).optional(),
      outcome: z.enum(AUTH_OUTCOMES).optional(),
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
      severity: z.enum(SEVERITIES).optional(),
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
