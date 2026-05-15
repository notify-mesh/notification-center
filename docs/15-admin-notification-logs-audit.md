# Feature 15 — Admin Panel: Notification Logs & Audit Trail

> **Status:** Draft · **Phase:** 2 · **Depends on:** all channel features, Feature 09 (events), Feature 10 (admin audit)

## 1. Summary

Two distinct logs, presented as one navigable UI:

1. **Notification logs** — every send across channels (`SmsMessage`, `EmailMessage`, `BaleMessage`, `PushMessage`, `Notification`, `OtpAudit`). Searchable, drill-down to event timeline.
2. **Admin audit log** — every state-changing action by operators (`AdminAuditLog`, plus subscription/role/credential changes). Tamper-evident.

Both feed off existing tables. The feature is **search + UI + retention policy**.

## 2. Problem & Motivation

Operators need to answer:
- "Where did this OTP go?" (5 minutes ago, user complains it never arrived)
- "Who changed this provider credential at 2:14am?"
- "Why is this customer's webhook failing every 30 min?"

Today they would have to write SQL. Make it a UI.

## 3. Goals & Non-Goals

### Goals
- Unified search bar across all channel messages, scoped to project+env by default.
- Drill-down view: timeline of webhook events related to a given message id, with payloads.
- Filters: channel, status, template, recipient hash, idempotency key, api-key, date range.
- Live tail mode (last 5 min, auto-refresh, WebSocket-free; use SSE).
- Admin audit log view with diff renderer (before/after JSON).
- Retention policy: hot rows (30 days) in MariaDB; archived rows in cold storage (S3/object store) after 30 days — surfaced through a "load from archive" button (Phase 3 can stub the cold layer to a slower Prisma query).

### Non-Goals
- Free-text indexing of message bodies (Phase 4 — would require a separate index store).
- Real-time anomaly detection (Phase 4).

## 4. User Stories

- **As a Project Owner**, I paste an `Idempotency-Key` and immediately see the resulting Notification record.
- **As a Project Owner**, I open a failed Notification and see the webhook deliveries that fired (and any retries).
- **As a Platform Admin**, I see who revoked a critical API key last Tuesday and why.

## 5. UI Screens

```
/admin/projects/[slug]/environments/[env]/logs
  ├─ Messages              (unified search + table; tabs filter per channel)
  ├─ Audit                 (admin actions, with diff view)
  └─ Live                  (SSE tail of last 5 minutes)
/admin/projects/[slug]/environments/[env]/logs/messages/[id]
  (timeline view: created → sent → events → webhook deliveries)
```

## 6. API Specification

- `GET /admin/api/.../logs/messages?channel=&status=&template=&recipientHash=&idempotencyKey=&apiKeyId=&q=&from=&to=&cursor=`
- `GET /admin/api/.../logs/messages/{kind}/{id}` — `kind` is one of `sms|email|bale|push|notification|otp`
- `GET /admin/api/.../logs/messages/{kind}/{id}/timeline`
- `GET /admin/api/.../logs/audit?actorUserId=&action=&targetType=&from=&to=&cursor=`
- `GET /admin/api/.../logs/live` — SSE; emits new rows since `Last-Event-ID`.
- `POST /admin/api/.../logs/export` — async job, returns `jobId` and emails the file when ready.

## 7. Data Model

No new core tables. Add:

```prisma
model NotificationLogArchive {
  id             String   @id   // same id as origin row, kind-prefixed (e.g. "sms_...")
  kind           String
  projectId      String
  environmentId  String
  payload        Json     // the original row, JSON-serialized
  archivedAt     DateTime @default(now())

  @@index([projectId, environmentId, archivedAt])
  @@map("notification_log_archive")
}
```

`AdminAuditLog` is owned by Feature 10 — this feature only reads.

A nightly job moves rows older than 30 days from each channel table to `NotificationLogArchive`, then deletes the originals. The "load from archive" button hydrates rows on demand.

## 8. Non-Functional Requirements

