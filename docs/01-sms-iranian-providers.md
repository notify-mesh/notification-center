# Feature 01 — SMS via Iranian Providers

> **Status:** Draft · **Phase:** 1 (MVP) · **Depends on:** Feature 12 (API keys)

## 1. Summary

Expose a REST API for sending SMS through Iranian carriers, starting with **Kavenegar** (already wrapped in `src/providers/kavenegar.provider.ts`). Two send modes are supported:

- **Free-form SMS** — arbitrary `message` to one or many `receptor` numbers.
- **Pattern/Template SMS (Kavenegar VerifyLookup)** — pre-approved template with variable tokens, the only legal vehicle for OTPs and transactional messages on most Iranian carriers.

The interface is provider-agnostic: clients send to `POST /v1/sms`, the platform routes to the configured provider for the calling project+environment.

## 2. Problem & Motivation

Iranian regulation requires SMS senders to use line numbers tied to a registered business and, for transactional sends, **pre-approved templates**. Direct integration with Kavenegar requires understanding their callback-style SDK, status codes, and `VerifyLookup` semantics. Customers want a single typed endpoint that hides this.

## 3. Goals & Non-Goals

### Goals
- One endpoint covers both free-form and pattern sends.
- Provider selected per **(project, environment)** from stored credentials (Feature 14).
- Full delivery-status lifecycle: `queued → sent → delivered | failed | rejected`.
- Persist every send in a `SmsMessage` table for analytics and audit.
- Surface provider-native status codes in the response without leaking provider names.

### Non-Goals
- Two-way SMS / inbound webhooks from the carrier (Phase 4).
- Number portability or sender-ID management (manual via Kavenegar panel).
- Non-Iranian SMS providers (Twilio etc.) in this phase.

## 4. User Stories

- **As an Integrator**, I POST a phone number, a sender, and a message body and get a `messageId` back so I can correlate later.
- **As an Integrator sending OTPs**, I POST a `template` name and a `tokens` map and the platform sends the approved Kavenegar pattern.
- **As a Project Owner**, I see in the dashboard which sends failed and why.
- **As a Platform Admin**, I add a new SMS provider without breaking existing clients.

## 5. API Specification

### 5.1 `POST /v1/sms` — Free-form SMS

Headers
```
Authorization: Bearer <api_key>
Idempotency-Key: <client-generated-uuid>     (optional but recommended)
```

Request
```json
{
  "sender": "10004346",
  "receptor": ["09121234567"],
  "message": "سلام، رمز ورود شما ۱۲۳۴۵۶",
  "type": "transactional",
  "metadata": { "userId": "u_123" }
}
```

Response `202 Accepted`
```json
{
  "id": "sms_01HK...",
  "status": "queued",
  "channel": "sms",
  "provider": "kavenegar",
  "receptor": ["09121234567"],
  "messageIds": ["8920192"]
}
```

Errors
- `400 invalid_phone_number`
- `402 quota_exceeded`
- `403 origin_blocked` / `country_blocked` (enforced from `ApiKey` restriction columns)
- `502 provider_error` with `provider_status` echoed

### 5.2 `POST /v1/sms/pattern` — Pattern/VerifyLookup send

```json
{
  "receptor": "09121234567",
  "template": "welcome-otp",      // template name registered in Kavenegar
  "tokens": { "token": "123456" },// supports token, token2, token3, token10, token20 per Kavenegar
  "type": "sms"                    // "sms" | "call" | "voice"
}
```

### 5.3 `GET /v1/sms/{id}` — Status

Returns the latest persisted status. If older than the polling window and not in a terminal state, the platform issues `Status` to Kavenegar before responding.

### 5.4 `GET /v1/sms?from=&to=&status=&template=` — List

Cursor-paginated. Filterable by date, receptor, status, template, environment.

## 6. Data Model

Add to `prisma/schema/sms.prisma` (new file):

