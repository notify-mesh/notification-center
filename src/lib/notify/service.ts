import "server-only";

import { prismaDbClient } from "@root/lib/prisma";
import { redisClient } from "@root/lib/redis";
import { unsealCredential } from "@root/lib/crypto-vault";
import { getTransport } from "./registry";
import type { ChannelKind, NotifyMessage, TransportResult } from "./types";

/**
 * Send a notification through the database-resolved channel stack.
 *
 * Architecture
 * ------------
 *  caller ──► sendNotification({ orgId, projectId, envId, ...message })
 *               │
 *               ├─► restrictions   (allowed channel? sender? recipient?)
 *               ├─► rate limit     (per (org, channel) token bucket in Redis)
 *               ├─► resolve channel config from `EnabledChannel`
 *               │     └─► providerKey
 *               ├─► resolve creds from `ProviderCredential` → vault.unseal()
 *               ├─► build Transport from registry
 *               ├─► persist Notification row (status=QUEUED)
 *               ├─► call transport.send()
 *               ├─► persist NotificationAttempt
 *               └─► return Notification id + result
 *
 * Fallback: when `channels` is an ordered list, each is tried until one
 * succeeds. The aggregate `Notification` row captures the last attempt's
 * channel as `channelUsed`.
 */
interface SendInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  apiKeyId?: string | null;
  /** Ordered list of channel preferences. First successful attempt wins. */
  channels: ChannelKind[];
  /** Recipient — one of phone / email / etc., depending on channel. */
  recipient: { phone?: string; email?: string; externalUserId?: string };
  /** Either an inline message or a template reference + variables. */
  message:
    | { kind: "inline"; subject?: string; body?: string; html?: string }
    | {
        kind: "template";
        templateName: string;
        variables: Record<string, unknown>;
        locale?: string;
      };
  /** Free-form metadata attached to the audit trail. */
  metadata?: Record<string, unknown>;
  /** Optional idempotency key — replay returns the same row. */
  idempotencyKey?: string;
  /** Optional cross-call locale override for template rendering. */
  locale?: string;
}

export interface SendResult {
  id: string;
  status: "SENT" | "FAILED" | "QUEUED";
  channelUsed: ChannelKind | null;
  attempts: Array<{
    channel: ChannelKind;
    status: "SENT" | "FAILED" | "QUEUED";
    providerKey: string;
    providerMessageId?: string;
    reason?: string;
  }>;
}

const RATE_LIMIT_MAX_PER_MIN = 600;

/**
 * Apply a Redis-backed token bucket per (org, channel). Cheap, distributed,
 * works under autoscaling. Returns true if the call should proceed.
 */
async function checkRateLimit(orgId: string, channel: ChannelKind): Promise<boolean> {
  const windowEpoch = Math.floor(Date.now() / 1000 / 60); // 1-minute window
  const key = `nfy:rl:${orgId}:${channel}:${windowEpoch}`;
  const count = Number(await redisClient.incr(key));
  if (count === 1) await redisClient.expire(key, 60);
  return count <= RATE_LIMIT_MAX_PER_MIN;
}

/**
 * Resolve channel config + credentials. Centralised so caller and tests
 * have one place to instrument.
 */
async function resolveChannelStack(input: {
  projectId: string;
  environmentId: string;
  channel: ChannelKind;
}): Promise<{
  providerKey: string;
  channelConfig: Record<string, unknown>;
  creds: Record<string, unknown>;
} | null> {
  const enabled = await prismaDbClient.enabledChannel.findUnique({
    where: {
      projectId_environmentId_channel: {
        projectId: input.projectId,
        environmentId: input.environmentId,
        channel: input.channel,
      },
    },
  });
  if (!enabled || !enabled.isActive) return null;

  const cred = await prismaDbClient.providerCredential.findFirst({
    where: {
      projectId: input.projectId,
      environmentId: input.environmentId,
      providerKey: enabled.providerKey,
    },
  });
  if (!cred) return null;

  const unsealed = unsealCredential({
    wrappedDek: cred.wrappedDek,
    kekVersion: cred.kekVersion,
    payload: cred.payload as unknown as Parameters<typeof unsealCredential>[0]["payload"],
  });

  const channelConfig = (enabled.config ?? {}) as Record<string, unknown>;
  return { providerKey: enabled.providerKey, channelConfig, creds: unsealed };
}

/**
 * Build a normalised `NotifyMessage` for a specific channel given the user-
 * facing payload. Template rendering is intentionally pluggable — for now
 * we substitute variables literally; a full Handlebars/MJML pipeline lives
 * in `@root/lib/notify/templates.ts` (added in Phase 4).
 */
