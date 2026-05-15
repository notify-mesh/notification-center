# Feature 02 — Bale Messenger Channel

> **Status:** Draft · **Phase:** 2 · **Depends on:** Feature 06 (Unified API), Feature 14 (Provider credentials)
> **See also:** `docs/bale-messenger-otp.md` for raw Bale Bot API reference.

## 1. Summary

Bale Messenger is an Iranian messaging app whose Bot API is largely Telegram-compatible. Customers can either send a **free-form message** to a chat (by Bale user ID or phone-number-linked user) or request an **OTP** through Bale's native OTP endpoint (no template approval needed, deliverability is high for users who have the Bale app).

This feature exposes Bale as a first-class channel alongside SMS and Email.

## 2. Problem & Motivation

Bale OTP delivery is **cheaper than SMS** and **does not require template pre-approval**, but only ~30–50% of Iranian users have Bale installed. The platform needs a way to attempt Bale-first and fall back to SMS on `user_not_found` — this is the killer feature for cost-sensitive OTP-heavy products (auth flows, e-commerce, fintech).

## 3. Goals & Non-Goals

### Goals
- `POST /v1/bale/messages` — send a text or media message.
- `POST /v1/bale/otp` — send an OTP via Bale's `sendOtp` endpoint.
- Channel-fallback hint: if Bale returns `user_not_found`, mark the record so the unified API can fall back to SMS.
- Persist every send for analytics.
- Per-project Bale bot token (encrypted at rest, Feature 14).

### Non-Goals
- Receiving inbound Bale messages or webhooks from Bale's bot API (Phase 4).
- Bot conversation flows / inline keyboards (Phase 4).
- Bale group/channel broadcast.

## 4. User Stories

- **As an Integrator**, I send an OTP via Bale; if it fails because the user doesn't have Bale, I rely on the platform to fall back to SMS automatically (via `POST /v1/notifications`).
- **As a Project Owner**, I configure a Bale bot token per environment; staging and production never share tokens.
- **As an End User**, I receive Iranian-Farsi OTPs in the Bale app instead of as an SMS, faster and free.

## 5. API Specification

### 5.1 `POST /v1/bale/messages`

```json
{
  "to": { "phone": "+989121234567" },   // or { "userId": 12345 } or { "chatId": "..." }
  "text": "سلام! کد ورود شما: 123456",
  "parseMode": "MarkdownV2",            // optional
  "metadata": { "userId": "u_123" }
}
```

Response `202`
```json
{
  "id": "bale_01HK...",
  "channel": "bale",
  "status": "sent",
  "provider": "bale",
  "providerMessageId": 4827
}
```

### 5.2 `POST /v1/bale/otp`

```json
{
  "to": { "phone": "+989121234567" },
  "code": "123456",
  "ttlSeconds": 120,
  "type": "login"                   // free-form label, surfaced in analytics
}
```

Response `202`
```json
{
  "id": "bale_otp_01HK...",
  "status": "sent",
  "fallbackEligible": false        // becomes true if Bale rejects with user_not_found
}
```

Notable errors
- `404 bale_user_not_found` — the recipient does not have Bale.
- `429 bale_rate_limited` — Bale's bot API rate limit hit.
- `403 bale_bot_blocked` — user has blocked the bot.

### 5.3 `GET /v1/bale/{id}` — status

## 6. Data Model

Add `prisma/schema/bale.prisma`:

```prisma
model BaleMessage {
  id                String      @id @default(cuid(2))
  projectId         String
  environmentId     String
  apiKeyId          String
  kind              BaleKind
  toPhone           String?
  toUserId          BigInt?
  toChatId          String?
  text              String?     @db.Text
  parseMode         String?
  otpCode           String?     // encrypted at rest
  otpType           String?
  status            BaleStatus  @default(QUEUED)
  providerMessageId BigInt?
  providerErrorCode String?
  fallbackEligible  Boolean     @default(false)
  metadata          Json?       @default("{}")
  idempotencyKey    String?
  sentAt            DateTime?
  failedAt          DateTime?
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  @@unique([apiKeyId, idempotencyKey])
  @@index([projectId, environmentId, createdAt])
  @@map("bale_messages")
}

enum BaleKind { MESSAGE OTP }
enum BaleStatus { QUEUED SENT DELIVERED FAILED }
```

## 7. Non-Functional Requirements

- **Token storage**: Bale bot tokens are stored in the `ProviderCredential` table (Feature 14), encrypted with envelope encryption (AES-256-GCM, KEK from `BETTER_AUTH_SECRET`-derived KMS).
- **OTP code at rest**: encrypted; cleared after `ttlSeconds` by a background sweep job.
- **Rate limit**: respect Bale bot API limit (30 msgs/sec per bot, 20/min per user) — track in Redis under `bale:rl:{botId}` and `bale:rl:{botId}:{userId}`.
- **Idempotency**: same as SMS — `(apiKeyId, idempotencyKey)`.