```prisma
model SmsMessage {
  id          String         @id @default(cuid(2))
  projectId   String
  environmentId String
  apiKeyId    String
  provider    String         // "kavenegar" | "ghasedak" | ...
  providerMessageId String?  // raw provider id
  sender      String
  receptor    String         // single recipient row per receptor (denormalized for analytics)
  body        String?        @db.Text
  templateName String?
  tokens      Json?
  status      SmsStatus      @default(QUEUED)
  providerStatusCode Int?
  providerStatusText String?
  cost        Int?           // IRR
  type        String?
  metadata    Json?          @default("{}")
  idempotencyKey String?
  sentAt      DateTime?
  deliveredAt DateTime?
  failedAt    DateTime?
  failureReason String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  @@unique([apiKeyId, idempotencyKey])
  @@index([projectId, environmentId, createdAt])
  @@index([status, createdAt])
  @@index([providerMessageId])
  @@map("sms_messages")
}

enum SmsStatus {
  QUEUED
  SENT
  DELIVERED
  FAILED
  REJECTED
}
```

## 7. Non-Functional Requirements

- **Idempotency**: `(apiKeyId, idempotencyKey)` is unique; replay returns the original record without re-sending to provider.
- **Per-key rate limit**: enforce `rateLimitPerSecond` and `minuteQuota/.../monthlyQuota` from the `ApiKey` row (see Feature 12). Use Redis token bucket.
- **Restrictions**: enforce `ipRestrictions`, `countryRestrictions`, `originRestrictions`, `allowedMethods`, `requireHttps`, `allowedUserAgents`, `blockedUserAgents` before calling provider.
- **Observability**: emit `sms.requested`, `sms.sent`, `sms.delivered`, `sms.failed` to the event bus consumed by Feature 09.
- **Privacy**: redact `body` and `tokens` from logs except for the last 4 chars; full record stays in DB.

## 8. Provider Strategy

```
src/notifications/sms/
  registry.ts                  // provider name → adapter
  kavenegar.adapter.ts         // wraps src/providers/kavenegar.provider.ts
  ghasedak.adapter.ts          // Phase 4
  types.ts                     // shared SmsAdapter interface
```

The `SmsAdapter` interface returns a `Promise<SmsAdapterResult>` and accepts the normalized request. The Kavenegar adapter wraps the existing callback-style `KavenegarApiService` in promises.

## 9. Acceptance Criteria

- [ ] Free-form SMS send returns `202` and persists a `SmsMessage` row in `< 300ms` p95 (provider latency excluded).
- [ ] Pattern send maps `tokens.{name}` to Kavenegar's `token`, `token2`, `token3`, `token10`, `token20` correctly.
- [ ] Replay with same `Idempotency-Key` returns the original `id`.
- [ ] Hitting any restriction returns the correct 4xx without calling the provider.
- [ ] Webhook `sms.failed` fires when `providerStatusCode` is in Kavenegar's failure set.
- [ ] OpenAPI spec includes both endpoints with example payloads in Farsi and English.

## 10. Open Questions

- Should `receptor` allow `+98` E.164 form transparently? (Lean **yes**, normalize on input.)
- Cost reporting in IRR vs. tomans? Store in IRR, convert on read.

---

## 11. Implementation Prompt

> Paste this into Claude Code (or a Claude-Agent SDK script) to implement the feature.

