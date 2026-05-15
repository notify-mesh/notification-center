# Feature 03 — Email Channel (Resend + SMTP)

> **Status:** Draft · **Phase:** 1 (MVP — SMTP & Resend) · **Depends on:** Feature 07 (Templates), Feature 14 (Provider credentials)

## 1. Summary

A transactional email REST API backed by **Resend** (preferred for managed delivery) and **SMTP** (fallback / for customers who must use their own MTA). Templates are first-class: render with React Email (`@betternotify/react-email`) and Handlebars (`@betternotify/handlebars`). Inline images, attachments, and per-recipient variable substitution are supported.

## 2. Problem & Motivation

Customers want a "Postmark-grade" transactional email API with native i18n (Farsi RTL templates), DKIM/SPF status reporting, and Iranian-friendly delivery (Resend supports IR senders without ITAR-style friction). Self-hosted SMTP is required for some banking/government customers.

## 3. Goals & Non-Goals

### Goals
- `POST /v1/emails` accepts both raw and templated requests.
- Multi-recipient `to / cc / bcc` with per-recipient variable maps.
- Attachments via inline base64 or pre-signed URL.
- Per-environment provider config (Resend API key or SMTP creds).
- Bounce / complaint / open / click events ingested via provider webhooks (Resend) and surfaced through Feature 09.
- Suppression list per project (hard-bounce or complaint = auto-suppress).

### Non-Goals
- Marketing/campaign features, unsubscribe management beyond suppression (Phase 4).
- IMAP/inbound parsing (Phase 4).

## 4. User Stories

- **As an Integrator**, I send a templated email with `{ "to": "x@y.com", "template": "order-shipped", "variables": {...} }`.
- **As a Project Owner**, I see opens/clicks/bounces per template per day.
- **As a Platform Admin**, I configure Resend for one project and SMTP for another.

## 5. API Specification

### 5.1 `POST /v1/emails`

Raw mode:
```json
{
  "from": { "email": "no-reply@app.example", "name": "App" },
  "to":   [{ "email": "u@example.com", "name": "User" }],
  "subject": "سفارش شما ارسال شد",
  "html": "<p>سفارش #1234 ارسال شد.</p>",
  "text": "Order #1234 shipped.",
  "attachments": [
    { "filename": "invoice.pdf", "contentBase64": "JVBER..." }
  ],
  "headers": { "X-Custom": "value" },
  "tags": ["order", "transactional"],
  "metadata": { "orderId": "1234" }
}
```

Templated mode:
```json
{
  "from": "orders@app.example",
  "to": [
    { "email": "u@example.com", "variables": { "name": "علی", "orderId": "1234" } }
  ],
  "template": "order-shipped",
  "locale": "fa-IR"
}
```

Response `202`
```json
{
  "id": "email_01HK...",
  "channel": "email",
  "status": "queued",
  "provider": "resend",
  "messageIds": ["res_8d2..."]
}
```

### 5.2 `GET /v1/emails/{id}` — Status (queued/sent/delivered/bounced/complained/opened/clicked/failed)

### 5.3 `GET /v1/emails` — List with filters: `from`, `to`, `template`, `status`, `tag`, date range.

### 5.4 Suppression list

- `GET /v1/emails/suppressions`
- `POST /v1/emails/suppressions` body `{ email, reason }`
- `DELETE /v1/emails/suppressions/{email}`

## 6. Data Model

`prisma/schema/email.prisma`:

```prisma
model EmailMessage {
  id              String        @id @default(cuid(2))
  projectId       String
  environmentId   String
  apiKeyId        String
  provider        String        // "resend" | "smtp"
  providerMessageId String?
  fromEmail       String
  fromName        String?
  toEmails        Json          // array of recipient objects
  cc              Json?
  bcc             Json?
  subject         String
  html            String?       @db.LongText
  text            String?       @db.Text
  templateName    String?
  templateLocale  String?
  variables       Json?
  attachmentsHash String?       // hash of attachment manifest (not raw bytes)
  tags            Json?         @default("[]")
  metadata        Json?         @default("{}")
  status          EmailStatus   @default(QUEUED)
  bouncedAt       DateTime?
  complainedAt    DateTime?
  openedAt        DateTime?
  clickedAt       DateTime?
  failureReason   String?
  idempotencyKey  String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  @@unique([apiKeyId, idempotencyKey])
  @@index([projectId, environmentId, createdAt])
  @@index([status])
  @@map("email_messages")
}

model EmailSuppression {
  id          String   @id @default(cuid(2))
  projectId   String
  email       String
  reason      String   // hard_bounce, complaint, manual
  createdAt   DateTime @default(now())

  @@unique([projectId, email])
  @@map("email_suppressions")
}

enum EmailStatus {
  QUEUED SENT DELIVERED BOUNCED COMPLAINED OPENED CLICKED FAILED
}
```

## 7. Non-Functional Requirements

