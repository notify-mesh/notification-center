# Feature 05 — Unified OTP Service

> **Status:** Draft · **Phase:** 1 (MVP) · **Depends on:** Feature 01 (SMS), Feature 03 (Email), optional Feature 02 (Bale)

## 1. Summary

A channel-agnostic OTP service: generate → send → verify, with rate-limiting, cooldowns, retries, and TTL — all backed by Redis (matching `secondaryStorage` already wired into Better Auth at `src/lib/auth.ts`). Customers don't store or compare codes; they just call `POST /v1/otp/start` and `POST /v1/otp/verify`.

## 2. Problem & Motivation

OTP is the highest-volume use case for Iranian apps. Customers re-implement code generation, comparison, attempt counters, cooldowns, and resend logic over and over — most ship insecure or buggy versions. We want a primitive that is **boringly correct** by default.

## 3. Goals & Non-Goals

### Goals
- `POST /v1/otp/start` accepts `{ identifier, channel, length?, ttl? }`, generates a code, sends it, returns an opaque `otpId`.
- `POST /v1/otp/verify` accepts `{ otpId, code }` and returns `{ verified: true/false, attemptsRemaining }`.
- `POST /v1/otp/resend` with cooldown enforcement.
- Channel can be `sms`, `bale`, `email`, or `auto` (try Bale, fall back to SMS).
- Configurable length (4–8 digits), TTL (default 120s), max attempts (default 3), cooldown (default 60s).
- All state in Redis; no DB row written on `start` (only on `verify` for audit, optionally).

### Non-Goals
- TOTP / authenticator app — already handled by Better Auth's `twoFactor` plugin.
- Magic links — Phase 3.

## 4. User Stories

- **As an Integrator**, I issue an OTP without managing storage or expiry.
- **As an Integrator**, I let the platform pick the channel based on user availability (`channel: "auto"`).
- **As an End User**, I get exactly 3 tries; an extra attempt fails fast instead of letting me brute force.

## 5. API Specification

### 5.1 Start

`POST /v1/otp/start`

```json
{
  "identifier": "+989121234567",       // phone or email; auto-detect
  "channel": "auto",                   // sms | bale | email | auto
  "length": 6,                          // optional
  "ttlSeconds": 120,                    // optional
  "maxAttempts": 3,                     // optional
  "purpose": "login",                   // free-form, for analytics
  "template": "default-otp-fa",         // optional, channel-specific
  "metadata": { "userId": "u_123" }
}
```

Response `202`
```json
{
  "otpId": "otp_01HK...",
  "channel": "bale",                   // resolved channel
  "expiresAt": "2026-05-15T15:21:42Z",
  "cooldownSeconds": 60,
  "fallbackUsed": false
}
```

### 5.2 Verify

`POST /v1/otp/verify`

```json
{ "otpId": "otp_01HK...", "code": "123456" }
```

Response on success `200`
```json
{ "verified": true, "identifier": "+989121234567", "purpose": "login" }
```

Response on bad code `400`
```json
{ "verified": false, "attemptsRemaining": 2, "reason": "invalid_code" }
```

Other reasons: `expired`, `attempts_exhausted`, `not_found`.

### 5.3 Resend

`POST /v1/otp/resend` body `{ otpId }` — succeeds only if `now - lastSentAt >= cooldownSeconds`.

## 6. Redis Layout

```
otp:{otpId}                 hash    { codeHash, channel, identifier, attempts, maxAttempts, expiresAt, cooldownUntil, purpose, projectId, environmentId, apiKeyId, metadata }
otp:by-identifier:{projectId}:{identifierHash}   key holding otpId   (for resend-by-identifier later; TTL = ttlSeconds)
```

- `codeHash` is a constant-time-comparable HMAC-SHA256 of the code with a per-project pepper.
- Plain code is never stored. The provider call receives the plain code in-process only.

## 7. Channel Selection ("auto")

1. Detect identifier kind (phone vs. email). For email → email only.
2. For phone:
   - If Bale is enabled for the project and the phone resolves to a Bale chat (cached lookup from Feature 02), use Bale.
   - Otherwise use SMS.
3. On Bale `user_not_found`, fall back to SMS in the same request (record `fallbackUsed: true`).

## 8. Non-Functional Requirements

- **Brute-force protection**: max 3 attempts hard; after exhaustion, the otpId is invalid.
- **Per-identifier limits**: max 5 OTPs / hour / identifier / project, enforced via Redis.
- **Time skew**: TTL stored as absolute epoch ms; tolerate up to 60s of skew on `verify`.
- **PII**: `identifier` is hashed (SHA-256 with project pepper) for any analytic rollup.
- **Audit**: optionally write to `OtpAudit` table on verify (success or final-failure).