```text
ROLE
You are a senior backend engineer working on the Notification Center repo.

CONTEXT
- Stack is fixed: Next.js 16 App Router, Bun, Prisma v7 (multi-file schema under prisma/schema/),
  MariaDB via @prisma/adapter-mariadb, Redis via Bun's native RedisClient, Better Auth, Better Notify.
- Path alias: @root/* → ./src/*.
- An existing Kavenegar wrapper lives at src/providers/kavenegar.provider.ts (callback-based).
- API keys with quotas/restrictions already exist in prisma/schema/api-key.prisma.
- Auth happens via Bearer token resolved by Better Auth's bearer plugin (src/lib/auth.ts).
- The repo's AGENTS.md mandates reading node_modules/next/dist/docs/ for any Next.js API used; do that first.

OBJECTIVE
Implement the SMS channel REST API exactly as specified in docs/01-sms-iranian-providers.md:
- POST   /v1/sms          (free-form)
- POST   /v1/sms/pattern  (Kavenegar VerifyLookup pattern send)
- GET    /v1/sms/{id}     (status)
- GET    /v1/sms          (list, cursor pagination)

INPUTS TO READ FIRST (in this order — do not skip)
1. docs/01-sms-iranian-providers.md (this feature)
2. CLAUDE.md and AGENTS.md
3. src/lib/auth.ts, src/lib/prisma.ts, src/lib/redis.ts
4. src/providers/kavenegar.provider.ts
5. prisma/schema/api-key.prisma and prisma/schema/projects.prisma
6. The Next.js 16 route handler docs at node_modules/next/dist/docs/ (search for "route-handlers", "request", and "response")
7. Feature 12 (docs/12-admin-api-keys-and-limits.md) for how quotas are enforced
8. Feature 09 (docs/09-webhooks-and-events.md) for event emission contract

CONSTRAINTS
- Do NOT change the existing Kavenegar service file's public API. Wrap it in a new Promise-returning adapter.
- Use @root/* imports throughout. Match the Prettier config (100 cols, double quotes, semicolons, trailing commas).
- New route handlers MUST live under src/api/ following the convention of src/api/auth/[...all]/route.ts.
- Validate request bodies with zod. Place schemas next to the route handler.
- Enforce, in order: auth → API-key load → restrictions → rate limit → idempotency check → provider call → persist.
- Token bucket lives in Redis. Key pattern: rl:{apiKeyId}:{windowType}. Use INCR + EXPIRE.
- Never log raw OTP tokens or message bodies. Redact to last 4 chars in any log line.
- Provider names are an enum; introduce a `SmsAdapter` interface so adding providers later does not change the route layer.

DELIVERABLES
- prisma/schema/sms.prisma                   (new model + enum, run db:generate)
- src/notifications/sms/types.ts             (SmsAdapter interface, normalized DTOs)
- src/notifications/sms/registry.ts          (name → adapter map, picks adapter per project)
- src/notifications/sms/kavenegar.adapter.ts (Promise wrapper around KavenegarApiService)
- src/notifications/sms/service.ts           (orchestration: restrictions, idempotency, persist)
- src/api/v1/sms/route.ts                    (POST/GET handlers)
- src/api/v1/sms/pattern/route.ts            (POST handler)
- src/api/v1/sms/[id]/route.ts               (GET handler, refreshes from provider if stale)
- src/lib/api/rate-limit.ts                  (Redis token bucket, reusable across channels)
- src/lib/api/idempotency.ts                 (helper that resolves `(apiKeyId, key)` uniqueness)
- src/lib/api/auth-bearer.ts                 (resolves API key → project/environment/restrictions)

STEP PLAN
1. Define the Prisma model and regenerate the client. Confirm with `bun run check-types`.
2. Build the helpers in src/lib/api/* (rate-limit, idempotency, auth-bearer). Unit-testable pure functions where possible.
3. Build the SmsAdapter interface, then the Kavenegar adapter as a Promise wrapper.
4. Build the service layer: restrictions → rate-limit → idempotency → adapter.send → persist.
5. Implement the four route handlers. Reject anything not in `allowedMethods` early.
6. Wire event emission (placeholder no-op until Feature 09 ships).
7. Update the OpenAPI surface (Better Auth's openAPI() plugin is already enabled; add manual route metadata if needed).

DEFINITION OF DONE
- `bun run check-types`, `bun run lint`, `bun run format:check` all pass.
- A manual curl against POST /v1/sms with a seeded API key returns 202 and writes a SmsMessage row.
- A second curl with the same Idempotency-Key returns the same `id` and does NOT call Kavenegar a second time.
- Exceeding `minuteQuota` returns 429 with a `Retry-After` header.
- Restrictions (IP, country, origin) reject before any provider call.

OUT OF SCOPE
- Non-Kavenegar adapters.
- Bulk send (Feature 08).
- Templates UI (Feature 07).
- Async queueing — synchronous send is acceptable for MVP; design the service so a queue can wrap it later.
```