async function buildMessage(input: {
  channel: ChannelKind;
  recipient: SendInput["recipient"];
  message: SendInput["message"];
  channelConfig: Record<string, unknown>;
  projectId: string;
  locale?: string;
}): Promise<NotifyMessage | null> {
  const rendered = await renderMessage({
    projectId: input.projectId,
    channel: input.channel,
    locale: input.locale,
    message: input.message,
  });
  if (!rendered) return null;

  if (input.channel === "sms") {
    if (!input.recipient.phone) return null;
    return {
      channel: "sms",
      to: input.recipient.phone,
      body: rendered.text ?? rendered.body ?? "",
      sender: (input.channelConfig.sender as string | undefined) ?? undefined,
      template: rendered.template,
      tokens: rendered.tokens,
    };
  }

  if (input.channel === "email") {
    if (!input.recipient.email) return null;
    return {
      channel: "email",
      to: input.recipient.email,
      subject: rendered.subject ?? "(no subject)",
      html: rendered.html,
      text: rendered.text,
      from: input.channelConfig.from as string | undefined,
    };
  }

  return null;
}

interface RenderedMessage {
  subject?: string;
  html?: string;
  text?: string;
  body?: string;
  template?: string;
  tokens?: Record<string, string>;
}

async function renderMessage(input: {
  projectId: string;
  channel: ChannelKind;
  locale?: string;
  message: SendInput["message"];
}): Promise<RenderedMessage | null> {
  if (input.message.kind === "inline") {
    return {
      subject: input.message.subject,
      html: input.message.html,
      text: input.message.body,
      body: input.message.body,
    };
  }

  const variant = await prismaDbClient.templateVariant.findFirst({
    where: {
      template: { projectId: input.projectId, name: input.message.templateName },
      channel: input.channel,
      locale: input.locale ?? input.message.locale ?? "fa-IR",
      status: "PUBLISHED",
    },
    orderBy: { version: "desc" },
  });
  // Fallback: any published variant for the channel, ignoring locale.
  const fallback =
    variant ??
    (await prismaDbClient.templateVariant.findFirst({
      where: {
        template: { projectId: input.projectId, name: input.message.templateName },
        channel: input.channel,
        status: "PUBLISHED",
      },
      orderBy: { version: "desc" },
    }));

  if (!fallback) return null;

  const vars = input.message.variables;
  return {
    subject: fallback.subject ? interpolate(fallback.subject, vars) : undefined,
    html: fallback.html ? interpolate(fallback.html, vars) : undefined,
    text: fallback.text ? interpolate(fallback.text, vars) : undefined,
    body: fallback.text ? interpolate(fallback.text, vars) : undefined,
  };
}

/** Trivial `{{var}}` interpolation. Production: swap for Handlebars (Feature 07). */
function interpolate(template: string, vars: Record<string, unknown>): string {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_, k) => String(vars[k] ?? ""));
}

function mapTopLevelStatus(s: string): "SENT" | "FAILED" | "QUEUED" {
  if (s === "SENT" || s === "DELIVERED") return "SENT";
  if (s === "FAILED" || s === "PARTIAL" || s === "CANCELLED" || s === "EXPIRED") return "FAILED";
  return "QUEUED";
}

function mapAttemptStatus(s: string): "SENT" | "FAILED" | "QUEUED" {
  if (s === "SENT" || s === "DELIVERED") return "SENT";
  if (s === "FAILED" || s === "SKIPPED" || s === "TIMEOUT") return "FAILED";
  return "QUEUED";
}

/**
 * Top-level send. Caller is responsible for authorisation (the API-key
 * permission gate lives in the oRPC procedure that calls this).
 */