## 8. Provider Adapter

```
src/notifications/bale/
  types.ts
  bale.adapter.ts          // wraps the Bale Bot API (HTTPS calls to https://tapi.bale.ai/bot<token>/...)
  service.ts               // orchestration
```

Use `fetch` (Bun's native) — no SDK exists. Use Zod to parse Bale's response shapes.

## 9. Acceptance Criteria

- [ ] Sending to a Bale phone returns 202 within p95 800ms.
- [ ] Sending to a phone not on Bale returns `404 bale_user_not_found` and `fallbackEligible: true`.
- [ ] Bot token rotates per environment without redeploy.
- [ ] OTP codes never appear in logs or in `GET /v1/bale/{id}` responses (only metadata).
- [ ] Bale's `chat_id` is captured on first successful message for caching (avoids repeated phone→chat resolution).

## 10. Open Questions

- Should we resolve `phone → chat_id` proactively on first contact and cache (Redis, 30-day TTL)? **Recommended yes** — saves a round-trip per send.
- How do we surface the user's preferred channel? Out of scope for this doc; covered in Feature 06's channel-routing rules.

---

## 11. Implementation Prompt

```text
ROLE
You are a senior backend engineer adding Bale Messenger as a notification channel.

CONTEXT
- Stack/conventions per CLAUDE.md and AGENTS.md (Next.js 16, Bun, Prisma v7, MariaDB, Redis-Bun-client, Better Auth).
- Bale Bot API base URL: https://tapi.bale.ai/bot<TOKEN>/<method>. It is Telegram-Bot-API-compatible for sendMessage; Bale also exposes a dedicated `sendOtp` method.
- The legacy reference and curl examples live in docs/bale-messenger-otp.md — READ IT in full first.
- Existing channel pattern to mirror: src/notifications/sms/* (Feature 01).

OBJECTIVE
Implement the Bale channel per docs/02-bale-messenger.md:
- POST /v1/bale/messages
- POST /v1/bale/otp
- GET  /v1/bale/{id}

INPUTS TO READ FIRST
1. docs/02-bale-messenger.md (this feature)
2. docs/bale-messenger-otp.md (raw API reference)
3. docs/01-sms-iranian-providers.md  (mirror its service shape)
4. docs/14-admin-provider-credentials.md (how to retrieve the bot token)
5. src/lib/api/* (helpers from Feature 01)
6. Next.js 16 docs in node_modules/next/dist/docs/ for route handlers and streaming responses

CONSTRAINTS
- No external Bale SDK; use Bun-native fetch.
- Validate Bale responses with zod — Bale occasionally returns 200 with `{ok:false}`; treat as error.
- Encrypt `otpCode` in BaleMessage at write time. Provide a sealed-box utility under src/lib/crypto/ (AES-256-GCM, KEK derived via HKDF from BETTER_AUTH_SECRET).
- Apply the same auth → restrictions → rate-limit → idempotency pipeline as Feature 01. Reuse the helpers; do not fork them.
- Bale rate-limit windows live alongside ApiKey rate-limits in Redis but under a separate keyspace (`bale:rl:*`) so they don't collide.
- Phone-to-chat resolution must be cached in Redis with prefix `bale:chat:{botId}:{phoneE164}` and 30-day TTL.

DELIVERABLES
- prisma/schema/bale.prisma (model + enums)
- src/lib/crypto/aead.ts (encrypt/decrypt helpers)
- src/notifications/bale/types.ts
- src/notifications/bale/bale.adapter.ts (sendMessage, sendOtp, getChatByPhone)
- src/notifications/bale/service.ts
- src/api/v1/bale/messages/route.ts
- src/api/v1/bale/otp/route.ts
- src/api/v1/bale/[id]/route.ts

STEP PLAN
1. Schema + db:generate.
2. AEAD helper (HKDF → AES-GCM). Round-trip test via a one-off script.
3. Bale adapter: implement `sendMessage`, `sendOtp`, `getChatByPhone`. Treat `{ok:false}` and HTTP non-2xx uniformly.
4. Service layer mirroring SMS service.
5. Route handlers.
6. Emit events (`bale.sent`, `bale.failed`, `bale.user_not_found`) via the Feature-09 event bus stub.

DEFINITION OF DONE
- All three endpoints respond with the documented shapes.
- A send to a non-Bale phone returns 404 with `fallbackEligible: true`.
- Otp codes are unreadable in DB without the AEAD key.
- `bun run check-types` and `bun run lint` are green.
- A short README block at the top of src/notifications/bale/service.ts explains the phone→chat caching strategy.

OUT OF SCOPE
- Channel fallback orchestration (Feature 06).
- Inbound webhooks from Bale.
- Inline keyboards / media uploads.
```
