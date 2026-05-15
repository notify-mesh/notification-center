# Feature 11 — Admin Panel: Projects & Environments

> **Status:** Draft · **Phase:** 2 · **Depends on:** Feature 16 (RBAC)

## 1. Summary

Customer-facing project CRUD and environment management, surfaced inside the dashboard for both Platform Admins (cross-project view) and Project Owners (their own projects). Each Project owns multiple `ProjectEnvironment` rows (production, staging, …); each environment owns a single `ApiKey` and per-environment **settings** like default channel order, default locale, and provider-credential pointers.

## 2. Problem & Motivation

The `Project` and `ProjectEnvironment` models already exist in `prisma/schema/projects.prisma`, but there is no UI. Customers need to create projects, see usage at a glance, switch environments, and edit per-environment settings without touching the DB.

## 3. Goals & Non-Goals

### Goals
- Create project (auto-creates `production` and `development` environments with a default API key each).
- Edit project (name, description, slug — slug edits invalidate cached URLs and require a confirm dialog).
- Environment management: add / archive / mark default.
- Environment settings editor: default channels, default locale, default `from`/sender per channel, feature flags (e.g., `enableBaleFallback`).
- Activity feed per project (sends in last 24h, failures, top template).
- "Switch environment" picker in the dashboard top-bar, persisted in cookie.

### Non-Goals
- Cross-project budget pooling (Phase 4).
- Project-level billing UI (Phase 4).

## 4. User Stories

- **As a Project Owner**, I create a new project "shop-api" and immediately receive a `production` API key.
- **As a Project Owner**, I add a `staging` environment and copy production's settings into it.
- **As a Project Owner**, I set the default channel order to `[bale, sms]` for production but `[sms]` for staging (cheaper SMS provider sandbox).
- **As a Platform Admin**, I see all projects sorted by 7-day send volume.

## 5. UI Screens

```
/admin/projects                       (list)
/admin/projects/new                   (create wizard)
/admin/projects/[slug]                (overview — sends/24h, failure rate, key health)
/admin/projects/[slug]/environments   (env list + create)
/admin/projects/[slug]/environments/[env]/settings
/admin/projects/[slug]/members        (handled by Feature 16)
/admin/projects/[slug]/danger         (archive project)
```

Top-bar: project + environment picker (cookie: `nc_project`, `nc_env`).

## 6. API Specification

- `GET    /admin/api/projects?q=&cursor=`
- `POST   /admin/api/projects`                      body: `{ name, description?, slug? }`
- `GET    /admin/api/projects/{slug}`
- `PATCH  /admin/api/projects/{slug}`               name, description, slug
- `DELETE /admin/api/projects/{slug}`               soft-archives
- `GET    /admin/api/projects/{slug}/environments`
- `POST   /admin/api/projects/{slug}/environments`  `{ name, description?, copySettingsFrom? }`
- `PATCH  /admin/api/projects/{slug}/environments/{env}`
- `POST   /admin/api/projects/{slug}/environments/{env}/set-default`
- `DELETE /admin/api/projects/{slug}/environments/{env}` archives (except default)
- `GET    /admin/api/projects/{slug}/environments/{env}/settings`
- `PUT    /admin/api/projects/{slug}/environments/{env}/settings`

`PUT settings` body:
```json
{
  "defaultChannels": ["bale", "sms"],
  "defaultLocale": "fa-IR",
  "defaults": {
    "sms":   { "sender": "10004346", "type": "transactional" },
    "email": { "from": "no-reply@app.example", "fromName": "App" }
  },
  "features": { "enableBaleFallback": true }
}
```

## 7. Data Model

The schema already has `Project` and `ProjectEnvironment` with `settings: Json?`. Add:

- A `slug` validator: `/^[a-z0-9](-?[a-z0-9])+$/`, max 40 chars.
- A non-null `defaultEnvironmentId` derived from `isDefault=true` on environment rows (enforce in service code that exactly one environment per project is default).

A `ProjectArchived` flag is already absent; introduce:

```prisma
model Project {
  // ... existing fields ...
  archivedAt    DateTime?
}
```

Add an index helpful for the dashboard:

```prisma
@@index([archivedAt])
```

