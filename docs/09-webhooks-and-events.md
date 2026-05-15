# Feature 09 — Outbound Webhooks & Delivery Events

> **Status:** Draft · **Phase:** 2 · **Depends on:** Feature 12 (API keys)

## 1. Summary

A signed, retried, replayable webhook system. The platform emits events for every significant lifecycle moment (sent, delivered, failed, opened, clicked, bounced, complained, suppressed, otp.verified, job.completed, …). Customers subscribe HTTPS endpoints to specific event names per project+environment. The platform retries with exponential backoff and exposes a delivery log for inspection.

## 2. Problem & Motivation

Polling `GET /v1/.../{id}` for every send doesn't scale. Customers want push-based notifications of state changes — for audit, dashboards, or downstream automation.

## 3. Goals & Non-Goals

### Goals
- `WebhookSubscription` per project+environment with selectable event names.
- HMAC-signed payloads (`X-NC-Signature: t=<ts>,v1=<sig>`) over a shared secret + timestamp.
- Retries: 1m, 5m, 30m, 2h, 12h, 24h (6 attempts, ~40h horizon). Configurable per subscription.
- Per-event delivery log with response code, body excerpt, latency.
- "Replay" endpoint to re-send a past event.
- Public event catalog with JSON Schemas.

### Non-Goals
- Inbound webhooks (Phase 4).
- Wildcard `*` event subscriptions (Phase 3 — start with explicit lists for clarity).

## 4. Event Catalog (initial)

| Event | Source feature | Payload key fields |
|---|---|---|
| `sms.sent` | 01 | `id, receptor, provider, templateName?` |
| `sms.delivered` | 01 | `id, receptor, deliveredAt` |
| `sms.failed` | 01 | `id, receptor, reason, providerStatusCode` |
| `bale.sent` | 02 | `id, providerMessageId, kind` |
| `bale.user_not_found` | 02 | `id, identifier` |
| `email.sent` | 03 | `id, to[], subject, provider` |
| `email.bounced` | 03 | `id, to[], reason` |
| `email.complained` | 03 | `id, to[]` |
| `email.opened` | 03 | `id, to, openedAt` |
| `email.clicked` | 03 | `id, to, url, clickedAt` |
| `push.sent` | 04 | `id, fanout, okCount, expiredCount` |
| `otp.verified` | 05 | `otpId, identifierHash, purpose, channel, fallbackUsed` |
| `otp.expired` | 05 | `otpId, identifierHash, purpose` |
| `notification.completed` | 06 | `id, channelUsed, status, attempts` |
| `job.completed` | 08 | `id, total, succeeded, failed` |
| `job.cancelled` | 08 | `id, succeeded, failed, skipped` |
| `apiKey.quota_exceeded` | 12 | `apiKeyId, windowType, limit` |
| `apiKey.security_violation` | 12 | `apiKeyId, kind` (e.g. ip_blocked) |

Each event document carries: `id` (event id), `name`, `createdAt`, `projectId`, `environmentId`, `apiKeyId`, `data` (the per-event payload).

## 5. API Specification

### 5.1 Subscriptions

- `GET    /v1/webhooks`                        — list subscriptions
- `POST   /v1/webhooks`                        — create
- `GET    /v1/webhooks/{id}`
- `PATCH  /v1/webhooks/{id}`                   — change url, events, secret, retryPolicy
- `DELETE /v1/webhooks/{id}`
- `POST   /v1/webhooks/{id}/rotate-secret`
- `POST   /v1/webhooks/{id}/test`              — sends a `webhook.test` event immediately

Create body:
```json
{
  "url": "https://customer.example/wh",
  "events": ["email.bounced", "otp.verified"],
  "secret": null,                         // auto-generated if null
  "active": true,
  "retryPolicy": { "maxAttempts": 6, "backoffMs": [60000, 300000, 1800000, 7200000, 43200000, 86400000] }
}
```

### 5.2 Delivery log

- `GET /v1/webhooks/{id}/deliveries?status=&event=`
- `POST /v1/webhooks/{id}/deliveries/{deliveryId}/replay`

## 6. Payload signing

```
canonical = `${timestamp}.${rawBody}`
v1        = hex(hmac_sha256(secret, canonical))
header    = `t=${timestamp},v1=${v1}`
```

Consumers should:
1. Reject `timestamp` if `abs(now - timestamp) > 5 minutes`.
2. Recompute HMAC and constant-time-compare with `v1`.

## 7. Data Model

`prisma/schema/webhook.prisma`:

