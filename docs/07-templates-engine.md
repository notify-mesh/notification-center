# Feature 07 — Templates Engine

> **Status:** Draft · **Phase:** 2 · **Depends on:** Feature 11 (Projects/environments)

## 1. Summary

A template management system with **versioning, per-channel variants, locales, and live preview**. Templates render via React Email (HTML) and Handlebars (text, SMS, push body). Templates are scoped to a **project** (shared across environments) but each version has a status (`draft / published / archived`) and only `published` versions are sendable from production environments.

## 2. Problem & Motivation

Channel-specific endpoints accept inline content, but production teams want central templates — i18n, version history, approval workflow, and the ability to swap copy without code changes.

## 3. Goals & Non-Goals

### Goals
- CRUD templates with per-channel + per-locale variants.
- Versioning: every edit creates a new version; only one `published` per (template, channel, locale).
- Variable schema declared as JSON Schema; validate inputs before render.
- Live preview endpoint that returns rendered HTML/text without sending.
- Per-environment "publish gates": templates marked `draft` are sendable only from `non-production` envs.
- Bulk import/export via JSON.

### Non-Goals
- WYSIWYG visual editor (Phase 4 — out of scope here; the dashboard ships a Monaco-based code editor only).
- A/B testing of templates (Phase 4).

## 4. User Stories

- **As a Project Owner**, I edit the `welcome-email` template and publish it; only the new version is used from now on.
- **As an Integrator**, I send `{ template: "welcome-email", variables: { name: "علی" }, locale: "fa-IR" }`.
- **As a Project Owner**, I see the variable schema and a sample render in the dashboard.
- **As a Project Owner**, I copy the `production` template back to `staging` to test a change.

## 5. API Specification

### 5.1 Template CRUD

- `GET    /v1/templates`                       — list (filter by channel, locale, status)
- `POST   /v1/templates`                       — create new template
- `GET    /v1/templates/{name}`                — latest version per (channel, locale)
- `PUT    /v1/templates/{name}`                — creates a new version
- `DELETE /v1/templates/{name}`                — soft-delete (archives latest)
- `POST   /v1/templates/{name}/publish`        — publish a specific version
- `POST   /v1/templates/{name}/preview`        — render with provided variables, no send
- `GET    /v1/templates/{name}/versions`       — list versions

### 5.2 Template create body

```json
{
  "name": "welcome-email",
  "displayName": "Welcome Email",
  "description": "Sent on signup",
  "variableSchema": {
    "type": "object",
    "properties": { "name": { "type": "string" } },
    "required": ["name"]
  },
  "variants": [
    {
      "channel": "email",
      "locale": "fa-IR",
      "subject": "خوش آمدید {{name}}",
      "html": "<p>سلام {{name}}!</p>",
      "text": "سلام {{name}}!"
    },
    {
      "channel": "email",
      "locale": "en-US",
      "subject": "Welcome, {{name}}",
      "html": "<p>Hi {{name}}!</p>",
      "text": "Hi {{name}}!"
    }
  ]
}
```

### 5.3 Preview

```json
{ "channel": "email", "locale": "fa-IR", "variables": { "name": "علی" } }
```

Returns `{ "subject": "...", "html": "...", "text": "..." }`.

## 6. Data Model

`prisma/schema/template.prisma`:

```prisma
model Template {
  id            String             @id @default(cuid(2))
  projectId     String
  name          String             // unique per project
  displayName   String
  description   String?
  variableSchema Json
  archived      Boolean            @default(false)
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  variants      TemplateVariant[]

  @@unique([projectId, name])
  @@index([projectId])
  @@map("templates")
}

model TemplateVariant {
  id           String              @id @default(cuid(2))
  templateId   String
  template     Template            @relation(fields: [templateId], references: [id], onDelete: Cascade)
  channel      String              // sms | email | bale | push
  locale       String              // BCP-47
  version      Int
  status       TemplateStatus      @default(DRAFT)
  subject      String?             // email only
  html         String?             @db.LongText
  text         String?             @db.Text
  pushTitle    String?             // push only
  pushBody     String?             // push only
  createdAt    DateTime            @default(now())

  @@unique([templateId, channel, locale, version])
  @@index([status])
  @@map("template_variants")
}

enum TemplateStatus { DRAFT PUBLISHED ARCHIVED }
```