## 8. Non-Functional Requirements

- Creating a project: in one Prisma transaction → `Project` + `production` env + `development` env + 1 API key per env. Rollback on any failure.
- Slug change: write old slug to an `AdminAuditLog`; existing API keys keep working (key is by id, not slug).
- "Copy settings from" deep-clones JSON (no references).
- Soft-archive: project hidden from default lists; restorable for 30 days; then hard-delete via a background job.

## 9. Acceptance Criteria

- [ ] Wizard creates project + 2 envs + 2 keys atomically.
- [ ] Setting a non-default env to default flips the previous default in the same transaction.
- [ ] Settings editor preserves unknown JSON keys (forward-compat).
- [ ] Archived project shows in `archived` filter only; sending against it returns `404 project_archived`.

## 10. Open Questions

- Allow slug edits at all? **Yes**, with confirmation; rewrite cookies via redirect on edit.
- Per-environment "read-only" mode (kill switch)? **Yes**, add `features.readOnly` flag — channel services check it before sending.

---

## 11. Implementation Prompt

```text
ROLE
You are a senior full-stack engineer building the project + environment management UI.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Existing models in prisma/schema/projects.prisma already cover Project + ProjectEnvironment with `settings Json?`. ApiKey has a one-to-one with ProjectEnvironment via `environmentId @unique`.
- Default environment is signalled by ProjectEnvironment.isDefault=true.
- shadcn config: style "radix-nova", base neutral.

OBJECTIVE
Implement Feature 11: project CRUD, environment CRUD, environment settings editor, and the top-bar project/env picker.

INPUTS TO READ FIRST
1. docs/11-admin-projects-and-environments.md
2. prisma/schema/projects.prisma and api-key.prisma
3. docs/10-admin-user-management.md (audit + guard patterns to reuse)
4. docs/16-admin-rbac-and-teams.md (who-can-do-what)
5. Next.js 16 docs for parallel routes and the `cookies()` API

CONSTRAINTS
- Project + envs + initial API keys MUST be created in one Prisma transaction.
- "isDefault flip" MUST be transactional (false on previous, true on next, asserted with @@unique trick or with a Prisma transaction).
- The env picker uses cookies (`nc_project`, `nc_env`), validated server-side per request — never trust client state.
- Settings editor preserves unknown keys (merge, don't replace).
- All mutations write AdminAuditLog rows using the audit() helper from Feature 10.

DELIVERABLES
- prisma migration adding `archivedAt` to Project (db:push works for dev; document the migrate command)
- src/app/admin/projects/page.tsx
- src/app/admin/projects/new/page.tsx
- src/app/admin/projects/[slug]/page.tsx
- src/app/admin/projects/[slug]/environments/page.tsx
- src/app/admin/projects/[slug]/environments/[env]/settings/page.tsx
- src/app/admin/api/projects/route.ts                                       (GET list, POST)
- src/app/admin/api/projects/[slug]/route.ts                                (GET, PATCH, DELETE)
- src/app/admin/api/projects/[slug]/environments/route.ts                   (GET, POST)
- src/app/admin/api/projects/[slug]/environments/[env]/route.ts             (PATCH, DELETE)
- src/app/admin/api/projects/[slug]/environments/[env]/set-default/route.ts (POST)
- src/app/admin/api/projects/[slug]/environments/[env]/settings/route.ts    (GET, PUT)
- src/components/admin/{ProjectPicker,EnvPicker,EnvSettingsForm,ProjectWizard,...}.tsx

STEP PLAN
1. Add `archivedAt` to Project; run db:generate.
2. Reusable picker components (project + env) backed by cookies.
3. Project wizard: validate slug, create project+envs+keys in one tx.
4. Env CRUD: respect default semantics.
5. Settings editor with merge semantics; expose a Monaco JSON editor for raw view + a friendly form view.

DEFINITION OF DONE
- A new project becomes usable in < 30 seconds end-to-end.
- Picker changes persist across reloads.
- All mutations land in AdminAuditLog.
- Setting `features.readOnly = true` causes channel sends to return 423 (locked).
- `bun run check-types` and lint pass.

OUT OF SCOPE
- Per-project billing.
- Cross-project budget pools.
```