## 9. Data Model (audit-only)

`prisma/schema/otp.prisma`:

```prisma
model OtpAudit {
  id              String     @id @default(cuid(2))
  projectId       String
  environmentId   String
  apiKeyId        String
  channel         String
  identifierHash  String     // sha256(identifier || projectPepper)
  purpose         String?
  outcome         OtpOutcome
  attemptsUsed    Int
  fallbackUsed    Boolean    @default(false)
  metadata        Json?      @default("{}")
  createdAt       DateTime   @default(now())

  @@index([projectId, environmentId, createdAt])
  @@index([identifierHash])
  @@map("otp_audits")
}

enum OtpOutcome { VERIFIED EXPIRED ATTEMPTS_EXHAUSTED ABANDONED }
```

## 10. Acceptance Criteria

- [ ] Start returns `otpId` and triggers a real send via the chosen channel.
- [ ] Verify with correct code returns `verified: true` once; a second verify on the same otpId is rejected.
- [ ] Three wrong attempts permanently invalidate the otpId.
- [ ] Resend before cooldown returns `429 cooldown_active` with `retryAfterSeconds`.
- [ ] Channel `auto` falls back from Bale → SMS without an extra round-trip from the client.
- [ ] OtpAudit row is written exactly once per otpId on terminal outcome.

## 11. Open Questions

- Should we expose `identifier` in the verify response? **Yes for success**, **no for failure** (avoids enumeration).
- Should we keep a "resend counter" inside the same otpId or treat resend as a fresh OTP? **Fresh OTP** keeps reasoning simpler; old code becomes invalid.

---

## 12. Implementation Prompt

```text
ROLE
You are a senior backend engineer building a multi-channel OTP primitive.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Redis is wired via Bun's native client at src/lib/redis.ts and already serves as Better Auth's secondaryStorage.
- SMS sending is provided by Feature 01 services (src/notifications/sms/service.ts).
- Email and Bale services may or may not exist yet. If a requested channel is unavailable, return 503 channel_unavailable.

OBJECTIVE
Implement Feature 05 endpoints: POST /v1/otp/start, /v1/otp/verify, /v1/otp/resend.

INPUTS TO READ FIRST
1. docs/05-unified-otp-service.md
2. docs/01-sms-iranian-providers.md (sender pipeline)
3. docs/02-bale-messenger.md (for "auto" fallback semantics)
4. src/lib/redis.ts
5. Better Auth's twoFactor plugin docs (just for vocabulary; we are NOT touching auth's own OTPs)
6. Next.js 16 route handler docs

CONSTRAINTS
- Do not persist plain OTP codes anywhere. Store only HMAC-SHA256(code, projectPepper) in Redis.
- Compare codes with timingSafeEqual.
- Generate codes with crypto.randomInt — never Math.random.
- Use a single Redis MULTI for verify (read attempts, compare, decrement / delete) to avoid races.
- Default TTL 120s; default maxAttempts 3; default cooldown 60s; default length 6.
- Per-identifier hourly cap of 5 OTPs per project (Redis INCR with EXPIRE 3600).
- Auth pipeline (API key load, restrictions, rate-limit, idempotency) reuses helpers from Feature 01.

DELIVERABLES
- prisma/schema/otp.prisma (OtpAudit model + enum)
- src/notifications/otp/codes.ts                  (generation + hashing utilities)
- src/notifications/otp/store.ts                  (Redis layout helpers)
- src/notifications/otp/router.ts                 (channel selection + fallback)
- src/notifications/otp/service.ts                (start / verify / resend)
- src/api/v1/otp/start/route.ts
- src/api/v1/otp/verify/route.ts
- src/api/v1/otp/resend/route.ts

STEP PLAN
1. Schema + db:generate (audit only).
2. codes.ts (randomInt, HMAC, timing-safe compare).
3. store.ts (Redis keys + MULTI for verify).
4. router.ts (sms/bale/email/auto selection; uses Feature 02's phone→chat cache if available).
5. service.ts orchestration.
6. Route handlers. Validate with zod.
7. Write OtpAudit on terminal outcome only.

DEFINITION OF DONE
- A start → wrong code × 3 → verify returns `attempts_exhausted`.
- A start → correct code on first try → verify returns `verified: true`; second verify returns `not_found`.
- Cooldown enforced on resend.
- Channel "auto" with a non-Bale phone uses SMS without client retry.
- `bun run check-types` and `bun run lint` are clean.

OUT OF SCOPE
- TOTP / authenticator apps.
- Magic links.
- WhatsApp.
```
