# Feature 08 — Bulk Send & Scheduled Delivery

> **Status:** Draft · **Phase:** 3 · **Depends on:** Feature 06 (Unified API), Feature 07 (Templates)

## 1. Summary

Two related capabilities behind a single Job abstraction:

1. **Bulk send** — submit a list of up to 100k recipients with per-recipient variables; the platform fans out under quota and rate limits.
2. **Scheduled delivery** — submit any send (single or bulk) with a `sendAt` (absolute) or `sendAfter` (relative) timestamp.

Backed by a Redis-based job queue (BullMQ-compatible API surface) so we can scale workers horizontally.

## 2. Problem & Motivation

Synchronous send is fine for transactional traffic. Anything > ~50 recipients or anything time-shifted (drip campaigns, scheduled OTPs, off-peak sends) needs a queue. Customers shouldn't have to operate one.

## 3. Goals & Non-Goals

### Goals
- `POST /v1/jobs/bulk` accepts a CSV upload or inline JSON of up to 100,000 rows.
- Each row carries `{ to, variables }`; the job's body carries `{ template, channels, locale, ... }`.
- Progress reporting: `GET /v1/jobs/{id}` returns `{ status, total, succeeded, failed, percent }`.
- Per-job pause / resume / cancel.
- Scheduled jobs honor `sendAt` (ISO 8601, with optional timezone; default Tehran).
- Workers respect per-key minute/hour quotas — never burst past the configured rate.
- Idempotency at the **job** level (Idempotency-Key on submission) and at the **row** level (the row's natural key plus job id).

### Non-Goals
- Drip / multi-step journeys (Phase 4).
- Cohort/segmentation queries on customer data — input is always an explicit recipient list.

## 4. User Stories

- **As an Integrator**, I upload a CSV of 25k recipients and a template; the platform handles the rest.
- **As a Project Owner**, I schedule a holiday announcement for 09:00 Tehran tomorrow.
- **As a Project Owner**, I pause an in-flight bulk send when I notice copy errors and cancel it after fixing.

## 5. API Specification

### 5.1 `POST /v1/jobs/bulk`

```json
{
  "template": "promo-summer-2026",
  "locale": "fa-IR",
  "channels": ["sms"],
  "recipients": [
    { "to": { "phone": "+989120000001" }, "variables": { "name": "علی" } },
    { "to": { "phone": "+989120000002" }, "variables": { "name": "سارا" } }
  ],
  "sendAt": "2026-05-16T05:30:00Z",      // optional
  "rateLimitPerSecond": 50               // optional cap below the api-key's own limit
}
```

Or `multipart/form-data` with `file=recipients.csv` and the same JSON in a `payload` part.

Response `202`
```json
{
  "id": "job_01HK...",
  "status": "scheduled",
  "total": 25000,
  "scheduledFor": "2026-05-16T05:30:00Z"
}
```

### 5.2 Job control

- `GET    /v1/jobs/{id}` — status + counts
- `GET    /v1/jobs/{id}/items?cursor=&status=` — per-row results (paginated)
- `POST   /v1/jobs/{id}/pause`
- `POST   /v1/jobs/{id}/resume`
- `POST   /v1/jobs/{id}/cancel`

### 5.3 List

`GET /v1/jobs?status=&type=` — list jobs scoped to API key's project+env.

## 6. Data Model

`prisma/schema/job.prisma`:

```prisma
model Job {
  id              String      @id @default(cuid(2))
  projectId       String
  environmentId   String
  apiKeyId        String
  type            JobType
  status          JobStatus   @default(SCHEDULED)
  template        String?
  locale          String?
  channels        Json
  total           Int         @default(0)
  succeeded       Int         @default(0)
  failed          Int         @default(0)
  rateLimitPerSecond Int?
  scheduledFor    DateTime?
  startedAt       DateTime?
  finishedAt      DateTime?
  pausedAt        DateTime?
  cancelledAt     DateTime?
  payload         Json        // body without recipients (kept small)
  inputHash       String?     // sha256 of submitted recipients file
  metadata        Json?       @default("{}")
  idempotencyKey  String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  items           JobItem[]

  @@unique([apiKeyId, idempotencyKey])
  @@index([projectId, environmentId, status])
  @@index([scheduledFor])
  @@map("jobs")
}

model JobItem {
  id              String        @id @default(cuid(2))
  jobId           String
  job             Job           @relation(fields: [jobId], references: [id], onDelete: Cascade)
  rowKey          String        // hash(recipient + jobId) for idempotent processing
  to              Json
  variables       Json?
  notificationId  String?       // FK after dispatch
  status          JobItemStatus @default(PENDING)
  attempts        Int           @default(0)
  reason          String?
  finishedAt      DateTime?

  @@unique([jobId, rowKey])
  @@index([jobId, status])
  @@map("job_items")
}

enum JobType   { BULK SCHEDULED }
enum JobStatus { SCHEDULED RUNNING PAUSED COMPLETED FAILED CANCELLED }
enum JobItemStatus { PENDING SENT FAILED SKIPPED }
```

## 7. Worker Architecture

```
src/jobs/
  queue.ts            // BullMQ instance (Redis URL = process.env.REDIS_URL)
  scheduler.ts        // turns scheduled jobs into queue jobs at sendAt
  bulk-worker.ts      // consumes JobItem rows, calls unified notification service
  control.ts          // pause/resume/cancel helpers
```

- One queue per project? **No** — single queue with project-scoped concurrency keys to avoid noisy-neighbor scheduling complexity in Phase 3.
- Worker concurrency is per-API-key, capped at the lesser of `apiKey.rateLimitPerSecond` and `job.rateLimitPerSecond`.

## 8. Non-Functional Requirements

- CSV upload capped at 10 MB / 100k rows. Larger uploads must be split client-side.
- Rate enforcement is **the same Redis token bucket** as synchronous sends (Feature 12). Workers compete for the same budget.
- Pausing a job stops new dispatches within 2 seconds; in-flight requests are not interrupted.
- Cancellation marks remaining items SKIPPED and emits `job.cancelled`.
- Failed items keep a `reason` string; never store the recipient's PII in error logs.

## 9. Acceptance Criteria

- [ ] A 10k-row bulk job completes under the configured rate without exceeding it.
- [ ] Scheduled job for `+10 min` fires within 30s of its target time.
- [ ] Pause / resume / cancel work and are reflected in `GET /v1/jobs/{id}` within 2s.
- [ ] Per-row idempotency: re-running a job (same idempotencyKey + same input hash) does not re-send completed rows.
- [ ] The CSV parser tolerates BOM, Windows line endings, and Farsi characters.

## 10. Open Questions

- Pre-signed S3 upload for very large CSV files? **Phase 4** — for now we accept multipart up to 10MB.
- Should items keep references back to `Notification` rows? **Yes** — store `notificationId` on `JobItem` for traceability.

---

## 11. Implementation Prompt

```text
ROLE
You are a senior backend engineer building bulk send + scheduling.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- BullMQ runs on Redis; the repo's Redis URL is process.env.REDIS_URL (Bun-native client at src/lib/redis.ts is separate — use a dedicated ioredis-compatible client inside BullMQ).
- Unified notification service from Feature 06 is the dispatch primitive — the bulk worker calls it per row.

OBJECTIVE
Implement Feature 08: bulk + scheduled jobs, control endpoints, and the worker.

INPUTS TO READ FIRST
1. docs/08-bulk-and-scheduling.md
2. docs/06-unified-notification-api.md
3. docs/12-admin-api-keys-and-limits.md (rate-limit budget)
4. BullMQ docs (search for "rate limiter", "delayed jobs", "concurrency")
5. Next.js 16 route handler docs for multipart upload

CONSTRAINTS
- The worker MUST share the same Redis token-bucket as synchronous sends. Do not create a second budget.
- CSV parsing uses a streaming parser (e.g. csv-parser) to avoid loading 100k rows into memory.
- Job state changes (pause/resume/cancel) MUST be reflected in BullMQ within 2 seconds — use BullMQ's job events + a Redis pub/sub bridge.
- Per-row idempotency key = sha256(jobIdempotencyKey || ":" || rowIndex || ":" || recipientHash).

DELIVERABLES
- prisma/schema/job.prisma
- src/jobs/{queue,scheduler,bulk-worker,control}.ts
- src/api/v1/jobs/bulk/route.ts                          (POST)
- src/api/v1/jobs/route.ts                               (GET list)
- src/api/v1/jobs/[id]/route.ts                          (GET)
- src/api/v1/jobs/[id]/items/route.ts                    (GET)
- src/api/v1/jobs/[id]/{pause,resume,cancel}/route.ts    (POST)
- A `bun run worker` script entry that starts the worker process

STEP PLAN
1. Schema + db:generate.
2. Queue setup (BullMQ on Redis), graceful shutdown.
3. Submission endpoint: stream-parse CSV → create Job + JobItem rows → enqueue.
4. Worker: pull, check budget, call unified service, update item, persist notificationId.
5. Scheduler: cron loop that promotes scheduled jobs to active at sendAt.
6. Control endpoints.

DEFINITION OF DONE
- 10k-row job completes; rate never exceeds budget.
- Cancellation marks remaining items SKIPPED within 2s.
- Replay with same Idempotency-Key returns original job.
- `bun run check-types` and lint pass.

OUT OF SCOPE
- Drip / journeys.
- Segmentation against customer data.
- S3 pre-signed uploads (Phase 4).
```