- **Attachments** capped at 10 MB total (Resend limit); reject early.
- **Template rendering** must be deterministic and cacheable (`templateName + version + locale + variablesHash → html/text`). Cache in Redis 5 min.
- **Suppression check** before every send; if recipient is suppressed, write a `SKIPPED` row and return 422 with `recipient_suppressed`.
- **Webhook ingress** at `POST /v1/internal/email-webhooks/resend` (HMAC-signed by Resend). Idempotent processing keyed by Resend's event id.
- **DKIM/SPF**: surfaced in `GET /v1/emails/{id}` as `auth_status`.

## 8. Provider Adapter

```
src/notifications/email/
  types.ts
  resend.adapter.ts        // @betternotify/resend
  smtp.adapter.ts          // @betternotify/smtp
  renderer.ts              // template → html/text (react-email or handlebars)
  service.ts
```

## 9. Acceptance Criteria

- [ ] Raw and templated sends succeed against Resend in <1s p95 (provider time excluded).
- [ ] SMTP adapter sends a real message to MailHog in docker-compose dev.
- [ ] Bounce events from Resend mark the row `BOUNCED` and create an `EmailSuppression`.
- [ ] Locale-aware template selection: requesting `locale: fa-IR` returns Farsi RTL.
- [ ] Attachments >10MB rejected with `413 attachment_too_large`.
- [ ] Suppression list endpoints work and are scoped per project.

## 10. Open Questions

- Should we render templates with React Email or Handlebars by default? **Recommendation**: react-email for HTML structure, handlebars for the text version (lighter & more forgiving). Doc the convention in Feature 07.
- Per-project sending domain vs. platform domain? Out of scope (Feature 14 covers credentials per provider; domain verification is Phase 4).

---

## 11. Implementation Prompt

```text
ROLE
You are a senior backend engineer adding the Email channel.

CONTEXT
- Stack and conventions per CLAUDE.md and AGENTS.md.
- The repo already depends on @betternotify/resend, @betternotify/smtp, @betternotify/react-email, @betternotify/handlebars.
- Pattern to mirror: src/notifications/sms/* (Feature 01).
- Templates are configured per project via Feature 07; for MVP, accept a templateName that resolves against the `Template` table — if Feature 07 isn't built yet, accept inline `html`/`text` only and stub the templated path with a 501 response and a TODO referencing docs/07-templates-engine.md.

OBJECTIVE
Implement Feature 03 endpoints (POST /v1/emails, GET /v1/emails/{id}, GET /v1/emails, suppression CRUD) plus the Resend webhook receiver.

INPUTS TO READ FIRST
1. docs/03-email-channel.md (this feature)
2. docs/01-sms-iranian-providers.md (mirror its shape)
3. docs/14-admin-provider-credentials.md (Resend API key & SMTP creds retrieval)
4. @betternotify/resend and @betternotify/smtp package READMEs under node_modules/
5. Next.js 16 route handler docs (node_modules/next/dist/docs/)

CONSTRAINTS
- Idempotency, rate-limiting, restrictions, and event emission helpers are shared with SMS — DO NOT duplicate.
- Encode attachments only at adapter boundary; service layer takes a normalized DTO.
- Cap total attachment size at 10MB; reject earlier than provider would.
- Use zod schemas for both request and provider-response validation.
- Webhook handler MUST verify HMAC (per Resend docs) and use the event id as idempotency key.
- Render once, store the rendered html/text on the EmailMessage row (under @db.LongText) for audit replay.

DELIVERABLES
- prisma/schema/email.prisma
- src/notifications/email/{types,renderer,resend.adapter,smtp.adapter,service}.ts
- src/api/v1/emails/route.ts                          (POST list + create)
- src/api/v1/emails/[id]/route.ts                     (GET)
- src/api/v1/emails/suppressions/route.ts             (list, create)
- src/api/v1/emails/suppressions/[email]/route.ts     (delete)
- src/api/v1/internal/email-webhooks/resend/route.ts  (POST — provider callback)

STEP PLAN
1. Schema + db:generate.
2. Renderer: resolve (templateName, locale) → React Email component → html + text. Fall back to handlebars if no react component is registered.
3. Resend adapter, SMTP adapter (use MailHog in dev — docker compose addition optional).
4. Service layer: suppression check → rate-limit → render → adapter.send → persist.
5. Route handlers + zod.
6. Webhook receiver with HMAC verification and idempotent processing.

DEFINITION OF DONE
- Raw send to a real Resend sandbox returns 202 and persists the row.
- Bounce webhook flips the row to BOUNCED and inserts EmailSuppression.
- Suppressed recipients return 422 without calling the provider.
- `bun run check-types`, `bun run lint`, `bun run format:check` clean.

OUT OF SCOPE
- Marketing / unsubscribe flows.
- Domain verification UI (Feature 14 handles credential management at API level only).
- Open-pixel and click-tracking proxy hosting (rely on Resend's hosted tracking).
```
