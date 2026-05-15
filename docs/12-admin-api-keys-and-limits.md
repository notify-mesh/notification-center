# Feature 12 — Admin Panel: API Keys, Limits & Quotas

> **Status:** Draft · **Phase:** 1 (MVP — minimal screens) → Phase 2 (full features) · **Depends on:** Feature 11

## 1. Summary

CRUD and observability for `ApiKey` rows (already modeled in `prisma/schema/api-key.prisma` with extensive quota, restriction, and analytics columns). The schema is **rich** — this feature is mainly UI + server logic to expose it correctly, plus the **Redis-backed enforcement** path that channel services use.

## 2. Problem & Motivation

API keys are the unit of trust. Customers need to:
- Generate, label, rotate, revoke keys.
- Configure rate limits, quotas, IP/country/origin/user-agent restrictions.
- See live usage and lifetime metrics.
- Receive alerts on quota or security thresholds.

Operators need to revoke or freeze keys quickly during incidents.

## 3. Goals & Non-Goals

### Goals
- Create / list / view / regenerate / revoke API keys per `(project, environment)`.
- Edit: name, description, tags, expiresAt, scopes, canRead/canWrite, all restriction lists, all quotas, rate limit, alert thresholds.
- Live usage view: per-minute/hour/day/month counters from the schema, refreshed every 10s.
- Lifetime metrics: totalCalls, successfulCalls, failedCalls, p95/p99 latency, securityViolations.
- Reset quota counters manually (Platform Admin only).
- Emit `apiKey.quota_exceeded` and `apiKey.security_violation` events to webhooks (Feature 09).
- Test playground: send a sample request with the key from the dashboard.

### Non-Goals
- Per-endpoint scoping beyond the existing `scopes` JSON (Phase 4).
- OAuth client management (Phase 4 if needed).

## 4. User Stories

- **As a Project Owner**, I rotate a leaked key without downtime: new key is created, old key continues to work for 24 hours with a "deprecated" badge, then auto-revokes.
- **As a Project Owner**, I set `minuteQuota=100` and see live the counter approach the limit.
- **As a Platform Admin**, I revoke a key from any project during an incident, instantly.
- **As an Integrator**, I copy a curl snippet for the unified API with my key prefilled.

## 5. UI Screens

```
/admin/projects/[slug]/environments/[env]/api-keys           (list + bulk revoke)
/admin/projects/[slug]/environments/[env]/api-keys/new       (wizard)
/admin/projects/[slug]/environments/[env]/api-keys/[id]      (overview)
  ├─ Overview          (status, last-used, usage charts)
  ├─ Limits            (rate + quotas + restrictions editor)
  ├─ Security          (IP/country/origin/UA + httpsOnly + methods)
  ├─ Alerts            (alertThresholds + webhookUrl/events)
  ├─ Activity          (recent sends, failures)
  ├─ Playground        (curl + JSON tabs, send a test request)
  └─ Danger zone       (regenerate, revoke, delete)
```

## 6. API Specification

- `GET    /admin/api/projects/{slug}/environments/{env}/api-keys`
- `POST   /admin/api/projects/{slug}/environments/{env}/api-keys`           (returns the **plaintext** key once)
- `GET    /admin/api/projects/{slug}/environments/{env}/api-keys/{id}`
- `PATCH  /admin/api/projects/{slug}/environments/{env}/api-keys/{id}`
- `POST   /admin/api/.../api-keys/{id}/rotate`                              (creates a new key; old key marked deprecated, optional `gracePeriodHours` default 24)
- `POST   /admin/api/.../api-keys/{id}/revoke`                              (immediate)
- `POST   /admin/api/.../api-keys/{id}/reset-counters`                      (Platform Admin only)
- `GET    /admin/api/.../api-keys/{id}/usage?bucket=minute|hour|day&range=` (time-series)
- `POST   /admin/api/.../api-keys/{id}/test`                                (server-side test send)

## 7. Enforcement Pipeline (shared with Features 01–06)

In `src/lib/api/`:

```
auth-bearer.ts       — resolves token → ApiKey row → returns a frozen context object
restrictions.ts      — checks IP, country (via ipinfo or maxmind reader), origin, UA, allowedMethods, requireHttps
rate-limit.ts        — Redis token bucket per windowType (second, minute, hour, day, month)
quota.ts             — increments `currentXxxUsage` fields (atomic via Prisma `update increment`) and rolls them at `lastQuotaResetAt`
events.ts            — emits apiKey.* events on threshold breaches
```

Order of checks for each request:
1. Resolve API key by token; reject if `!isActive` or `expiresAt < now` (`401 invalid_api_key`).
2. Method allow-list (`allowedMethods`) and HTTPS (`requireHttps`).
3. Restrictions: IP/CIDR, country, origin, UA. Mode is `allow` or `deny` (`restrictionMode`).
4. Rate limit per second (Redis token bucket, refill = `rateLimitPerSecond`).
5. Quota windows: minute/hour/day/month — `INCR usage_X; if > quota_X then reject with 429`.
6. Permission: action requires `canRead` or `canWrite`.
7. Then the channel logic.

All counters live in `ApiKey` columns + Redis (Redis is source of truth for in-flight; DB is periodically reconciled by a sweep every 15s).

## 8. Data Model

The schema already covers this comprehensively (`api-key.prisma`). One small addition:

```prisma
model ApiKey {
  // ... existing ...
  deprecatedAt        DateTime?    // set on rotate; auto-revoked after grace
  revokedAt           DateTime?
  revokedReason       String?
  rotatedFromKeyId    String?      // links new → old key
}
```

