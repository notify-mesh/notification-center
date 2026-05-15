# Feature 06 — Unified Notification API

> **Status:** Draft · **Phase:** 1 (MVP) · **Depends on:** at least one channel (Feature 01 or 03)

## 1. Summary

`POST /v1/notifications` — one endpoint, many channels. The body picks the channel, or asks the platform to **route** based on user preference, channel availability, or a defined **fallback chain**. Idempotency, restrictions, and per-key quotas are enforced uniformly.

Channel-specific endpoints (`/v1/sms`, `/v1/emails`, `/v1/bale/*`, `/v1/push`) remain available for power users; the unified endpoint is the recommended default.

## 2. Problem & Motivation

Customers shouldn't have to know which channel is configured for which project; they should send "notify user X" and let the platform pick. This is the headline DX win and the foundation for cost optimization (Bale → SMS fallback halves OTP costs).

## 3. Goals & Non-Goals

### Goals
- A single endpoint covering SMS / Bale / Email / Web Push.
- Routing modes:
  - **explicit**: client specifies `channel: "sms"`.
  - **fallback**: client provides `channels: ["bale", "sms"]` and the platform tries in order.
  - **preferred**: client provides `externalUserId`; platform looks up that user's preferred channel from `RecipientPreference` (if set) and falls back to project defaults.
- Idempotency, restrictions, quotas applied **once** at the unified layer — channels are dumb pipes.
- Returns a consolidated record id (`ntf_...`) that aggregates per-channel attempts.

### Non-Goals
- Channel-specific advanced options (e.g. Bale `parseMode`) are reachable but not advertised here — the unified body has a `channelOverrides` escape hatch.

## 4. User Stories

- **As an Integrator**, I send `{ to: "+989121234567", template: "login-otp", channels: ["bale","sms"] }` and get one response.
- **As a Project Owner**, I configure default channel order per project once; clients don't have to think about it.
- **As an Integrator**, I get the per-attempt breakdown so I can log "Bale tried, SMS used" without parsing channel-specific shapes.

## 5. API Specification

### 5.1 `POST /v1/notifications`

```json
{
  "to": {
    "phone": "+989121234567",
    "email": "u@example.com",
    "externalUserId": "u_123"
  },
  "channels": ["bale", "sms"],           // optional; defaults to project default
  "template": "login-otp",
  "variables": { "code": "123456" },
  "locale": "fa-IR",
  "channelOverrides": {
    "sms": { "sender": "10004346" },
    "email": { "from": "no-reply@app.example" }
  },
  "metadata": { "userId": "u_123" }
}
```

Response `202`
```json
{
  "id": "ntf_01HK...",
  "status": "sent",
  "channelUsed": "bale",
  "attempts": [
    { "channel": "bale", "status": "sent", "id": "bale_..." }
  ]
}
```

If Bale fails and SMS succeeds:
```json
{
  "id": "ntf_01HK...",
  "status": "sent",
  "channelUsed": "sms",
  "attempts": [
    { "channel": "bale", "status": "failed", "reason": "user_not_found", "id": "bale_..." },
    { "channel": "sms",  "status": "sent",   "id": "sms_..." }
  ]
}
```

If all fail:
```json
{ "id": "ntf_01HK...", "status": "failed", "attempts": [ ... ] }
```

### 5.2 `GET /v1/notifications/{id}` — aggregate status across attempts

### 5.3 Recipient preference (optional)

`PUT /v1/recipients/{externalUserId}/preference`
```json
{ "channels": ["bale", "email"] }
```

`GET /v1/recipients/{externalUserId}` → preference and last-known channel addresses (phone, email, push subscription count).

## 6. Data Model

`prisma/schema/notification.prisma`:

```prisma
model Notification {
  id              String              @id @default(cuid(2))
  projectId       String
  environmentId   String
  apiKeyId        String
  templateName    String?
  locale          String?
  variables       Json?
  toPhone         String?
  toEmail         String?
  externalUserId  String?
  channelsRequested Json              // ["bale","sms"]
  channelUsed     String?
  status          NotificationStatus  @default(QUEUED)
  attempts        NotificationAttempt[]
  metadata        Json?               @default("{}")
  idempotencyKey  String?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([apiKeyId, idempotencyKey])
  @@index([projectId, environmentId, createdAt])
  @@index([externalUserId])
  @@map("notifications")
}

model NotificationAttempt {
  id                 String       @id @default(cuid(2))
  notificationId     String
  notification       Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  channel            String
  channelRecordId    String?      // e.g. sms_..., email_..., bale_...
  status             String
  reason             String?
  startedAt          DateTime     @default(now())
  finishedAt         DateTime?

  @@index([notificationId])
  @@map("notification_attempts")
}

enum NotificationStatus { QUEUED SENT FAILED }

model RecipientPreference {
  id              String   @id @default(cuid(2))
  projectId       String
  externalUserId  String
  channels        Json     // ordered array of channel strings
  updatedAt       DateTime @updatedAt

  @@unique([projectId, externalUserId])
  @@map("recipient_preferences")
}
```

