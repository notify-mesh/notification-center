# Feature 16 — Admin Panel: RBAC, Organizations & Teams

> **Status:** Draft · **Phase:** 3 · **Depends on:** Better Auth's `organization` plugin (already configured in `src/lib/auth.ts`)

## 1. Summary

Permissions live on top of Better Auth's organization + teams primitives (already wired with dynamic access control, up to 100 roles/org, 1000 members/team, 1000 teams/org). This feature surfaces the role and permission model in the dashboard, defines the **default permission catalog**, and binds permissions to the actions exposed by Features 10–15.

## 2. Problem & Motivation

Without a defined permission catalog, the dashboard checks degrade into "is user admin?" booleans. We need a small, durable set of named permissions that the rest of the platform can consult.

## 3. Goals & Non-Goals

### Goals
- A permission catalog with stable string ids (e.g. `notifications.send`, `apikeys.rotate`, `logs.read.raw`).
- A small set of built-in roles per organization: `owner`, `admin`, `developer`, `support`, `billing`, `viewer`.
- Custom roles with checkbox UI mapping role → permissions.
- Team-level scoping: a permission can be granted "org-wide" or limited to specific teams (and via team → projects).
- Membership management screens (invite, role change, remove). Many flows already exist via Better Auth's plugin; this feature wraps them.
- Hooks already configured (`afterAcceptInvitation`, `afterCreateOrganization`, `afterAddMember`, `afterAddTeamMember`) — extend them to write `AdminAuditLog`.

### Non-Goals
- Inter-org permissions (Phase 4).
- ABAC / attribute-based rules (Phase 4).

## 4. User Stories

- **As an Org Owner**, I create a "Support" role that can read logs but not rotate keys.
- **As an Org Admin**, I invite a developer into the "Mobile" team scoped to the `shop-api` project.
- **As a Developer**, I cannot see the Provider Credentials screen even though I'm in the org.

## 5. Permission Catalog (initial)

| Permission | Scope | Description |
|---|---|---|
| `notifications.send` | project | Use `/v1/*` send endpoints |
| `templates.read` | project | View templates |
| `templates.write` | project | Create/edit/publish templates |
| `apikeys.read` | project | View masked keys & usage |
| `apikeys.write` | project | Create/edit keys |
| `apikeys.rotate` | project | Rotate keys |
| `apikeys.revoke` | project | Revoke keys |
| `apikeys.reveal` | project | Reveal a plaintext key (one-time) |
| `providers.read` | project | View provider configs |
| `providers.write` | project | Edit provider configs |
| `providers.reveal` | project | Reveal provider secrets |
| `logs.read` | project | View notification logs (hashed recipients) |
| `logs.read.raw` | project | View raw recipient identifiers in logs |
| `analytics.read` | project | View analytics dashboards |
| `webhooks.read` | project | View webhook subscriptions |
| `webhooks.write` | project | Create/edit webhooks |
| `users.read` | platform | List/search platform users (Platform Admin only) |
| `users.ban` | platform | Ban/unban users |
| `users.impersonate` | platform | Impersonate any user |
| `org.manage` | org | Edit org settings, roles, members |

Built-in role → permissions mapping is encoded in `src/permissions/catalog.ts`.

## 6. UI Screens

```
/admin/projects/[slug]/members                    (org members scoped to this project's teams)
/admin/organization                               (current user's org)
  ├─ Members
  ├─ Teams
  ├─ Roles                                        (custom role editor)
  ├─ Invitations
  └─ Settings
```

## 7. API Specification

Mostly wrappers around Better Auth's organization plugin endpoints, but presented via `/admin/api/org/*` with our audit hooks:

- `GET    /admin/api/org`
- `PATCH  /admin/api/org`
- `GET    /admin/api/org/members?role=&teamId=`
- `POST   /admin/api/org/members/invite`
- `PATCH  /admin/api/org/members/{id}`         (role / team membership)
- `DELETE /admin/api/org/members/{id}`
- `GET    /admin/api/org/roles`
- `POST   /admin/api/org/roles`                (custom role)
- `PATCH  /admin/api/org/roles/{id}`
- `DELETE /admin/api/org/roles/{id}`
- `GET    /admin/api/org/teams`
- `POST   /admin/api/org/teams`
- `PATCH  /admin/api/org/teams/{id}`
- `DELETE /admin/api/org/teams/{id}`
- `GET    /admin/api/permissions/catalog`

## 8. Enforcement

`src/lib/permissions/can.ts`:

