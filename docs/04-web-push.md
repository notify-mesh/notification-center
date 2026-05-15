# Feature 04 — Web Push Channel

> **Status:** Draft · **Phase:** 2 · **Depends on:** Feature 12 (API keys), Feature 14 (Provider credentials for VAPID)

## 1. Summary

Browser Web Push (VAPID-based) so customer apps can deliver notifications to subscribed users even when their site isn't open. Built on `@betternotify/push`. Subscriptions are owned by the **end user** (identified via a customer-provided `externalUserId`); a single user can have many subscriptions (multiple browsers / devices).

## 2. Problem & Motivation

Push complements SMS/Email for engaged users and is free per-send (only VAPID compute on the platform). It also opens the door to in-app inbox features later.

## 3. Goals & Non-Goals

### Goals
- VAPID keypair per project (generated once, stored in `ProviderCredential`).
- Subscription registration endpoint that customer JS uses directly.
- `POST /v1/push` sends to one or many `externalUserId`s, fan-out across their subscriptions.
- TTL, urgency, topic (collapse key).
- Auto-prune subscriptions on permanent failure (HTTP 410 from push service).

### Non-Goals
- Native mobile push (APNs/FCM) — Phase 4.
- Action buttons orchestration beyond what the payload supports (UI is customer's responsibility).

## 4. User Stories

- **As an Integrator**, my web app POSTs the browser `PushSubscription` to `/v1/push/subscriptions` from the user's browser using the API key's public-readable subscription endpoint (or a server-signed token).
- **As an Integrator**, I send a push to a user by `externalUserId` without knowing how many devices they have.
- **As an End User**, I see a native browser notification land on Chrome / Firefox / Safari (where supported).

## 5. API Specification

### 5.1 Public key endpoint (anonymous)

`GET /v1/push/public-key?project=<slug>` → `{ "publicKey": "BNF..." }`

### 5.2 Subscribe

`POST /v1/push/subscriptions`

```json
{
  "externalUserId": "u_123",
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/...",
    "keys": { "p256dh": "...", "auth": "..." }
  },
  "deviceLabel": "Chrome on macOS",
  "locale": "fa-IR"
}
```

Returns `201 { id, externalUserId }`.

### 5.3 Send

`POST /v1/push`

```json
{
  "to": { "externalUserIds": ["u_123", "u_456"] },
  "payload": {
    "title": "سفارش شما ارسال شد",
    "body": "سفارش #1234 در راه است",
    "icon": "https://app.example/icon-192.png",
    "data": { "url": "/orders/1234" }
  },
  "options": {
    "ttl": 3600,
    "urgency": "high",
    "topic": "order-1234"
  }
}
```

Response `202`
```json
{
  "id": "push_01HK...",
  "fanout": 4,
  "subscriptions": { "ok": 3, "expired": 1, "failed": 0 }
}
```

### 5.4 Unsubscribe

`DELETE /v1/push/subscriptions/{id}`  (admin / server)
`POST /v1/push/subscriptions/unsubscribe` body `{ endpoint }`  (client-driven)

## 6. Data Model

`prisma/schema/push.prisma`:

```prisma
model PushSubscription {
  id              String   @id @default(cuid(2))
  projectId       String
  environmentId   String
  externalUserId  String
  endpoint        String   @db.Text
  p256dh          String
  auth            String
  deviceLabel     String?
  locale          String?
  expired         Boolean  @default(false)
  lastSendAt      DateTime?
  lastFailureCode Int?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([projectId, environmentId, endpoint])
  @@index([projectId, environmentId, externalUserId])
  @@map("push_subscriptions")
}

model PushMessage {
  id              String      @id @default(cuid(2))
  projectId       String
  environmentId   String
  apiKeyId        String
  payload         Json
  options         Json?
  fanout          Int         @default(0)
  okCount         Int         @default(0)
  expiredCount    Int         @default(0)
  failedCount     Int         @default(0)
  metadata        Json?       @default("{}")
  idempotencyKey  String?
  createdAt       DateTime    @default(now())

  @@unique([apiKeyId, idempotencyKey])
  @@index([projectId, environmentId, createdAt])
  @@map("push_messages")
}
```

## 7. Non-Functional Requirements

- **Concurrency**: fan-out across subscriptions in parallel with `Promise.allSettled`, cap concurrency at 50.
- **Permanent failure**: on HTTP 410 from the push service, mark `expired = true` and exclude from future sends.
- **Payload size**: max 4KB (Web Push spec); reject larger.
- **Public key**: never expose the **private** VAPID key; only the public encoded with URL-safe base64.

## 8. Adapter

```
src/notifications/push/
  vapid.ts                 // load/encode keys
  push.adapter.ts          // @betternotify/push wrapper
  service.ts
```

## 9. Acceptance Criteria

- [ ] A browser using the public key + subscribe endpoint can register and receive a push within 60s.
- [ ] 410 responses prune subscriptions automatically.
- [ ] Sending to a user with 0 subscriptions returns 202 with `fanout: 0` (not an error).
- [ ] Idempotency holds across re-tries.

## 10. Open Questions

- Should the subscription endpoint require an API key? **Yes** — write-scoped key only; do not allow anonymous subscribes.
- Do we encrypt the `auth` secret at rest? **Yes** — reuse AEAD helper from Feature 02.

---

## 11. Implementation Prompt

```text
ROLE
You are a senior backend engineer adding the Web Push channel.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- @betternotify/push provides the VAPID push send. Read its README under node_modules first.
- VAPID keys are stored in ProviderCredential (Feature 14) per project; if absent, the platform generates and persists on first GET /v1/push/public-key.
- Pattern to mirror: src/notifications/email/* and src/notifications/sms/*.

OBJECTIVE
Implement Feature 04 endpoints (public key, subscribe, send, unsubscribe) and the subscription pruning behavior.

INPUTS TO READ FIRST
1. docs/04-web-push.md
2. docs/01-sms-iranian-providers.md (channel pipeline pattern)
3. @betternotify/push README
4. Next.js 16 route handler docs

CONSTRAINTS
- Encrypt `auth` (and optionally `p256dh`) at rest using the AEAD helper from src/lib/crypto/aead.ts (introduced in Feature 02).
- Concurrency-cap fan-out at 50 with a simple semaphore.
- On 410 response: set expired=true and continue; do not fail the whole batch.
- The public-key endpoint is unauthenticated but rate-limited per IP (100/min).
- Subscription endpoint requires a write-scoped API key (canWrite=true).

DELIVERABLES
- prisma/schema/push.prisma
- src/notifications/push/{vapid,push.adapter,service}.ts
- src/api/v1/push/public-key/route.ts
- src/api/v1/push/subscriptions/route.ts                  (POST)
- src/api/v1/push/subscriptions/[id]/route.ts             (DELETE)
- src/api/v1/push/subscriptions/unsubscribe/route.ts      (POST, by endpoint)
- src/api/v1/push/route.ts                                (POST send)

STEP PLAN
1. Schema + db:generate.
2. VAPID key load/create utility, persisted via ProviderCredential.
3. Adapter & service.
4. Routes.
5. Pruning behavior tested by mocking a 410 response.

DEFINITION OF DONE
- End-to-end manual test: register browser → POST /v1/push → notification visible.
- 410 path prunes the subscription.
- `bun run check-types`, `bun run lint` clean.

OUT OF SCOPE
- Native mobile push.
- In-app inbox feed.
- Topic-based broadcast (only externalUserId targeting in this phase).
```