## 7. Rendering Pipeline

```
src/templates/
  render.ts        // input: { template, channel, locale, variables } → { subject?, html?, text?, pushTitle?, pushBody? }
  handlebars.ts    // helpers (formatDate(tz=Asia/Tehran), digits('fa'), etc.)
  react-email.ts   // optional: dynamic import of React components registered per template
  schema.ts        // ajv validation of variables vs. variableSchema
```

- Cache rendered output in Redis with key `tmpl:{projectId}:{name}:{channel}:{locale}:{version}:{varsHash}`, TTL 5 min.
- Handlebars helpers must include: Farsi/English digit conversion, Tehran-tz date formatting, currency in IRR/toman, conditional locale fallback.

## 8. Non-Functional Requirements

- Render must be **pure** (no I/O beyond Redis cache).
- Variable validation rejects with `422 invalid_variables { errors: [...] }` before render.
- Editing a published variant is forbidden — it creates a new draft version instead. Publishing the new version atomically demotes the previous one.
- Diff view: dashboard surfaces a side-by-side diff of any two versions (UI in Feature 17).

## 9. Acceptance Criteria

- [ ] Create → list → preview → publish flow works end-to-end.
- [ ] Sending `template: x` with `locale: fa-IR` uses the published `(x, channel, fa-IR)` variant; falls back to `en-US` if not available.
- [ ] Editing a published variant creates a new draft and does NOT mutate the published one.
- [ ] `bun run check-types` and lint pass.

## 10. Open Questions

- Should we ship a small library of starter templates (login OTP, password reset, welcome)? **Yes** — Phase 2; loaded by `db:seed --prepare --templates`.
- React Email components vs. plain HTML in DB? **Both**: HTML in DB is the source of truth; React Email is opt-in by registering a component name in the variant record (Phase 3).

---

## 11. Implementation Prompt

```text
ROLE
You are a senior backend engineer building a templates engine.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Handlebars and React Email packages are already in the dependency tree (@betternotify/handlebars, @betternotify/react-email).
- Templates are referenced by name from channel services (Feature 01/02/03/04) and the unified API (Feature 06).

OBJECTIVE
Implement Feature 07: template CRUD, versioning, preview, and the rendering pipeline.

INPUTS TO READ FIRST
1. docs/07-templates-engine.md (this feature)
2. docs/03-email-channel.md (where rendered output is consumed)
3. @betternotify/handlebars and @betternotify/react-email READMEs
4. Next.js 16 route handler docs

CONSTRAINTS
- Use AJV for variableSchema validation.
- Renders are cached in Redis keyed by `tmpl:{projectId}:{name}:{channel}:{locale}:{version}:{varsHash}` with TTL 300s. Hash variables with sha256(json-stable-stringify(vars)).
- Publishing a new version atomically demotes the previous published one in the same Prisma transaction.
- Locale fallback order: requested → en-US → first available published.
- Handlebars helpers MUST include: `faDigits`, `enDigits`, `formatDate (tz=Asia/Tehran)`, `toman`, `eq`, `gt`, `gte`, `lt`, `lte`.

DELIVERABLES
- prisma/schema/template.prisma
- src/templates/{render,handlebars,react-email,schema}.ts
- src/api/v1/templates/route.ts                              (GET list + POST create)
- src/api/v1/templates/[name]/route.ts                       (GET, PUT, DELETE)
- src/api/v1/templates/[name]/publish/route.ts               (POST)
- src/api/v1/templates/[name]/preview/route.ts               (POST)
- src/api/v1/templates/[name]/versions/route.ts              (GET)

STEP PLAN
1. Schema + db:generate.
2. schema.ts (AJV compile + validate).
3. handlebars.ts (custom helpers).
4. render.ts (resolve variant → render → cache).
5. Route handlers.
6. Wire channel services (Feature 03 et al.) to call render.ts when `template` is provided.

DEFINITION OF DONE
- Roundtrip create → publish → preview → send with template returns rendered content.
- Locale fallback works.
- Variable validation rejects invalid bodies with detailed errors.
- `bun run check-types`, `bun run lint` clean.

OUT OF SCOPE
- WYSIWYG editor.
- A/B testing.
- Domain-verified email "From" management (Feature 14).
```
