import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import { recordAdminActivity } from "@root/lib/audit";
import { roleSchema, permissionSchema, assignmentSchema } from "@root/schemas/permissions";

/**
 * ACL procedures backing the Permissions Management page.
 *
 * Reads
 * -----
 *   • `listRoles`        — every role available to the active org
 *                          (built-in + org-scoped custom roles)
 *   • `listPermissions`  — the (action, subject) catalog
 *   • `listAssignments`  — `AclUserRole` rows + flattened user info
 *
 * Writes
 * ------
 *   • `createRole`       — new org-scoped role
 *   • `updateRolePerms`  — replace a role's permission set
 *   • `deleteRole`       — remove a non-built-in role
 *   • `grantUserRole`    — assign role to user (org/project/env scope)
 *   • `revokeUserRole`   — remove a grant
 */

interface ErrorsLike {
  NOT_FOUND: () => Error;
  UNAUTHORIZED: () => Error;
  CONFLICT: () => Error;
  FORBIDDEN: () => Error;
}

async function activeOrg(context: ORPCContext, errors: ErrorsLike): Promise<string> {
  try {
    return await resolveActiveOrgId(context);
  } catch (e) {
    if (e instanceof ActiveOrgError) {
      throw e.kind === "UNAUTHORIZED" ? errors.UNAUTHORIZED() : errors.NOT_FOUND();
    }
    throw e;
  }
}

/**
 * Roles available to the caller = built-ins (`organizationId = null`) +
 * org-scoped custom roles. Permissions are joined in.
 */