```ts
type Subject = { userId: string; orgId?: string; teamIds: string[]; isPlatformAdmin: boolean };
type Resource = { projectId?: string; orgId?: string };

export async function can(subject: Subject, permission: string, resource?: Resource): Promise<boolean>;
```

Used by every admin route handler at the top:

```ts
if (!(await can(subject, "apikeys.rotate", { projectId }))) {
  return new Response("Forbidden", { status: 403 });
}
```

Platform-scope permissions (`users.*`) are granted only via `User.role = "ADMIN"`.

## 9. Non-Functional Requirements

- Permission checks p95 < 5ms; cache memberships in Redis with key `acl:{userId}` for 60s (invalidate on role/team change via Better Auth's organization hooks).
- Built-in roles cannot be deleted; can be cloned to a custom role.
- Custom roles capped per org by Better Auth's `maximumRolesPerOrganization: 100` (already configured).

## 10. Acceptance Criteria

- [ ] Catalog is rendered in UI; checking boxes saves to the role record.
- [ ] An admin can see all projects of their org; a developer can see only projects of teams they belong to.
- [ ] Revoking `apikeys.rotate` from a role takes effect within 60s (cache TTL) or immediately upon explicit invalidation.
- [ ] Better Auth hooks (`afterAddMember`, etc.) all write `AdminAuditLog` rows.

## 11. Open Questions

- Where do we draw the line between Platform Admin (User.role) and Org Owner? **Platform Admin** = anyone managing the platform itself; **Org Owner** = managing a single tenant. Some Platform Admin permissions short-circuit org checks (e.g., they can see any project).
- Per-environment role scoping? **Phase 4** — for now, scope is per project (env is inherited).

---

## 12. Implementation Prompt

```text
ROLE
You are a senior full-stack engineer wiring the permission catalog and admin RBAC UI.

CONTEXT
- Stack/conventions per CLAUDE.md & AGENTS.md.
- Better Auth's organization plugin is already configured (src/lib/auth.ts) with dynamic access control, teams, and hooks.
- Hooks (afterAcceptInvitation, afterCreateOrganization, afterAddMember, afterAddTeamMember, afterCreateInvitation, afterDeleteOrganization) currently console.log — replace with AdminAuditLog writes.

OBJECTIVE
Implement Feature 16: permission catalog, built-in roles, custom roles UI, member/team management screens, and the `can()` helper used by every admin route.

INPUTS TO READ FIRST
1. docs/16-admin-rbac-and-teams.md
2. src/lib/auth.ts (read the organization plugin config carefully)
3. Better Auth organization-plugin README under node_modules/better-auth
4. docs/10-admin-user-management.md (AdminAuditLog usage)
5. Next.js 16 docs for App Router middleware and server actions

CONSTRAINTS
- DO NOT duplicate role storage; use Better Auth's roles tables. Permissions are encoded as JSON on the role record.
- `can()` cache lives in Redis under `acl:{userId}` with 60s TTL; invalidated by the organization hooks.
- The catalog is a TS object in src/permissions/catalog.ts — single source of truth.
- Built-in roles are upserted on org creation (handle in afterCreateOrganization hook).
- Permission checks live at the top of every admin route handler — provide a `withPermission(perm, handler)` wrapper.

DELIVERABLES
- src/permissions/catalog.ts
- src/lib/permissions/can.ts
- src/lib/permissions/cache.ts (Redis ACL cache)
- src/lib/permissions/withPermission.ts (route wrapper)
- Replace console.log in src/lib/auth.ts organization hooks with AdminAuditLog writes and ACL-cache invalidation.
- src/app/admin/organization/page.tsx
- src/app/admin/organization/{members,teams,roles,invitations,settings}/page.tsx
- src/app/admin/projects/[slug]/members/page.tsx
- src/app/admin/api/org/*  (all endpoints from §7)
- src/app/admin/api/permissions/catalog/route.ts

STEP PLAN
1. Catalog + built-in role definitions.
2. `can()` + Redis cache + invalidation in hooks.
3. `withPermission` wrapper; sweep existing admin endpoints (Features 10–15) to use it.
4. UI screens (org settings, members, teams, roles editor).
5. Auto-upsert built-in roles on org creation.
6. AdminAuditLog from the hooks.

DEFINITION OF DONE
- Granting/revoking a permission flips access within ≤ 60s (or immediately after explicit invalidation).
- All admin endpoints from Features 10–15 are guarded by withPermission.
- A custom role created in UI is selectable on member-edit.
- `bun run check-types`, `bun run lint` pass.

OUT OF SCOPE
- Inter-org permissions.
- ABAC / attribute-based rules.
- Per-environment role scoping.
```
