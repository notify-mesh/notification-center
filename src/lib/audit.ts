import "server-only";

import { prismaDbClient } from "@root/lib/prisma";

/**
 * Single entry point for writing operator activity to the audit log.
 *
 * Centralising the write keeps every call site consistent — same field
 * names, same severity vocabulary, IP/UA fishing in one place — and makes
 * it cheap to swap the sink later (e.g. fan out to a SIEM).
 *
 * Two flavours:
 *  - `recordAdminActivity` — operator actions (org/team/project/permission
 *    changes). Persisted in `AdminAuditLog` with a before/after diff.
 *  - `recordAuthActivity`  — identity events (sign-in, password change,
 *    passkey register/remove, 2FA toggle). Persisted in `AuthAuditLog`.
 *
 * Callers fire-and-forget: the helpers never throw — failing to write an
 * audit row must never abort the underlying operation. Errors are logged
 * to stdout for observability and ignored.
 */

type AuditSeverity = "INFO" | "WARN" | "CRITICAL";

export interface RecordAdminInput {
  actor: { userId: string; email?: string | null };
  action: string;
  target: {
    type: string;
    id: string;
    label?: string | null;
  };
  organizationId?: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  severity?: AuditSeverity;
  reason?: string;
  freshSession?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string;
}

export async function recordAdminActivity(input: RecordAdminInput): Promise<void> {
  try {
    await prismaDbClient.adminAuditLog.create({
      data: {
        actorUserId: input.actor.userId,
        actorEmail: input.actor.email,
        action: input.action,
        targetType: input.target.type,
        targetId: input.target.id,
        targetLabel: input.target.label,
        organizationId: input.organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        severity: input.severity ?? "INFO",
        reason: input.reason,
        freshSession: input.freshSession,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        correlationId: input.correlationId,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[audit] adminAuditLog write failed:", e);
  }
}

type AuthAction =
  | "SIGN_IN"
  | "SIGN_OUT"
  | "SIGN_UP"
  | "PASSWORD_CHANGE"
  | "PASSWORD_RESET_REQUEST"
  | "PASSWORD_RESET_COMPLETE"
  | "EMAIL_VERIFY_REQUEST"
  | "EMAIL_VERIFY_COMPLETE"
  | "PHONE_VERIFY_REQUEST"
  | "PHONE_VERIFY_COMPLETE"
  | "TWO_FACTOR_ENABLE"
  | "TWO_FACTOR_DISABLE"
  | "TWO_FACTOR_CHALLENGE"
  | "TWO_FACTOR_VERIFY"
  | "BACKUP_CODE_USED"
  | "PASSKEY_REGISTER"
  | "PASSKEY_REMOVE"
  | "PASSKEY_AUTHENTICATE"
  | "SESSION_CREATE"
  | "SESSION_REFRESH"
  | "SESSION_REVOKE"
  | "SESSION_REVOKE_ALL"
  | "DEVICE_TRUST"
  | "DEVICE_UNTRUST"
  | "DEVICE_REVOKE"
  | "IMPERSONATION_START"
  | "IMPERSONATION_END"
  | "ACCOUNT_BAN"
  | "ACCOUNT_UNBAN"
  | "ACCOUNT_DELETE"
  | "ROLE_CHANGE"
  | "ORG_JOIN"
  | "ORG_LEAVE"
  | "ORG_INVITE_ACCEPT"
  | "ORG_INVITE_DECLINE"
  | "DEVICE_AUTH_REQUEST"
  | "DEVICE_AUTH_APPROVE"
  | "DEVICE_AUTH_REJECT"
  | "COMPROMISED_PASSWORD_DETECTED"
  | "RATE_LIMITED";

export interface RecordAuthInput {
  userId: string | null;
  action: AuthAction;
  outcome: "SUCCESS" | "FAILURE" | "BLOCKED";
  identifier?: string | null;
  identifierKind?: "email" | "username" | "phone" | null;
  method?: string | null;
  sessionId?: string | null;
  deviceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  riskScore?: number | null;
  riskFactors?: string[];
  metadata?: Record<string, unknown>;
  reason?: string | null;
}

export async function recordAuthActivity(input: RecordAuthInput): Promise<void> {
  try {
    await prismaDbClient.authAuditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        outcome: input.outcome,
        identifier: input.identifier ?? undefined,
        identifierKind: input.identifierKind ?? undefined,
        method: input.method ?? undefined,
        sessionId: input.sessionId ?? undefined,
        deviceId: input.deviceId ?? undefined,
        ipAddress: input.ipAddress ?? undefined,
        userAgent: input.userAgent ?? undefined,
        country: input.country ?? undefined,
        region: input.region ?? undefined,
        city: input.city ?? undefined,
        riskScore: input.riskScore ?? undefined,
        riskFactors: (input.riskFactors ?? []) as never,
        metadata: (input.metadata ?? {}) as never,
        reason: input.reason ?? undefined,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[audit] authAuditLog write failed:", e);
  }
}