- p95 search response < 700ms over 30 days of hot data per project (right indexes already on most tables; ensure composite indexes on (`projectId`, `environmentId`, `createdAt`)).
- Recipient identifiers are stored hashed where possible; raw values appear only in the channel-specific row (e.g. `SmsMessage.receptor`) and are surfaced **only** to operators with permission `logs:read:raw`.
- Live tail uses SSE, capped at 100 events/sec per stream.
- Export job size capped at 1M rows; larger → guidance to narrow filter.

## 9. Acceptance Criteria

- [ ] Searching by an `Idempotency-Key` finds the row across all channel tables.
- [ ] Drill-down shows the full lifecycle (channel events + webhook deliveries) on a single timeline.
- [ ] Audit log diff renderer shows added/removed/changed fields clearly.
- [ ] Live tail catches a freshly sent message within 2 seconds.
- [ ] Archive flow: rows older than 30 days disappear from hot search; "Load from archive" restores them temporarily.

## 10. Open Questions

- Hot retention: 30 days? **Yes**, configurable per project for Phase 3.
- Per-org permission for "view raw recipient"? **Yes** — surface as a role permission via Feature 16.

---

## 11. Implementation Prompt

```text
ROLE
You are a senior full-stack engineer building the unified logs UI.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Sources: SmsMessage, EmailMessage, BaleMessage, PushMessage, Notification, OtpAudit, AdminAuditLog, WebhookDelivery.
- Indexes are already present on most channel tables; verify before adding new ones.

OBJECTIVE
Implement Feature 15: unified search + drill-down timelines + SSE live tail + audit log view + archive flow.

INPUTS TO READ FIRST
1. docs/15-admin-notification-logs-audit.md
2. docs/01..09 (the source tables and event names)
3. docs/10-admin-user-management.md (AdminAuditLog model and audit helper)
4. Next.js 16 docs for SSE / streamed responses

CONSTRAINTS
- Search query MUST be parameterized; never use string interpolation in SQL.
- Idempotency-key search is exact-match (indexed). Free-text body search is NOT in scope.
- SSE stream lives at /admin/api/.../logs/live and uses event id = sortable timestamp+row id for resumption via Last-Event-ID.
- Raw recipient values gated by a permission check (`canViewRawRecipients`) resolved by Feature 16.
- Archive job runs daily at 03:00 Tehran via BullMQ scheduler (Feature 08). Reuse Feature 09's job pattern.

DELIVERABLES
- prisma/schema/notification-log-archive.prisma
- src/jobs/log-archive.ts (daily archive)
- src/app/admin/projects/[slug]/environments/[env]/logs/page.tsx (Messages tab)
- src/app/admin/projects/[slug]/environments/[env]/logs/audit/page.tsx
- src/app/admin/projects/[slug]/environments/[env]/logs/live/page.tsx
- src/app/admin/projects/[slug]/environments/[env]/logs/messages/[kind]/[id]/page.tsx (timeline)
- src/app/admin/api/.../logs/messages/route.ts
- src/app/admin/api/.../logs/messages/[kind]/[id]/route.ts
- src/app/admin/api/.../logs/messages/[kind]/[id]/timeline/route.ts
- src/app/admin/api/.../logs/audit/route.ts
- src/app/admin/api/.../logs/live/route.ts (SSE)
- src/app/admin/api/.../logs/export/route.ts (async export)
- src/components/admin/{LogsTable,Timeline,AuditDiff,LiveTail,...}.tsx

STEP PLAN
1. Verify and add indexes if missing on (projectId, environmentId, createdAt) and (apiKeyId, idempotencyKey).
2. Build the unified search query layer that fans out across channel tables (UNION ALL in raw SQL or per-table queries with merge in app code — choose per perf benchmark).
3. Drill-down route handler: load the row, then assemble the timeline (events, webhook deliveries) and return.
4. SSE live-tail endpoint.
5. Archive job + "Load from archive" route.
6. UI tabs + components.

DEFINITION OF DONE
- Idempotency-key search returns the right row across kinds.
- Drill-down timeline renders without N+1 queries (verify with logs/explain).
- Live tail picks up new sends within 2 seconds.
- Archive job moves and restores rows correctly.
- `bun run check-types`, `bun run lint` pass.

OUT OF SCOPE
- Free-text body search.
- Real-time anomaly detection.
- Per-org data residency.
```
