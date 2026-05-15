# Notification Center — Product Roadmap

> **Status:** Draft v1 · **Owner:** Product · **Last updated:** 2026-05-15

## 1. Vision

A managed notification platform that lets developers integrate **multi-channel** delivery (SMS via Iranian providers, Bale Messenger, Email, Web Push, and a unified OTP service) with **one REST API**, while giving operators a comprehensive admin panel for projects, environments, API keys, quotas, and analytics.

The product is opinionated about Iranian market needs (Kavenegar SMS, Bale Messenger, Farsi templates, Tehran timezone, country/IP restrictions) while keeping a generic, channel-agnostic API surface.

## 2. Personas

| Persona | Description | Top jobs-to-be-done |
|---|---|---|
| **Integrator (Developer)** | Backend engineer at a customer company | Send OTPs, transactional emails, push notifications from their own backend with minimal code |
| **Project Owner** | Tech lead or PM at a customer company | Create projects, manage environments, control who has access, watch deliverability |
| **Platform Admin** | Internal operator of Notification Center | Onboard customers, monitor system health, configure providers, investigate incidents |
| **End User** | Receiver of the notification | Get OTPs that arrive fast, on the right channel, in their language |

## 3. Strategic Pillars

1. **Channel-agnostic API.** One endpoint shape (`POST /v1/notifications`) regardless of channel. Channel-specific endpoints exist for power users.
2. **Iranian-first, global-ready.** Native Kavenegar + Bale + Tehran timezone + Farsi RTL templates, but the schema and SDK support adding providers without API breaks.
3. **Strong project isolation.** API keys are scoped to a single `(project, environment)` tuple. Quotas, restrictions, and analytics are computed per key.
4. **Operational visibility.** Every send is logged. Every delivery event is webhooked. Every API key has time-bucketed analytics.
5. **Better Auth, all the way down.** Reuse Better Auth's organization/teams/RBAC primitives — do not build a parallel ACL.

## 4. Feature Map

### A. Channel APIs (developer-facing)

| # | Feature | Doc |
|---|---|---|
| 01 | SMS via Iranian providers (Kavenegar, optional Ghasedak/Melipayamak) | `01-sms-iranian-providers.md` |
| 02 | Bale Messenger — messages & OTP | `02-bale-messenger.md` |
| 03 | Email (Resend + SMTP) | `03-email-channel.md` |
| 04 | Web Push | `04-web-push.md` |
| 05 | Unified OTP service (channel-agnostic) | `05-unified-otp-service.md` |
| 06 | Unified `/v1/notifications` endpoint + idempotency + channel fallback | `06-unified-notification-api.md` |
| 07 | Templates (Handlebars, per-channel, versioned) | `07-templates-engine.md` |
| 08 | Bulk send + scheduled delivery | `08-bulk-and-scheduling.md` |
| 09 | Outbound webhooks & delivery events | `09-webhooks-and-events.md` |

### B. Admin Panel & Platform

| # | Feature | Doc |
|---|---|---|
| 10 | User management (admin) | `10-admin-user-management.md` |
| 11 | Projects & environments | `11-admin-projects-and-environments.md` |
| 12 | API keys, limits & quotas | `12-admin-api-keys-and-limits.md` |
| 13 | Analytics dashboard | `13-admin-analytics-dashboard.md` |
| 14 | Provider credential vault | `14-admin-provider-credentials.md` |
| 15 | Notification logs & audit trail | `15-admin-notification-logs-audit.md` |
| 16 | RBAC, organizations, teams | `16-admin-rbac-and-teams.md` |
| 17 | Developer portal & OpenAPI | `17-developer-portal-and-openapi.md` |

## 5. Release Phasing

### Phase 0 — Foundations (already in repo, harden it)
- Better Auth wired with org/teams (✓ in `src/lib/auth.ts`)
- Prisma multi-schema + MariaDB adapter (✓)
- Redis as secondary storage (✓)
- `ApiKey` model with quotas/restrictions (✓ `prisma/schema/api-key.prisma`)

### Phase 1 — MVP (developer-facing)
- Features **01 (SMS-Kavenegar only), 03 (Email-SMTP+Resend), 05 (OTP), 06 (Unified API), 12 (API keys)**
- One project per user, one default environment
- Synchronous send (no queue), in-process retries only
- OpenAPI auto-doc from Better Auth's `openAPI()` plugin (✓)

### Phase 2 — Expand channels & ops
- **02 (Bale), 04 (Web Push), 07 (Templates), 09 (Webhooks)**
- Admin panel: **10, 11, 12, 14, 15**
- Background queue (BullMQ on Redis) for async send

### Phase 3 — Scale & polish
- **08 (Bulk/Scheduling), 13 (Analytics dashboard), 16 (RBAC), 17 (Dev portal)**
- Multi-tenant analytics with geo (`ApiKeyGeoStats` already in schema)
- Galera + HAProxy DB topology (compose file already exists at `docker/mariadb/compose.yml`)

### Phase 4 — Beyond MVP
- Additional Iranian providers (Ghasedak, MeliPayamak, IPPanel, SMS.ir)
- Telegram, WhatsApp Business, In-App inbox
- A/B testing per template
- Cost reporting & billing exports

## 6. North-Star Metrics

- **TTFS — Time to First Send**: from signup to first 200 response from `POST /v1/notifications`. Target: **< 5 minutes**.
- **Delivery rate per channel** (per-project rolling 24h). Target: SMS ≥ 98%, Email ≥ 95%, Web Push ≥ 90%.
- **API p95 latency**: synchronous send ≤ **300ms** end-to-end (excluding provider time, measured to acceptance).
- **OTP success rate**: % of OTPs verified within TTL. Target: **≥ 70%** (industry-typical baseline).

## 7. Cross-cutting Constraints

- **Tech stack is fixed** (see `AGENTS.md` and `CLAUDE.md`): Next.js 16 App Router, Bun, Prisma v7 multi-schema, MariaDB, Redis (Bun native client), Better Auth, `@betternotify/*`, Tailwind v4 + shadcn `radix-nova`.
- **Path alias**: imports use `@root/*` → `./src/*`.
- **Timezone**: Tehran (`Asia/Tehran`), already configured in the Prisma adapter.
- **Locales**: ship `fa-IR` and `en-US` template variants from day one. Default to `fa-IR`.
- **Security**: provider credentials must be encrypted at rest; webhook payloads HMAC-signed; API keys never logged in plaintext.

## 8. How to use these docs

Each feature doc is **self-contained** and ends with a section called **Implementation Prompt**. That prompt is written to be pasted into Claude Code (or another LLM agent) to implement the feature. The prompt follows a fixed shape:

```
Role · Context · Objective · Inputs to read first ·
Constraints · Deliverables · Step plan · Definition of Done ·
Out of scope
```

When implementing, **always read the doc top-to-bottom first**, then follow the prompt's "Inputs to read first" list before writing any code. Per `AGENTS.md`, that includes consulting `node_modules/next/dist/docs/` for any Next.js API used.
