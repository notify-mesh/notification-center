# Feature 17 — Developer Portal & OpenAPI

> **Status:** Draft · **Phase:** 3 · **Depends on:** all `/v1/*` features

## 1. Summary

A developer-facing portal embedded inside the dashboard at `/dev/*`. It surfaces:

- **Interactive API reference** generated from the live OpenAPI spec (Better Auth's `openAPI()` plugin already publishes its slice; we extend with our `/v1/*` routes).
- **Quickstart guides** per channel.
- **SDK snippets** in TypeScript, Python, PHP, cURL — auto-filled with the current project + environment's API key.
- **Playground** for every endpoint, hitting the real backend with the developer's key.
- **Changelog** of API changes.
- **Status page** (system + per-channel provider health).

## 2. Problem & Motivation

Time-to-first-send is the headline DX metric (`< 5 minutes` per the roadmap). Without an in-context developer surface, customers will read docs in another tab and copy-paste manually. The portal compresses that loop.

## 3. Goals & Non-Goals

### Goals
- Live OpenAPI spec at `/v1/openapi.json` and `/v1/openapi.yaml` (versioned).
- Renderer (Scalar / Stoplight Elements) embedded under `/dev/api`.
- Quickstart pages per channel with copy-paste snippets that include the current key.
- One-click test from any snippet ("Try it" → hits backend; result panel includes response, headers, latency).
- Changelog (manual or auto-generated from OpenAPI diff).
- Status page powered by per-provider test() health checks (Feature 14) + last 5-min rolling failure rate.

### Non-Goals
- Auto-generated language SDKs published to npm/PyPI (Phase 4 — for now we link to OpenAPI Generator with a prebuilt command).
- Sandbox account separate from real DB (Phase 4 — quickstarts run against the user's `development` env).

## 4. User Stories

- **As a new Integrator**, I sign up, land on `/dev`, copy a curl snippet that already has my key, and send my first SMS within 5 minutes.
- **As an Integrator**, I open `/dev/api` and try `POST /v1/otp/start` from the browser with my actual project's key.
- **As a Project Owner**, I check `/dev/status` to confirm whether a delivery problem is upstream (provider) or in my code.

## 5. UI Screens

```
/dev                        (landing + quickstart hub)
/dev/quickstart/{channel}   (sms / email / bale / push / otp / unified)
/dev/api                    (interactive reference; tabbed by tag)
/dev/playground/{operationId}
/dev/changelog
/dev/status
```

## 6. OpenAPI Generation

```
src/openapi/
  builder.ts          // assembles OpenAPI v3.1 doc from per-route metadata
  zod-to-openapi.ts   // utility to convert zod schemas (used in route handlers) into OpenAPI schemas
  spec.ts             // exports the final document
```

- Each route handler exports a `meta` object alongside its handler: `{ summary, description, tags, request, response }` — zod schemas reused.
- A build step (`bun run typegen` follow-up) writes `public/openapi.json` for tooling consumers.

## 7. API Specification

- `GET /v1/openapi.json` — the spec (cached 5 min)
- `GET /v1/openapi.yaml`
- `GET /v1/changelog.json` — { version, date, entries[] }
- `GET /v1/status` — { overall, channels: { sms: {ok}, email: {...} } }

The reference renderer (Scalar) loads `/v1/openapi.json` directly.

## 8. Data Model

`prisma/schema/changelog.prisma`:

```prisma
model ApiChangelogEntry {
  id          String   @id @default(cuid(2))
  version     String   // "2026-05-15"
  title       String
  body        String   @db.Text
  kind        String   // added | changed | deprecated | removed | fixed
  publishedAt DateTime @default(now())

  @@index([publishedAt])
  @@map("api_changelog")
}
```

Status state is computed (not stored) — combines:
- Per-provider `ProviderCredential.status` and `lastTestedAt` (Feature 14).
- Rolling 5-min failure rate from Redis counters (Feature 13 in-flight buckets).

## 9. Non-Functional Requirements

- OpenAPI spec is **always in sync** with code: a CI step compares the generated spec to the committed one (`public/openapi.json`) and fails on drift.
- Playground requests inject the dashboard user's currently-selected project/env key automatically (with a clearly visible "this will count against your quota" banner).
- Status checks run every 60s in the background and are cached.

## 10. Acceptance Criteria

- [ ] `/v1/openapi.json` validates against the OpenAPI 3.1 schema.
- [ ] Reference renderer shows every `/v1/*` endpoint with examples.
- [ ] A new developer can complete the SMS quickstart in <5 minutes.
- [ ] Playground "Try it" hits real backend and shows the response.
- [ ] Status page degrades clearly when a provider is failing.
- [ ] CI fails if `public/openapi.json` is out of date.

## 11. Open Questions

- Auto-publish SDKs to npm? **Phase 4** — until then, we link to `openapi-generator-cli` commands.
- Embedded sandbox keys (no real cost) for the playground? **Phase 4** — too much DB plumbing for MVP.

---

## 12. Implementation Prompt

```text
ROLE
You are a senior full-stack engineer building the developer portal + OpenAPI surface.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Better Auth's openAPI() plugin already publishes auth routes. Our /v1/* routes need to be added.
- Route handlers already use zod for request validation (Features 01–09). Reuse the schemas.

OBJECTIVE
Implement Feature 17: OpenAPI generation pipeline, the embedded reference renderer, quickstart pages, playground, changelog, and status page.

INPUTS TO READ FIRST
1. docs/17-developer-portal-and-openapi.md
2. docs/00-product-roadmap.md (TTFS metric is the north star here)
3. docs/01..09 (the routes that need to appear)
4. Scalar's React component README, or Stoplight Elements README (pick the lightest one)
5. zod-to-openapi or @asteasolutions/zod-to-openapi
6. Next.js 16 docs for static + dynamic route handlers

CONSTRAINTS
- Each route handler MUST export `meta` alongside its `GET/POST/...`. Build a small `defineRoute({ meta, handler })` helper to enforce this.
- spec.ts merges Better Auth's openAPI output with our /v1/* meta to produce a single document.
- "Try it" in playground uses the user's currently selected (project, environment) and the live API key (masked except first/last 4 chars). Inject a banner: "this counts against your quota".
- CI step: `bun run check-openapi` runs the builder and diffs against public/openapi.json. Fail the build on drift. (Add to lint/typecheck script chain.)

DELIVERABLES
- src/openapi/{builder,zod-to-openapi,spec}.ts
- src/lib/api/defineRoute.ts (wraps a handler + meta)
- A migration script that wraps existing /v1/* handlers with defineRoute and adds meta.
- src/app/v1/openapi.json/route.ts
- src/app/v1/openapi.yaml/route.ts
- src/app/v1/changelog.json/route.ts
- src/app/v1/status/route.ts
- src/app/dev/page.tsx
- src/app/dev/quickstart/[channel]/page.tsx
- src/app/dev/api/page.tsx
- src/app/dev/playground/[operationId]/page.tsx
- src/app/dev/changelog/page.tsx
- src/app/dev/status/page.tsx
- prisma/schema/changelog.prisma
- public/openapi.json (committed; regenerated by CI)
- A `bun run openapi:build` script in package.json

STEP PLAN
1. defineRoute helper + meta type.
2. zod-to-openapi conversion (handle nested objects, unions, refinements).
3. builder.ts that walks the file system or a registry to collect metas.
4. /v1/openapi.{json,yaml} routes.
5. Reference renderer page (Scalar or Stoplight) consuming the spec URL.
6. Quickstart pages with snippets in cURL / TS / Python / PHP.
7. Playground (one operation per page, dynamic form from the operation's request schema).
8. Changelog read model + page; status route + page (calls Feature-14 test() per provider, caches 60s).
9. CI script + commit refreshed public/openapi.json.

DEFINITION OF DONE
- `/v1/openapi.json` validates and includes every /v1/* route with examples.
- "Try it" successfully sends a real request and shows the response.
- TTFS user test: a new account holder can send their first SMS in <5 minutes.
- CI fails on OpenAPI drift.
- `bun run check-types`, `bun run lint` pass.

OUT OF SCOPE
- Auto-published SDK packages.
- Separate sandbox accounts / fake provider mode.
- Hosted public status page (the in-app one is enough for MVP).
```
