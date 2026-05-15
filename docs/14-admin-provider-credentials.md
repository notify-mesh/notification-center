# Feature 14 — Admin Panel: Provider Credentials Vault

> **Status:** Draft · **Phase:** 2 · **Depends on:** Feature 11

## 1. Summary

A per-(project, environment) vault that stores credentials and configuration for every provider the platform integrates with (Kavenegar, Bale, Resend, SMTP, VAPID, future Iranian SMS providers). Values are encrypted at rest with **envelope encryption** (data key per credential, KEK derived via HKDF from `BETTER_AUTH_SECRET`). Channel services resolve credentials at request time through a single helper.

## 2. Problem & Motivation

Channel services need credentials. Hard-coding them in `.env` does not scale across many customers and many environments. Storing them plaintext in the DB is unacceptable. This feature provides the trusted indirection.

## 3. Goals & Non-Goals

### Goals
- One `ProviderCredential` row per (project, environment, providerKey).
- Provider catalog defines: required fields, validation, "test connection" endpoint.
- Encrypted at rest with rotation support (rotate KEK without re-encrypting data immediately — wraps data keys).
- "Test connection" button that performs a minimal real call (e.g., Resend `domains.list`, Kavenegar `AccountInfo`, Bale `getMe`).
- Mask values in API responses; reveal only via "Reveal" action that logs to AdminAuditLog.
- Per-credential metadata for cost rates used by Feature 13 (analytics cost).

### Non-Goals
- HSM/KMS integration (Phase 4 — design KEK derivation so we can swap to KMS later).
- Per-customer BYO domain for Resend (Phase 4 — domain verification has its own UX).

## 4. User Stories

- **As a Project Owner**, I paste my Kavenegar API key once and forget about it.
- **As a Project Owner**, I rotate the Bale bot token in staging without affecting production.
- **As a Platform Admin**, I run a "test connection" across all providers in a project to verify health.

## 5. Provider Catalog

`src/providers/catalog.ts` defines:

```ts
type ProviderSpec = {
  key: "kavenegar" | "bale" | "resend" | "smtp" | "vapid" | "ghasedak" | ...;
  channels: Array<"sms" | "bale" | "email" | "push">;
  fields: Array<{
    name: string;
    secret: boolean;
    type: "string" | "number" | "boolean" | "json";
    required: boolean;
    description: string;
    validate?: (v: unknown) => string | null;
  }>;
  test: (creds: Record<string, unknown>) => Promise<{ ok: boolean; message?: string }>;
  pricing?: { unit: string; perUnitIrr?: number }; // optional, default for cost analytics
};
```

Initial entries:
- `kavenegar`: `{ apiKey (secret), senderDefault?, host? }`
- `ghasedak`: `{ apiKey (secret), lineNumberDefault? }`  (stub for Phase 4)
- `bale`: `{ botToken (secret), defaultParseMode? }`
- `resend`: `{ apiKey (secret), defaultFrom?, webhookSecret (secret) }`
- `smtp`: `{ host, port, user, pass (secret), secure }`
- `vapid`: `{ publicKey, privateKey (secret), subject (mailto:) }` — auto-generated if missing

## 6. API Specification

- `GET    /admin/api/.../providers`                                  — list installed providers + status
- `GET    /admin/api/.../providers/{key}`                            — masked fields
- `PUT    /admin/api/.../providers/{key}`                            — upsert
- `POST   /admin/api/.../providers/{key}/test`                       — invoke `test()` adapter
- `POST   /admin/api/.../providers/{key}/reveal`                     — returns plaintext (logs to audit)
- `DELETE /admin/api/.../providers/{key}`
- `GET    /admin/api/providers/catalog`                              — catalog spec for UI

## 7. Encryption Scheme

Envelope encryption:
1. KEK = HKDF-SHA256(BETTER_AUTH_SECRET, salt="nc:kek:v1", info="provider-credentials")
2. Each row generates a 32-byte **DEK** (data encryption key) at write.
3. Each secret field is encrypted with AES-256-GCM using DEK; the DEK itself is AES-256-GCM-wrapped with KEK.
4. Stored shape: `{ wrappedDek, fields: { name: { iv, ct, tag } } }`.
5. Rotation: introduce KEK v2; re-wrap DEKs lazily on next read or via a one-shot job.

## 8. Data Model

`prisma/schema/provider.prisma`:

```prisma
model ProviderCredential {
  id              String   @id @default(cuid(2))
  projectId       String
  environmentId   String
  providerKey     String   // e.g. "kavenegar"
  status          String   @default("untested") // untested | healthy | failing
  lastTestedAt    DateTime?
  lastError       String?
  wrappedDek      String   // base64
  payload         Json     // { fields: { name: { iv, ct, tag } } } and non-secret fields plaintext
  metadata        Json?    @default("{}")   // pricing overrides etc.
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([projectId, environmentId, providerKey])
  @@map("provider_credentials")
}
```

## 9. Non-Functional Requirements

- Channel services call `getProvider(projectId, envId, key)`; it returns a typed credential object with decrypted secrets, cached in-memory (process-local LRU, 60s) and **never** in Redis.
- Test endpoints must time out at 5s and never block the UI for longer.
- Reveal action is rate-limited (max 5/min per user) and logs to AdminAuditLog with `target=ProviderCredential:{id}`.

## 10. Acceptance Criteria

- [ ] Setting a Kavenegar API key and clicking "Test" returns the account info from Kavenegar's `AccountInfo`.
- [ ] Stored values are unreadable in the DB without the KEK.
- [ ] Channel services (Feature 01–04) fetch credentials via the helper, not from `process.env`.
- [ ] Auto-generated VAPID keys persist correctly and survive a server restart.
- [ ] Rotating KEK to v2 and reading credentials still works (lazy re-wrap).

## 11. Open Questions

- KMS or no KMS? **Not in MVP** — design `KEKProvider` interface so we can swap in AWS KMS / Hashicorp Vault later.
- Per-environment override of a project-level credential? **Phase 4** — for now, credentials are strictly per environment.

---

## 12. Implementation Prompt

```text
ROLE
You are a senior full-stack engineer building the provider credentials vault.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Channels read credentials via this helper; do NOT let channels touch process.env directly except for platform-wide settings.
- AEAD utility from Feature 02 (src/lib/crypto/aead.ts) provides AES-256-GCM.

OBJECTIVE
Implement Feature 14: catalog, encrypted CRUD, test-connection adapters, channel-side resolver.

INPUTS TO READ FIRST
1. docs/14-admin-provider-credentials.md
2. docs/01-sms-iranian-providers.md, 02, 03, 04 (which channels need which fields)
3. src/lib/crypto/aead.ts (AEAD helper from Feature 02)
4. Next.js 16 docs for App Router route handlers

CONSTRAINTS
- Implement envelope encryption: per-row DEK, KEK derived via HKDF from BETTER_AUTH_SECRET.
- Provide a `KEKProvider` interface so KMS can replace HKDF later.
- Decrypted secrets MUST NOT enter Redis. In-memory LRU cache only, TTL 60s, max 500 entries.
- Test endpoints run with a 5s timeout; surface the provider error message but never the credential value.
- Reveal endpoint requires fresh session and logs to AdminAuditLog. Throttle 5/min/user.
- Provider catalog is a single TS object exported from src/providers/catalog.ts; all UI flows generate from it.

DELIVERABLES
- prisma/schema/provider.prisma
- src/lib/crypto/kek.ts (HKDF + KEKProvider interface)
- src/providers/catalog.ts
- src/providers/{kavenegar,bale,resend,smtp,vapid}.spec.ts   (test() adapters)
- src/lib/providers/resolver.ts (getProvider + LRU cache)
- src/app/admin/projects/[slug]/environments/[env]/providers/page.tsx
- src/app/admin/projects/[slug]/environments/[env]/providers/[key]/page.tsx
- src/app/admin/api/.../providers/route.ts
- src/app/admin/api/.../providers/[key]/route.ts                       (GET, PUT, DELETE)
- src/app/admin/api/.../providers/[key]/test/route.ts                  (POST)
- src/app/admin/api/.../providers/[key]/reveal/route.ts                (POST)
- src/app/admin/api/providers/catalog/route.ts                         (GET)

STEP PLAN
1. KEK + envelope encrypt helpers.
2. Catalog with field specs + test() adapters.
3. Resolver with LRU cache.
4. CRUD endpoints (mask on read, decrypt on resolve).
5. UI: catalog drives a dynamic form per provider.
6. Refactor channel services to call resolver instead of process.env / catalog lookups.

DEFINITION OF DONE
- Setting Kavenegar key, running test, then sending a real SMS via Feature 01 works end-to-end.
- DB columns hold only ciphertext.
- Reveal requires fresh session and writes audit row.
- `bun run check-types`, `bun run lint` pass.

OUT OF SCOPE
- KMS integration.
- BYO email domain verification.
- Per-key credential overrides.
```
