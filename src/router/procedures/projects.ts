import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  organizationId: z.string(),
  isActive: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  dataRegion: z.string().nullable(),
  retentionDays: z.number().int(),
  maxSendsPerDay: z.number().int().nullable(),
  maxSendsPerMonth: z.number().int().nullable(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
  environmentCount: z.number().int().nonnegative(),
  apiKeyCount: z.number().int().nonnegative(),
});

interface ErrorsLike {
  NOT_FOUND: () => Error;
  UNAUTHORIZED: () => Error;
  CONFLICT: () => Error;
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export const list = authedProcedure
  .route({
    method: "GET",
    path: "/projects",
    summary: "List projects in the active organization",
    description:
      "Includes archived projects when `includeArchived=true`. Counts of envs + keys are joined in.",
    tags: ["projects"],
  })
  .input(z.object({ includeArchived: z.boolean().default(false) }))
  .output(z.object({ projects: z.array(projectSchema) }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const rows = await prismaDbClient.project.findMany({
      where: {
        organizationId,
        archivedAt: input.includeArchived ? undefined : null,
      },
      orderBy: [{ archivedAt: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { environments: true, apiKeys: true } } },
    });
    return {
      projects: rows.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        organizationId: p.organizationId,
        isActive: p.isActive,
        archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
        dataRegion: p.dataRegion,
        retentionDays: p.retentionDays,
        maxSendsPerDay: p.maxSendsPerDay,
        maxSendsPerMonth: p.maxSendsPerMonth,
        settings: (p.settings as Record<string, unknown>) ?? {},
        createdAt: p.createdAt.toISOString(),
        environmentCount: p._count.environments,
        apiKeyCount: p._count.apiKeys,
      })),
    };
  });

export const get = authedProcedure
  .route({
    method: "GET",
    path: "/projects/{projectId}",
    summary: "Get a project by id",
    tags: ["projects"],
  })
  .input(z.object({ projectId: z.string() }))
  .output(z.object({ project: projectSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const p = await prismaDbClient.project.findUnique({
      where: { id: input.projectId },
      include: { _count: { select: { environments: true, apiKeys: true } } },
    });
    if (!p || p.organizationId !== organizationId) throw errors.NOT_FOUND();
    return {
      project: {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        organizationId: p.organizationId,
        isActive: p.isActive,
        archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
        dataRegion: p.dataRegion,
        retentionDays: p.retentionDays,
        maxSendsPerDay: p.maxSendsPerDay,
        maxSendsPerMonth: p.maxSendsPerMonth,
        settings: (p.settings as Record<string, unknown>) ?? {},
        createdAt: p.createdAt.toISOString(),
        environmentCount: p._count.environments,
        apiKeyCount: p._count.apiKeys,
      },
    };
  });

export const create = authedProcedure
  .route({
    method: "POST",
    path: "/projects",
    summary: "Create a project",
    description:
      'Creates a project and provisions two default environments (production + development) in one transaction. Both default settings come from `defaultChannels: ["sms"]`.',
    tags: ["projects"],
  })
  .input(
    z.object({
      name: z.string().min(2).max(80),
      slug: z.string().min(2).max(40).optional(),
      description: z.string().max(500).optional(),
    }),
  )
  .output(z.object({ project: projectSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const slug = slugify(input.slug ?? input.name);
    if (!slug) throw errors.CONFLICT();

    const existing = await prismaDbClient.project.findUnique({ where: { slug } });
    if (existing) throw errors.CONFLICT();

    const now = new Date();
    const projectId = `prj_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const project = await prismaDbClient.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          id: projectId,
          name: input.name,
          slug,
          description: input.description,
          organizationId,
          createdById: context.user.id,
          settings: { defaultChannels: ["sms"], defaultLocale: "fa-IR" },
        },
      });
      const baseEnvs = [
        {
          id: `env_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
          name: "production",
          isDefault: true,
        },
        {
          id: `env_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
          name: "development",
          isDefault: false,
        },
      ];
      for (const e of baseEnvs) {
        // eslint-disable-next-line react-doctor/async-await-in-loop
        await tx.projectEnvironment.create({
          data: {
            id: e.id,
            projectId: p.id,
            name: e.name,
            isDefault: e.isDefault,
            isActive: true,
            settings: { defaultChannels: ["sms"], defaultLocale: "fa-IR" },
            createdAt: now,
          },
        });
      }
      return p;
    });

    await prismaDbClient.adminAuditLog.create({
      data: {
        actorUserId: context.user.id,
        actorEmail: context.user.email,
        action: "project.create",
        targetType: "project",
        targetId: project.id,
        targetLabel: project.slug,
        organizationId,
        projectId: project.id,
        after: { name: project.name, slug: project.slug },
        severity: "INFO",
      },
    });

    return {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        organizationId: project.organizationId,
        isActive: project.isActive,
        archivedAt: null,
        dataRegion: project.dataRegion,
        retentionDays: project.retentionDays,
        maxSendsPerDay: project.maxSendsPerDay,
        maxSendsPerMonth: project.maxSendsPerMonth,
        settings: (project.settings as Record<string, unknown>) ?? {},
        createdAt: project.createdAt.toISOString(),
        environmentCount: 2,
        apiKeyCount: 0,
      },
    };
  });

export const update = authedProcedure
  .route({
    method: "PATCH",
    path: "/projects/{projectId}",
    summary: "Update a project",
    tags: ["projects"],
  })
  .input(
    z.object({
      projectId: z.string(),
      name: z.string().min(2).max(80).optional(),
      description: z.string().max(500).nullable().optional(),
      retentionDays: z.number().int().min(1).max(365).optional(),
      maxSendsPerDay: z.number().int().min(1).nullable().optional(),
      maxSendsPerMonth: z.number().int().min(1).nullable().optional(),
      isActive: z.boolean().optional(),
    }),
  )
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const existing = await prismaDbClient.project.findUnique({ where: { id: input.projectId } });
    if (!existing || existing.organizationId !== organizationId) throw errors.NOT_FOUND();
    await prismaDbClient.project.update({
      where: { id: input.projectId },
      data: {
        name: input.name,
        description: input.description,
        retentionDays: input.retentionDays,
        maxSendsPerDay: input.maxSendsPerDay,
        maxSendsPerMonth: input.maxSendsPerMonth,
        isActive: input.isActive,
      },
    });
    return { success: true };
  });

export const archive = authedProcedure
  .route({
    method: "POST",
    path: "/projects/{projectId}/archive",
    summary: "Archive a project (soft delete)",
    description:
      "Sets `archivedAt = now()`. Existing API keys are kept (so live integrations keep authenticating during the grace period) but new sends return 404 project_archived.",
    tags: ["projects"],
  })
  .input(z.object({ projectId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const existing = await prismaDbClient.project.findUnique({ where: { id: input.projectId } });
    if (!existing || existing.organizationId !== organizationId) throw errors.NOT_FOUND();
    await prismaDbClient.project.update({
      where: { id: input.projectId },
      data: { archivedAt: new Date(), isActive: false },
    });
    return { success: true };
  });

export const restore = authedProcedure
  .route({
    method: "POST",
    path: "/projects/{projectId}/restore",
    summary: "Restore an archived project",
    tags: ["projects"],
  })
  .input(z.object({ projectId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const existing = await prismaDbClient.project.findUnique({ where: { id: input.projectId } });
    if (!existing || existing.organizationId !== organizationId) throw errors.NOT_FOUND();
    await prismaDbClient.project.update({
      where: { id: input.projectId },
      data: { archivedAt: null, isActive: true },
    });
    return { success: true };
  });
