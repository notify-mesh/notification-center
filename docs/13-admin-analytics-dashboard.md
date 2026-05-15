# Feature 13 — Admin Panel: Analytics Dashboard

> **Status:** Draft · **Phase:** 3 · **Depends on:** all channel features, Feature 09 (events), Feature 12 (counters)

## 1. Summary

A unified analytics surface — time-series and breakdown views over sends, deliveries, failures, latency, cost, and geographic distribution. Scoped to (project, environment, [api-key], [channel], [template], [date-range]) with a global "compare to previous period" toggle. Powered by aggregated tables (rollups) computed by a background job, plus live counters from Redis for the last 5 minutes.

## 2. Problem & Motivation

Raw logs answer "what happened to this send" (Feature 15). The analytics dashboard answers "is the system healthy and how is my product trending" — the metric set every PM and SRE asks for first.

## 3. Goals & Non-Goals

### Goals
- KPI cards: 24h sends, delivery rate, failure rate, OTP verify rate, p95 latency, cost (IRR).
- Time-series charts (line/bar): sends per minute/hour/day, grouped by channel, status, template, or country.
- Breakdown tables: top templates, top failure reasons, top recipients (hashed), top countries.
- Funnel: requested → sent → delivered → opened/clicked (email) / verified (OTP).
- Geographic heatmap of `ApiKeyGeoStats`.
- Comparison ("vs. previous 7 days") on every chart.
- Export filtered view as PNG (chart screenshot) or CSV (raw rollup rows).

### Non-Goals
- BI/SQL workbench (Phase 4 — link out to Metabase if needed).
- Predictive forecasting (Phase 4).

## 4. User Stories

- **As a Project Owner**, I open the dashboard and immediately see "delivery rate dropped from 98% to 91% in the last 4 hours" with a top-3 failure reason breakdown.
- **As a Platform Admin**, I compare two projects' OTP verify rates side-by-side.
- **As an SRE**, I see p95 send latency per channel and per provider on one page.

## 5. UI Screens

```
/admin/projects/[slug]/environments/[env]/analytics
  ├─ Overview              (KPIs + time-series sends)
  ├─ Channels              (per-channel breakdown)
  ├─ Templates             (top templates, failure mix per template)
  ├─ Recipients            (top countries, top hashed recipients)
  ├─ Funnel                (requested → sent → ... → verified/opened/clicked)
  ├─ Latency               (p50/p95/p99 by channel)
  └─ Cost                  (estimated IRR by channel, top spenders)
/admin/analytics                                   (cross-project, Platform Admin only)
```

Charts use Recharts (lightweight, works under RSC w/ client islands).

## 6. API Specification

- `GET /admin/api/.../analytics/kpis?range=24h`
- `GET /admin/api/.../analytics/timeseries?metric=sends&groupBy=channel&bucket=hour&range=7d`
- `GET /admin/api/.../analytics/breakdown?dim=template&metric=failures&range=24h&limit=20`
- `GET /admin/api/.../analytics/funnel?range=7d&channel=email`
- `GET /admin/api/.../analytics/geo?range=24h`
- `GET /admin/api/.../analytics/latency?range=24h`
- `GET /admin/api/.../analytics/cost?range=30d`

All endpoints support `compareTo=previous` and return both series.

## 7. Rollup Pipeline

```
src/analytics/
  rollups/
    sends.sql                          // hourly per (projectId, envId, channel, status, template) → row count + sum(cost)
    latency.sql                        // hourly per channel/provider → p50/p95/p99
    geo.sql                            // daily per country
  worker.ts                            // BullMQ schedule: every minute → roll the last completed hour; every day → roll the last completed day
  query.ts                             // reads from rollup tables; falls back to Redis for the in-flight bucket
```

Storage choices:
- Rollups stored in `analytics_*` tables (hourly + daily granularity).
- Latency uses approximate quantiles (t-digest serialized into a column, or simple histogram buckets).
- High-cardinality dimensions (template name, country code) are columns; recipient phone/email is **hashed** before aggregation.

## 8. Data Model

`prisma/schema/analytics.prisma`:

```prisma
model AnalyticsHourly {
  id            String   @id @default(cuid(2))
  projectId     String
  environmentId String
  bucket        DateTime
  channel       String
  status        String
  template      String?
  country       String?
  count         Int      @default(0)
  costIrr       Int      @default(0)
  p50LatencyMs  Int?
  p95LatencyMs  Int?
  p99LatencyMs  Int?

  @@unique([projectId, environmentId, bucket, channel, status, template, country])
  @@index([projectId, environmentId, bucket])
  @@map("analytics_hourly")
}

model AnalyticsDaily {
  // same shape, bucket = date
}
```

## 9. Non-Functional Requirements

- All queries return in <500ms p95 over a 90-day range when scoped to a single project.
- Live counters (last 5 min, per channel) come from Redis, merged into the response by `query.ts`.
- Hashed identifiers use the project pepper (same as OTP) so a `(projectId, identifierHash)` can be looked up but not reversed.
- Cost is estimated using a per-provider price table in `ProviderCredential` metadata (Feature 14); rough but useful.
- Export CSV is streamed to avoid memory spikes.

## 10. Acceptance Criteria

- [ ] All KPI cards render in <800ms on a project with 1M sends in the last 30 days (rollups + Redis).
- [ ] Time-series with `groupBy=channel` returns one line per channel.
- [ ] "vs. previous" overlays the prior period correctly.
- [ ] Geo heatmap aggregates from `ApiKeyGeoStats`.
- [ ] CSV export of a 7-day breakdown contains the same numbers as the chart.

## 11. Open Questions

- Should we precompute "yesterday" snapshot daily at 00:05 Tehran for instant load? **Yes** — saves a query during morning standups.
- Forecasting (next 7 days)? **Out of scope** here.

---

## 12. Implementation Prompt

```text
ROLE
You are a senior full-stack engineer building the analytics dashboard.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Sources: SmsMessage, EmailMessage, BaleMessage, PushMessage, Notification, OtpAudit, ApiKeyGeoStats.
- Rollups land in AnalyticsHourly and AnalyticsDaily (new tables).
- BullMQ is available (Feature 08). Use it for the rollup worker schedule.

OBJECTIVE
Implement Feature 13: rollup pipeline + query layer + UI dashboards.

INPUTS TO READ FIRST
1. docs/13-admin-analytics-dashboard.md
2. docs/09-webhooks-and-events.md (event taxonomy)
3. docs/12-admin-api-keys-and-limits.md (existing per-key counters and ApiKeyGeoStats)
4. Recharts docs (just to confirm component names — composition is straightforward)
5. Next.js 16 docs for streaming responses and RSC + client islands

CONSTRAINTS
- Identifiers (phone/email) are NEVER aggregated raw; only HMAC-SHA256(identifier, projectPepper).
- Quantiles can be approximate (t-digest or fixed buckets) — document the choice in src/analytics/README.md.
- Live merge: query.ts reads rollups for completed buckets and Redis counters for the in-flight bucket; never double-count.
- Rollup worker is idempotent: re-running a bucket overwrites rows by the unique key.
- Use Recharts. Keep client bundles small — split chart components into client islands; KPIs are RSC.

DELIVERABLES
- prisma/schema/analytics.prisma
- src/analytics/{rollups/*.sql,worker,query}.ts
- src/app/admin/projects/[slug]/environments/[env]/analytics/*  (tabbed pages)
- src/app/admin/api/.../analytics/{kpis,timeseries,breakdown,funnel,geo,latency,cost}/route.ts
- src/components/admin/charts/{TimeSeries,Breakdown,FunnelChart,GeoMap,LatencyChart,...}.tsx

STEP PLAN
1. Schema + db:generate.
2. Rollup SQL (raw `prisma.$queryRaw` or executeRaw inside a tx).
3. Worker: schedule every minute for the previous hour bucket; every day for previous day.
4. Query layer that merges rollups + Redis.
5. UI tabs with KPIs and charts.

DEFINITION OF DONE
- KPI cards render under 800ms with realistic data.
- Charts respect filters (date range, channel, template).
- CSV export streams.
- `bun run check-types` and lint pass.

OUT OF SCOPE
- BI / SQL workbench.
- Forecasting.
- Email-able PDF reports.
```
