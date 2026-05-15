# Feature 10 — Admin Panel: User Management

> **Status:** Draft · **Phase:** 2 · **Depends on:** Better Auth (already configured)

## 1. Summary

Operator-facing screens for managing platform users — list, search, view profile, edit, invite, ban/unban, force-logout, impersonate. Built on top of Better Auth's **`admin`**, **`organization`**, **`twoFactor`**, **`passkey`**, **`multiSession`**, and **`lastLoginMethod`** plugins (already wired in `src/lib/auth.ts`). The dashboard is the only consumer; end users do not see these endpoints.

## 2. Problem & Motivation

Better Auth provides the primitives but not the UI. Without a UI, operators must hit raw API endpoints or run SQL — error-prone and not auditable. This feature gives Platform Admins a single screen for routine identity ops.

## 3. Goals & Non-Goals

### Goals
- List + cursor-paginated search by email, username, phone, organization, role, ban status, last-active date.
- View profile: identities (email/username/phone), passkeys, sessions, 2FA status, organizations, login history, audit events.
- Edit: name, email (with verification), role, ban (with reason), unban, force-logout-all-sessions.
- Impersonate (via Better Auth's `admin` plugin with the configured 1-hour session).
- Invite: send an invitation email that creates a sign-up link with a pre-assigned organization role.
- Bulk actions: ban N users, force-logout N users, export filtered list as CSV.

### Non-Goals
- End-user self-service (already supported by Better Auth client; out of scope here).
- Custom SSO providers (Phase 4).

## 4. User Stories

- **As a Platform Admin**, I search users by partial email and ban a suspected abuser; their active sessions are revoked instantly.
- **As a Platform Admin**, I impersonate a customer to reproduce a support ticket and the action is recorded in the audit trail.
- **As a Platform Admin**, I invite a new operator with role `support`; they receive an email with a one-time signup link.

## 5. UI Screens

```
/admin/users                  (list + filters + bulk actions)
/admin/users/[id]             (profile)
  ├─ Overview                 (identities, last login, country, IP)
  ├─ Sessions                 (active sessions list with revoke)
  ├─ Security                 (2FA status, passkeys, password reset)
  ├─ Organizations            (memberships, roles, leave/remove)
  ├─ Activity                 (audit events filtered to this user)
  └─ Danger zone              (ban, unban, force-logout, delete)
/admin/users/invite
```

Components: shadcn `radix-nova` data table, command palette for quick user lookup, drawer-based detail views to avoid full page reloads.

## 6. API Specification

The dashboard talks to **internal** admin endpoints, distinct from the customer-facing `/v1` surface. They live under `/admin/api/*` and require the caller to be a signed-in user with role `ADMIN` (per `User.role` enum in `prisma/schema/user.prisma`) or to be an org-level admin via Better Auth's organization plugin.

- `GET    /admin/api/users?q=&role=&banned=&cursor=`
- `GET    /admin/api/users/{id}`
- `PATCH  /admin/api/users/{id}`                          (name, email, role)
- `POST   /admin/api/users/{id}/ban`                      (body: reason, until?)
- `POST   /admin/api/users/{id}/unban`
- `POST   /admin/api/users/{id}/force-logout`
- `POST   /admin/api/users/{id}/impersonate`              (returns Set-Cookie)
- `POST   /admin/api/users/invite`                        (body: email, role, organizationId?)
- `POST   /admin/api/users/bulk`                          (action: ban|force-logout|delete, ids: [])
- `GET    /admin/api/users.csv?...`                       (export)

All non-GET requests require **fresh session** (re-auth within 5 min) for destructive operations (`ban`, `delete`, `impersonate`).

## 7. Data Model

No new tables. Reuses:
- `User` (`prisma/schema/user.prisma`) — has `role: UserRole`.
- Better Auth's session/account/passkey/twoFactor tables created by the Prisma adapter.

Add an `AdminAuditLog` model (also used by Feature 15):

```prisma
model AdminAuditLog {
  id            String   @id @default(cuid(2))
  actorUserId   String
  action        String   // user.ban, user.unban, user.impersonate, ...
  targetType    String   // user | project | apiKey | webhook | ...
  targetId      String
  diff          Json?    // before/after for edits
  ip            String?
  userAgent     String?
  reason        String?
  createdAt     DateTime @default(now())

  @@index([actorUserId, createdAt])
  @@index([targetType, targetId, createdAt])
  @@map("admin_audit_logs")
}
```

## 8. Non-Functional Requirements

- All admin endpoints write an `AdminAuditLog` row.
- Impersonation cookie is clearly marked in the UI (`Banner: You are impersonating <name>`); shows time remaining.
- The "ban" action calls Better Auth's admin plugin (`banUserMessage` and `defaultBanReason` are already configured) and triggers a `user.banned` event for webhooks.
- CSV export is streamed; no full materialization into memory.

## 9. Acceptance Criteria

- [ ] Search returns results within 200ms p95 on a 100k-user DB (indexes on `email`, `role`, `banned`).
- [ ] Banning revokes all active sessions immediately and reflects in the UI within 1s (server-side check on next request).
- [ ] Impersonation creates a 1-hour session, banner is visible, ending the impersonation returns to the admin's original session.
- [ ] Every destructive action lands in `AdminAuditLog` with the actor's IP/UA.
- [ ] Invite email link is single-use and expires in 7 days.

## 10. Open Questions

- Should we surface "compromised password" status from Better Auth's `haveIBeenPwned` plugin? **Yes**, as a security badge on the profile.
- Bulk delete: hard-delete or soft-delete? **Soft**: mark `User.isActive=false`, retain rows for audit and analytics. Hard-delete is a separate Phase-4 GDPR/data-retention feature.

---

## 11. Implementation Prompt

```text
ROLE
You are a senior full-stack engineer building the admin user-management dashboard.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Better Auth is the identity layer (src/lib/auth.ts). Use its server APIs directly — DO NOT bypass it with raw Prisma writes for user state.
- UI framework: Next.js 16 App Router, Tailwind v4, shadcn/ui (style "radix-nova", base "neutral").
- shadcn components live under src/components/ui/. New shared components under src/components/admin/.
- All routes live under src/app/admin/... and src/app/admin/api/...
- Restrict /admin/* via a server-side check in a layout: User.role === "ADMIN" OR membership in the platform "ops" organization with role admin.

OBJECTIVE
Implement Feature 10: list/search, profile, edit, ban/unban, force-logout, impersonate, invite, bulk actions.

INPUTS TO READ FIRST
1. docs/10-admin-user-management.md
2. CLAUDE.md, AGENTS.md
3. src/lib/auth.ts (note the plugins enabled — admin, organization, twoFactor, passkey, multiSession, lastLoginMethod)
4. Better Auth admin-plugin docs (search node_modules/better-auth for plugin readme or types)
5. Next.js 16 App Router docs in node_modules/next/dist/docs/ (server components, server actions, routing)
6. components.json (shadcn config — style "radix-nova", neutral)

CONSTRAINTS
- Server-side guard MUST run in a layout (src/app/admin/layout.tsx) and redirect to /sign-in if absent.
- Destructive admin actions REQUIRE a fresh session (within 5 minutes) — implement a `requireFreshSession()` helper.
- Every state-changing action writes AdminAuditLog. Use a single `audit()` helper.
- Tables use the shadcn DataTable pattern with TanStack Table v8.
- Use server actions where possible; fall back to /admin/api/* route handlers only for things that must be CSR (CSV streaming).
- Impersonation uses Better Auth's admin plugin API — do not hand-roll a session.

DELIVERABLES
- prisma/schema/admin-audit.prisma (AdminAuditLog model)
- src/lib/admin/guard.ts (requireAdmin, requireFreshSession)
- src/lib/admin/audit.ts (audit() helper)
- src/app/admin/layout.tsx
- src/app/admin/users/page.tsx                          (list + filters + bulk)
- src/app/admin/users/[id]/page.tsx                     (profile shell + tabs)
- src/app/admin/users/[id]/(tabs)/{overview,sessions,security,organizations,activity,danger}/page.tsx
- src/app/admin/users/invite/page.tsx
- src/app/admin/api/users/route.ts                      (GET list)
- src/app/admin/api/users/[id]/route.ts                 (GET, PATCH)
- src/app/admin/api/users/[id]/ban/route.ts             (POST)
- src/app/admin/api/users/[id]/unban/route.ts           (POST)
- src/app/admin/api/users/[id]/force-logout/route.ts    (POST)
- src/app/admin/api/users/[id]/impersonate/route.ts     (POST)
- src/app/admin/api/users/invite/route.ts               (POST)
- src/app/admin/api/users/bulk/route.ts                 (POST)
- src/app/admin/api/users.csv/route.ts                  (GET streaming CSV)
- src/components/admin/{UserTable,UserFilters,UserProfileHeader,BulkActionsBar,...}.tsx

STEP PLAN
1. AdminAuditLog schema + db:generate.
2. Guard helpers and the audit helper.
3. Layout with role gate.
4. List page with TanStack Table and URL-state filters.
5. Profile shell + tabs (server-rendered).
6. Mutation endpoints (and server actions for in-place edits).
7. Invite flow (uses Better Auth's organization-invitation under the hood when org is provided).
8. CSV export route (streaming).

DEFINITION OF DONE
- A platform admin can search, view, ban, unban, impersonate, force-logout, and invite users from the dashboard.
- All destructive actions appear in AdminAuditLog within the same request.
- Impersonation banner is visible and ends correctly.
- `bun run check-types`, `bun run lint` pass.

OUT OF SCOPE
- Self-service screens for end users.
- Custom SSO providers.
- GDPR hard-delete workflow.
```