export const listRoles = authedProcedure
  .route({
    method: "GET",
    path: "/permissions/roles",
    summary: "List roles available to the active organization",
    tags: ["permissions"],
  })
  .output(z.object({ roles: z.array(roleSchema) }))
  .handler(async ({ context, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const rows = await prismaDbClient.aclRole.findMany({
      where: {
        OR: [{ organizationId: null }, { organizationId }],
      },
      orderBy: [{ priority: "desc" }, { name: "asc" }],
      include: {
        permissions: { include: { permission: true } },
      },
    });
    return {
      roles: rows.map((r) => ({
        id: r.id,
        name: r.name,
        displayName: r.displayName,
        description: r.description,
        organizationId: r.organizationId,
        isBuiltIn: r.isBuiltIn,
        isActive: r.isActive,
        priority: r.priority,
        inheritsFromRoleId: r.inheritsFromRoleId,
        permissions: r.permissions.map((p) => ({
          action: p.permission.action,
          subject: p.permission.subject,
          inverted: p.inverted,
        })),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

export const listPermissions = authedProcedure
  .route({
    method: "GET",
    path: "/permissions/catalog",
    summary: "List the (action, subject) permission catalog",
    tags: ["permissions"],
  })
  .output(z.object({ permissions: z.array(permissionSchema) }))
  .handler(async () => {
    const rows = await prismaDbClient.aclPermission.findMany({
      orderBy: [{ category: "asc" }, { subject: "asc" }, { action: "asc" }],
    });
    return {
      permissions: rows.map((p) => ({
        id: p.id,
        action: p.action,
        subject: p.subject,
        displayName: p.displayName,
        description: p.description,
        category: p.category,
        isBuiltIn: p.isBuiltIn,
      })),
    };
  });

export const listAssignments = authedProcedure
  .route({
    method: "GET",
    path: "/permissions/assignments",
    summary: "List who-has-what role grants",
    description:
      "Scopes to the active org by default. Pass `userId` / `projectId` / `environmentId` to narrow further.",
    tags: ["permissions"],
  })
  .input(
    z.object({
      userId: z.string().optional(),
      projectId: z.string().optional(),
      environmentId: z.string().optional(),
    }),
  )
  .output(z.object({ assignments: z.array(assignmentSchema) }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);

    const rows = await prismaDbClient.aclUserRole.findMany({
      where: {
        organizationId: input.projectId || input.environmentId ? undefined : organizationId,
        userId: input.userId,
        projectId: input.projectId,
        environmentId: input.environmentId,
      },
      orderBy: { createdAt: "desc" },
      include: {
        role: true,
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    });
    return {
      assignments: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        user: { id: r.user.id, name: r.user.name, email: r.user.email, image: r.user.image },
        roleId: r.roleId,
        roleName: r.role.displayName,
        organizationId: r.organizationId,
        projectId: r.projectId,
        environmentId: r.environmentId,
        startsAt: r.startsAt ? r.startsAt.toISOString() : null,
        endsAt: r.endsAt ? r.endsAt.toISOString() : null,
        grantedReason: r.grantedReason,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

export const createRole = authedProcedure
  .route({
    method: "POST",
    path: "/permissions/roles",
    summary: "Create a custom org-scoped role",
    tags: ["permissions"],
  })
  .input(
    z.object({
      name: z
        .string()
        .min(2)
        .max(40)
        .regex(/^[a-z0-9](-?[a-z0-9])*$/, "lowercase alpha-numeric, dash-separated"),
      displayName: z.string().min(2).max(80),
      description: z.string().max(500).optional(),
      priority: z.number().int().min(0).max(1000).default(10),
      permissionIds: z.array(z.string()).default([]),
      inheritsFromRoleId: z.string().nullable().optional(),
    }),
  )
  .output(z.object({ roleId: z.string() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const dupe = await prismaDbClient.aclRole.findFirst({
      where: { organizationId, name: input.name },
    });
    if (dupe) throw errors.CONFLICT();

    const role = await prismaDbClient.$transaction(async (tx) => {
      const r = await tx.aclRole.create({
        data: {
          name: input.name,
          displayName: input.displayName,
          description: input.description,
          organizationId,
          isBuiltIn: false,
          isActive: true,
          priority: input.priority,
          inheritsFromRoleId: input.inheritsFromRoleId ?? null,
        },
      });
      for (const permissionId of input.permissionIds) {
        // eslint-disable-next-line react-doctor/async-await-in-loop
        await tx.aclRolePermission.create({
          data: { roleId: r.id, permissionId, inverted: false },
        });
      }
      return r;
    });

    await recordAdminActivity({
      actor: { userId: context.user.id, email: context.user.email },
      action: "role.create",
      target: { type: "role", id: role.id, label: role.name },
      organizationId,
      after: {
        name: role.name,
        displayName: role.displayName,
        permissionIds: input.permissionIds,
      },
    });

    return { roleId: role.id };
  });

export const updateRolePerms = authedProcedure
  .route({
    method: "PUT",
    path: "/permissions/roles/{roleId}/permissions",
    summary: "Replace the role's permission set",
    description:
      "Pass the full target list of `permissionIds`. Built-in roles are immutable — call returns `FORBIDDEN`.",
    tags: ["permissions"],
  })
  .input(
    z.object({
      roleId: z.string(),
      permissionIds: z.array(z.string()),
    }),
  )
  .output(z.object({ success: z.boolean(), count: z.number().int() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const role = await prismaDbClient.aclRole.findUnique({ where: { id: input.roleId } });
    if (!role) throw errors.NOT_FOUND();
    if (role.isBuiltIn || (role.organizationId && role.organizationId !== organizationId)) {
      throw errors.FORBIDDEN();
    }

    const before = await prismaDbClient.aclRolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });

    await prismaDbClient.$transaction([
      prismaDbClient.aclRolePermission.deleteMany({ where: { roleId: role.id } }),
      ...input.permissionIds.map((permissionId) =>
        prismaDbClient.aclRolePermission.create({
          data: { roleId: role.id, permissionId, inverted: false },
        }),
      ),
    ]);

    await recordAdminActivity({
      actor: { userId: context.user.id, email: context.user.email },
      action: "role.update_permissions",
      target: { type: "role", id: role.id, label: role.name },
      organizationId,
      before: { permissionIds: before.map((b) => b.permissionId) },
      after: { permissionIds: input.permissionIds },
    });

    return { success: true, count: input.permissionIds.length };
  });

export const deleteRole = authedProcedure
  .route({
    method: "DELETE",
    path: "/permissions/roles/{roleId}",
    summary: "Delete a custom role",
    tags: ["permissions"],
  })
  .input(z.object({ roleId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const role = await prismaDbClient.aclRole.findUnique({ where: { id: input.roleId } });
    if (!role) throw errors.NOT_FOUND();
    if (role.isBuiltIn || role.organizationId !== organizationId) throw errors.FORBIDDEN();

    await prismaDbClient.aclRole.delete({ where: { id: role.id } });

    await recordAdminActivity({
      actor: { userId: context.user.id, email: context.user.email },
      action: "role.delete",
      target: { type: "role", id: role.id, label: role.name },
      organizationId,
      severity: "WARN",
    });
    return { success: true };
  });

export const grantUserRole = authedProcedure
  .route({
    method: "POST",
    path: "/permissions/assignments",
    summary: "Grant a role to a user",
    description:
      "Scope is optional — leave projectId/environmentId null for org-wide. Multiple grants for the same user/role with different scopes are allowed.",
    tags: ["permissions"],
  })
  .input(
    z.object({
      userId: z.string(),
      roleId: z.string(),
      projectId: z.string().nullable().optional(),
      environmentId: z.string().nullable().optional(),
      grantedReason: z.string().max(200).optional(),
      endsAt: z.iso.datetime().optional(),
    }),
  )
  .output(z.object({ assignmentId: z.string() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);

    // Hand-rolled upsert: AclUserRole has nullable columns in a compound
    // unique, so Prisma's `upsert` won't accept it (NULL != NULL).
    const existing = await prismaDbClient.aclUserRole.findFirst({
      where: {
        userId: input.userId,
        roleId: input.roleId,
        organizationId,
        projectId: input.projectId ?? null,
        environmentId: input.environmentId ?? null,
      },
    });
    const row = existing
      ? await prismaDbClient.aclUserRole.update({
          where: { id: existing.id },
          data: {
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            grantedReason: input.grantedReason,
          },
        })
      : await prismaDbClient.aclUserRole.create({
          data: {
            userId: input.userId,
            roleId: input.roleId,
            organizationId,
            projectId: input.projectId ?? null,
            environmentId: input.environmentId ?? null,
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            grantedById: context.user.id,
            grantedReason: input.grantedReason,
          },
        });

    await recordAdminActivity({
      actor: { userId: context.user.id, email: context.user.email },
      action: "role.grant",
      target: { type: "user", id: input.userId },
      organizationId,
      projectId: input.projectId ?? null,
      environmentId: input.environmentId ?? null,
      after: { roleId: input.roleId, reason: input.grantedReason },
    });
    return { assignmentId: row.id };
  });

export const revokeUserRole = authedProcedure
  .route({
    method: "DELETE",
    path: "/permissions/assignments/{assignmentId}",
    summary: "Revoke a role grant",
    tags: ["permissions"],
  })
  .input(z.object({ assignmentId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const row = await prismaDbClient.aclUserRole.findUnique({ where: { id: input.assignmentId } });
    if (!row) throw errors.NOT_FOUND();
    if (row.organizationId && row.organizationId !== organizationId) throw errors.FORBIDDEN();

    await prismaDbClient.aclUserRole.delete({ where: { id: row.id } });
    await recordAdminActivity({
      actor: { userId: context.user.id, email: context.user.email },
      action: "role.revoke",
      target: { type: "user", id: row.userId },
      organizationId,
      before: { roleId: row.roleId },
      severity: "WARN",
    });
    return { success: true };
  });

/** List org members for the assignment picker. */
export const listOrgMembers = authedProcedure
  .route({
    method: "GET",
    path: "/permissions/org-members",
    summary: "List members of the active organization (for role assignment)",
    tags: ["permissions"],
  })
  .output(
    z.object({
      members: z.array(
        z.object({
          userId: z.string(),
          name: z.string(),
          email: z.string(),
          memberRole: z.string(),
        }),
      ),
    }),
  )
  .handler(async ({ context, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const rows = await prismaDbClient.member.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      members: rows.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        memberRole: m.role,
      })),
    };
  });