`ApiKeyRateLimit`, `ApiKeyQuotaWindow`, `ApiKeyGeoStats` already exist; the Redis enforcement writes through to `ApiKeyQuotaWindow` for durable analytics, and to `ApiKeyGeoStats` per (day, country) bucket.

## 9. Non-Functional Requirements

- Plaintext keys returned **once** at creation; rest of the API returns `key: "nc_live_xxxx****abcd"` (prefix + suffix only). Lookup by key uses a hashed lookup column (add `keyHash` + `keyPrefix` columns; index on `keyHash`).
- Rotation grace period: old key marked deprecated; channel services add a response header `X-NC-Deprecated-Key: true`.
- Revoke is immediate; in-flight requests using the key may still complete but no new ones accepted.
- Reset counters action requires Platform Admin role.
- "Test request" in playground uses the actual enforcement pipeline (not a mock) so it counts against the key's quota.

## 10. Acceptance Criteria

- [ ] Creating a key returns the plaintext value once and only once.
- [ ] List view never reveals plaintext.
- [ ] Rotating produces a new key, marks old as deprecated, and auto-revokes it after the grace period.
- [ ] Hitting `minuteQuota` from the playground returns 429 with a `Retry-After`.
- [ ] Revoke takes effect within 1 second (verified by hitting an endpoint right after revoke).
- [ ] Usage chart renders 60 1-minute buckets in <300ms (data from `ApiKeyQuotaWindow`).

## 11. Open Questions

- Should we hash keys with bcrypt/argon2 or HMAC? **HMAC-SHA256** with a server pepper — lookup must be O(1) and constant-time-comparable; bcrypt makes per-request validation too slow.
- Surface keys' "last 30 days send mix" as a donut on the overview screen? **Yes** — visible signal of channel adoption.

---

## 12. Implementation Prompt

```text
ROLE
You are a senior full-stack engineer building API key management + enforcement.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- The ApiKey model in prisma/schema/api-key.prisma is already very rich; this feature is wiring + UI + enforcement, not schema invention.
- Channel services in src/notifications/* will call shared helpers in src/lib/api/* — DO NOT duplicate the pipeline per channel.

OBJECTIVE
Implement Feature 12: schema additions (keyHash, keyPrefix, deprecation/revoke fields), the full enforcement pipeline as a set of helpers, and the admin screens + endpoints.

INPUTS TO READ FIRST
1. docs/12-admin-api-keys-and-limits.md
2. prisma/schema/api-key.prisma (all columns are already meaningful — don't invent duplicates)
3. docs/01-sms-iranian-providers.md (the order of checks the channels will rely on)
4. docs/09-webhooks-and-events.md (apiKey.* event names)
5. Next.js 16 docs for App Router server actions and streaming responses (for live usage)

CONSTRAINTS
- Store HMAC-SHA256(token, serverPepper) in `keyHash`. Lookups always use keyHash; never store plaintext.
- `keyPrefix` is 8 chars (printable) used in UI masking ("nc_live_xxxxxxxx****abcd").
- Plaintext token is shown ONCE; never log it.
- Enforcement order: auth → method → restrictions → rate-limit (Redis) → quotas (Redis + DB) → permission. Reject as early as possible.
- Quota counters live primarily in Redis; reconcile to ApiKey row every 15s with a background sweep (use Feature 08's BullMQ scheduler).
- Rotation: in one Prisma tx, create new key + set old.deprecatedAt + set old.rotatedFromKeyId-inverse. Auto-revoke job queued for `now + gracePeriodHours`.

DELIVERABLES
- prisma migration adding keyHash, keyPrefix, deprecatedAt, revokedAt, revokedReason, rotatedFromKeyId
- src/lib/api/{auth-bearer,restrictions,rate-limit,quota,events}.ts
- src/lib/api/pipeline.ts (composes all of the above for channel services to consume)
- src/jobs/api-key-sweep.ts (Redis → DB reconciliation, runs every 15s)
- src/jobs/api-key-rotation-finalizer.ts (revokes deprecated keys at expiry)
- src/app/admin/projects/[slug]/environments/[env]/api-keys/*  (list, new, [id] with tabs)
- src/app/admin/api/projects/[slug]/environments/[env]/api-keys/route.ts
- src/app/admin/api/.../[id]/route.ts
- src/app/admin/api/.../[id]/{rotate,revoke,reset-counters,usage,test}/route.ts
- src/components/admin/{ApiKeyTable,ApiKeyWizard,LimitsEditor,RestrictionsEditor,UsageChart,Playground,...}.tsx

STEP PLAN
1. Schema additions + db:generate.
2. Pipeline helpers in src/lib/api/ — pure functions where possible, well-typed Context object.
3. Wire one existing channel service (SMS) through pipeline.ts; verify all checks fire in order.
4. Background sweep + rotation finalizer (use BullMQ instance from Feature 08).
5. Admin endpoints (CRUD + rotate/revoke/reset/usage/test).
6. UI screens (list, wizard, overview tabs, playground).

DEFINITION OF DONE
- A key created via the wizard is usable immediately for a real send.
- All enforcement checks visibly fire in the right order (test by triggering each one).
- Rotation grace period works: old key warns via response header, then revokes.
- Usage chart renders accurate per-minute counts.
- `bun run check-types`, `bun run lint`, `bun run format:check` clean.

OUT OF SCOPE
- Per-endpoint scoping beyond existing `scopes` JSON.
- OAuth client management.
- Long-term archive of high-cardinality logs (Feature 15).
```