```prisma
model WebhookSubscription {
  id              String                 @id @default(cuid(2))
  projectId       String
  environmentId   String
  url             String
  events          Json                   // array of event names
  secret          String                 // raw secret; surface masked in API
  active          Boolean                @default(true)
  retryPolicy     Json
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt

  deliveries      WebhookDelivery[]

  @@index([projectId, environmentId])
  @@map("webhook_subscriptions")
}

model WebhookDelivery {
  id              String                 @id @default(cuid(2))
  subscriptionId  String
  subscription    WebhookSubscription    @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  eventId         String
  eventName       String
  payload         Json
  attempt         Int                    @default(1)
  status          WebhookDeliveryStatus  @default(PENDING)
  responseCode    Int?
  responseBody    String?                @db.Text
  latencyMs       Int?
  nextRetryAt     DateTime?
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt

  @@index([subscriptionId, createdAt])
  @@index([status, nextRetryAt])
  @@map("webhook_deliveries")
}

enum WebhookDeliveryStatus { PENDING SUCCEEDED FAILED EXHAUSTED }
```

## 8. Internal Event Bus

```
src/events/
  bus.ts           // publish(eventName, data, { projectId, environmentId, apiKeyId })
  catalog.ts       // event names + JSON Schemas (single source of truth)
  emitter.ts       // BullMQ producer for webhook delivery jobs
  worker.ts        // consumes deliveries, signs, POSTs, retries
```

- Channels call `bus.publish(...)`; the bus enqueues fan-out deliveries to each matching subscription.
- Workers retry per `retryPolicy.backoffMs`.

## 9. Non-Functional Requirements

- Delivery timeout: 10s per attempt.
- Retry on response codes `408, 425, 429, 500, 502, 503, 504` and on transport errors.
- Idempotency on the consumer side: each event has a stable `id` that survives retries — consumers should de-dupe by it.
- Replay can deliver a copy with a new attempt number but preserves the original `eventId`.

## 10. Acceptance Criteria

- [ ] A subscription receives only events it asked for.
- [ ] HMAC verification works in a sample Node consumer.
- [ ] Failed delivery is retried per the configured backoff, then marked EXHAUSTED.
- [ ] Replay reuses the original payload byte-for-byte.
- [ ] `POST /v1/webhooks/{id}/test` fires a `webhook.test` event within 1s.

## 11. Open Questions

- Should we support mTLS / client cert verification toward customer endpoints? **Phase 4**.
- Should event payloads include the full notification document or a slim version + link? **Slim + link** for size/PII reasons — consumers GET the full record by id if needed.

---

## 12. Implementation Prompt

```text
ROLE
You are a senior backend engineer building the outbound webhooks system.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- BullMQ on Redis (already required by Feature 08).
- Channels and the unified service emit lifecycle events; this feature owns the bus + delivery.

OBJECTIVE
Implement Feature 09: subscription CRUD, signed delivery, retries, log + replay.

INPUTS TO READ FIRST
1. docs/09-webhooks-and-events.md
2. docs/01..08 (event sources)
3. BullMQ docs (delayed jobs, exponential backoff, repeat options)
4. Stripe/Svix's webhook signature scheme for inspiration (we mirror Stripe's `t=,v1=` style)

CONSTRAINTS
- Signature: `t=<unixTs>,v1=<hexHmacSha256(secret, ts + "." + rawBody)>`.
- Body sent is exactly the JSON event document (no extra wrapping).
- Retry policy is read from the subscription row; if absent, use the default.
- Delivery worker is a separate process entry (`bun run worker:webhooks`) and shares the BullMQ Redis instance with Feature 08.
- Replay creates a new WebhookDelivery row but emits the same eventId.
- Test endpoint is rate-limited to 60/min per subscription to prevent self-DDoS.

DELIVERABLES
- prisma/schema/webhook.prisma
- src/events/{bus,catalog,emitter,worker}.ts
- src/api/v1/webhooks/route.ts                                        (GET list, POST create)
- src/api/v1/webhooks/[id]/route.ts                                   (GET, PATCH, DELETE)
- src/api/v1/webhooks/[id]/rotate-secret/route.ts                     (POST)
- src/api/v1/webhooks/[id]/test/route.ts                              (POST)
- src/api/v1/webhooks/[id]/deliveries/route.ts                        (GET)
- src/api/v1/webhooks/[id]/deliveries/[deliveryId]/replay/route.ts    (POST)

STEP PLAN
1. Schema + db:generate.
2. Catalog (event names + JSON Schemas in TS objects).
3. Bus + emitter; channel services call bus.publish(...).
4. Worker: fetch active subscriptions for the event, enqueue deliveries, sign, POST.
5. Subscription CRUD + log endpoints + replay.

DEFINITION OF DONE
- A test endpoint receives a signed `webhook.test` event; verifying with the published recipe passes.
- A 500 from the consumer triggers a retry per policy; eventual EXHAUSTED state is set.
- Replay POSTs the same body and signature recipe.
- `bun run check-types`, `bun run lint` pass.

OUT OF SCOPE
- Inbound webhooks.
- mTLS to customer endpoints.
- Wildcard event subscriptions.
```