## 7. Routing Logic

```
1. Resolve "channels":
     a. If body.channels present → use it.
     b. Else if externalUserId present and RecipientPreference exists → use it.
     c. Else use ProjectEnvironment.settings.defaultChannels (Feature 11).
     d. Else error 400 no_channel_resolvable.
2. For each channel in order:
     - If channel disabled for project → skip with reason "channel_disabled".
     - If recipient lacks the address for that channel (e.g. push with 0 subscriptions) → skip with reason "no_address".
     - Call channel service; on success → break.
     - On retryable failure → continue.
3. Persist Notification + NotificationAttempt rows transactionally.
```

## 8. Non-Functional Requirements

- One Idempotency-Key check (the unified record), not per-channel. Channel-level idempotency continues to work as a defense in depth.
- Latency target: p95 ≤ 500ms when first channel succeeds; ≤ 1.5s when one fallback is invoked.
- Webhook `notification.completed` emits once with the final aggregate.

## 9. Acceptance Criteria

- [ ] Explicit single-channel send matches behavior of the underlying channel endpoint.
- [ ] Fallback from Bale → SMS persists both attempts and reports `channelUsed: "sms"`.
- [ ] Recipient preference, when set, overrides the project default but is overridden by an explicit `channels` body.
- [ ] All-fail produces `status: failed` with full attempt history.
- [ ] Replay with same Idempotency-Key returns the original `ntf_` id.

## 10. Open Questions

- Do we send through SMS again if SMS is the **second** entry in a fallback chain and the first attempt was also SMS for a different provider? **Not in this phase** — channels list is unique per request.
- Concurrent fan-out across all channels (multi-channel-blast)? **Out of scope** here; user can call channel endpoints in parallel themselves.

---

## 11. Implementation Prompt

```text
ROLE
You are a senior backend engineer wiring the unified notification orchestration layer.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Channel services exist (or will exist) at src/notifications/{sms,bale,email,push}/service.ts. They expose a `send(normalizedInput): Promise<ChannelResult>` shape.
- Shared helpers (auth-bearer, rate-limit, idempotency, restrictions) live under src/lib/api/.

OBJECTIVE
Implement Feature 06: POST/GET /v1/notifications, the recipient-preference endpoints, and the routing logic.

INPUTS TO READ FIRST
1. docs/06-unified-notification-api.md (this feature)
2. docs/01-sms-iranian-providers.md, 02, 03, 04 (channel service contracts)
3. docs/05-unified-otp-service.md (similar router logic; reuse style)
4. docs/11-admin-projects-and-environments.md (where defaultChannels lives)
5. Next.js 16 route handler docs

CONSTRAINTS
- The unified service must not call provider SDKs directly. It MUST go through channel services.
- Idempotency lives at the unified layer (`Notification.idempotencyKey`). Channel layer still has its own idempotency for safety; you may pass the same key through with a `unified:` prefix.
- Persisting Notification + Attempts is one Prisma transaction.
- The routing decision (resolved channels list) is captured in `Notification.channelsRequested`.
- An attempt's `channelRecordId` is the id of the row in the channel's own table (e.g. sms_messages.id).

DELIVERABLES
- prisma/schema/notification.prisma (Notification, NotificationAttempt, RecipientPreference + enum)
- src/notifications/unified/router.ts          (resolve channels list)
- src/notifications/unified/service.ts         (orchestrate attempts, persist, emit event)
- src/api/v1/notifications/route.ts            (POST)
- src/api/v1/notifications/[id]/route.ts       (GET aggregate)
- src/api/v1/recipients/[externalUserId]/route.ts        (GET)
- src/api/v1/recipients/[externalUserId]/preference/route.ts (PUT)

STEP PLAN
1. Schema + db:generate.
2. Router: implement resolution algorithm (explicit → preference → project default).
3. Service: loop attempts, persist transactionally.
4. Routes + zod.
5. Emit `notification.completed` via the Feature-09 event bus stub.

DEFINITION OF DONE
- Mixed-channel fallback test passes (mock Bale → user_not_found, real SMS).
- Idempotency works at the unified layer.
- Recipient preference path returns the right channelUsed.
- `bun run check-types` and lint pass.

OUT OF SCOPE
- Multi-channel blast (fan-out to all channels in parallel).
- Cost-aware routing (Phase 4).
- A/B testing.
```