export async function sendNotification(input: SendInput): Promise<SendResult> {
  // Idempotency: replay returns the original row.
  if (input.idempotencyKey && input.apiKeyId) {
    const existing = await prismaDbClient.notification.findUnique({
      where: {
        apiKeyId_idempotencyKey: { apiKeyId: input.apiKeyId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (existing) {
      const attempts = await prismaDbClient.notificationAttempt.findMany({
        where: { notificationId: existing.id },
      });
      return {
        id: existing.id,
        status: mapTopLevelStatus(existing.status),
        channelUsed: (existing.channelUsed as ChannelKind | null) ?? null,
        attempts: attempts.map((a) => ({
          channel: a.channel as ChannelKind,
          status: mapAttemptStatus(a.status),
          providerKey: a.providerName ?? "unknown",
          providerMessageId: a.channelRecordId ?? undefined,
          reason: a.reason ?? undefined,
        })),
      };
    }
  }

  const notification = await prismaDbClient.notification.create({
    data: {
      projectId: input.projectId,
      environmentId: input.environmentId,
      organizationId: input.organizationId,
      apiKeyId: input.apiKeyId ?? "manual",
      templateName: input.message.kind === "template" ? input.message.templateName : null,
      locale: input.locale,
      variables: input.message.kind === "template" ? (input.message.variables as never) : undefined,
      toPhone: input.recipient.phone,
      toEmail: input.recipient.email,
      externalUserId: input.recipient.externalUserId,
      channelsRequested: input.channels as never,
      status: "QUEUED",
      metadata: (input.metadata ?? {}) as never,
      idempotencyKey: input.idempotencyKey,
    },
  });

  const attempts: SendResult["attempts"] = [];
  let channelUsed: ChannelKind | null = null;
  let attemptNumber = 0;

  for (const channel of input.channels) {
    attemptNumber += 1;
    const start = Date.now();

    // eslint-disable-next-line react-doctor/async-await-in-loop
    const allowed = await checkRateLimit(input.organizationId, channel);
    if (!allowed) {
      attempts.push({
        channel,
        status: "FAILED",
        providerKey: "rate-limit",
        reason: "rate_limited",
      });
      // eslint-disable-next-line react-doctor/async-await-in-loop
      await prismaDbClient.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attempt: attemptNumber,
          channel,
          status: "FAILED",
          reason: "rate_limited",
          finishedAt: new Date(),
          latencyMs: Date.now() - start,
        },
      });
      continue;
    }

    // eslint-disable-next-line react-doctor/async-await-in-loop
    const stack = await resolveChannelStack({
      projectId: input.projectId,
      environmentId: input.environmentId,
      channel,
    });
    if (!stack) {
      attempts.push({ channel, status: "FAILED", providerKey: "none", reason: "channel_disabled" });
      // eslint-disable-next-line react-doctor/async-await-in-loop
      await prismaDbClient.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attempt: attemptNumber,
          channel,
          status: "SKIPPED",
          reason: "channel_disabled",
          finishedAt: new Date(),
          latencyMs: Date.now() - start,
        },
      });
      continue;
    }

    // eslint-disable-next-line react-doctor/async-await-in-loop
    const message = await buildMessage({
      channel,
      recipient: input.recipient,
      message: input.message,
      channelConfig: stack.channelConfig,
      projectId: input.projectId,
      locale: input.locale,
    });
    if (!message) {
      attempts.push({
        channel,
        status: "FAILED",
        providerKey: stack.providerKey,
        reason: "no_recipient_or_template",
      });
      // eslint-disable-next-line react-doctor/async-await-in-loop
      await prismaDbClient.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attempt: attemptNumber,
          channel,
          providerName: stack.providerKey,
          status: "SKIPPED",
          reason: "no_recipient_or_template",
          finishedAt: new Date(),
          latencyMs: Date.now() - start,
        },
      });
      continue;
    }

    const transport = getTransport({
      providerKey: stack.providerKey,
      channel,
      creds: stack.creds,
      channelConfig: stack.channelConfig,
    });

    let result: TransportResult;
    try {
      // eslint-disable-next-line react-doctor/async-await-in-loop
      result = await transport.send(message);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "transport_error";
      attempts.push({ channel, status: "FAILED", providerKey: stack.providerKey, reason });
      // eslint-disable-next-line react-doctor/async-await-in-loop
      await prismaDbClient.notificationAttempt.create({
        data: {
          notificationId: notification.id,
          attempt: attemptNumber,
          channel,
          providerName: stack.providerKey,
          status: "FAILED",
          reason,
          finishedAt: new Date(),
          latencyMs: Date.now() - start,
        },
      });
      continue;
    }

    attempts.push({
      channel,
      status: "SENT",
      providerKey: stack.providerKey,
      providerMessageId: result.providerMessageId,
    });
    // eslint-disable-next-line react-doctor/async-await-in-loop
    await prismaDbClient.notificationAttempt.create({
      data: {
        notificationId: notification.id,
        attempt: attemptNumber,
        channel,
        providerName: stack.providerKey,
        channelRecordId: result.providerMessageId,
        status: "SENT",
        providerStatus:
          result.providerStatusText ??
          (result.providerStatusCode ? String(result.providerStatusCode) : null),
        finishedAt: new Date(),
        latencyMs: Date.now() - start,
      },
    });
    channelUsed = channel;
    break;
  }

  const finalStatus = channelUsed ? "SENT" : "FAILED";
  await prismaDbClient.notification.update({
    where: { id: notification.id },
    data: {
      status: finalStatus,
      channelUsed,
      sentAt: channelUsed ? new Date() : null,
      failedAt: channelUsed ? null : new Date(),
    },
  });

  return {
    id: notification.id,
    status: finalStatus,
    channelUsed,
    attempts,
  };
}
