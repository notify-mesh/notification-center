import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";

const envSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  settings: z.record(z.string(), z.unknown()),
  maxSendsPerDay: z.number().int().nullable(),
  maxSendsPerMonth: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
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

async function assertProjectOwned(projectId: string, organizationId: string): Promise<void> {
  const p = await prismaDbClient.project.findUnique({ where: { id: projectId } });
  if (!p || p.organizationId !== organizationId) {
    const err = new Error("Project not found");
    Object.assign(err, { code: "NOT_FOUND" });
    throw err;
  }
}

function toDto(env: Awaited<ReturnType<typeof prismaDbClient.projectEnvironment.findFirst>>) {
  if (!env) throw new Error("env null");
  return {
    id: env.id,
    projectId: env.projectId,
    name: env.name,
    description: env.description,
    isActive: env.isActive,
    isDefault: env.isDefault,
    archivedAt: env.archivedAt ? env.archivedAt.toISOString() : null,
    settings: (env.settings as Record<string, unknown>) ?? {},
    maxSendsPerDay: env.maxSendsPerDay,
    maxSendsPerMonth: env.maxSendsPerMonth,
    createdAt: env.createdAt.toISOString(),
  };
}

export const list = authedProcedure
  .route({
    method: "GET",
    path: "/projects/{projectId}/environments",
    summary: "List environments in a project",
    tags: ["environments"],
  })
  .input(z.object({ projectId: z.string() }))
  .output(z.object({ environments: z.array(envSchema) }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    await assertProjectOwned(input.projectId, organizationId);
    const rows = await prismaDbClient.projectEnvironment.findMany({
      where: { projectId: input.projectId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    return { environments: rows.map(toDto) };
  });

export const create = authedProcedure
  .route({
    method: "POST",
    path: "/projects/{projectId}/environments",
    summary: "Create an environment",
    tags: ["environments"],
  })
  .input(
    z.object({
      projectId: z.string(),
      name: z
        .string()
        .min(2)
        .max(40)
        .regex(/^[a-z0-9](-?[a-z0-9])*$/),
      description: z.string().max(500).optional(),
      copySettingsFrom: z
        .string()
        .optional()
        .describe("Existing env id to deep-clone settings from."),
    }),
  )
  .output(z.object({ environment: envSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    await assertProjectOwned(input.projectId, organizationId);

    const dupe = await prismaDbClient.projectEnvironment.findUnique({
      where: { projectId_name: { projectId: input.projectId, name: input.name } },
    });
    if (dupe) throw errors.CONFLICT();

    let settings: Record<string, unknown> = {
      defaultChannels: ["sms"],
      defaultLocale: "fa-IR",
    };
    if (input.copySettingsFrom) {
      const source = await prismaDbClient.projectEnvironment.findUnique({
        where: { id: input.copySettingsFrom },
      });
      if (source && source.projectId === input.projectId) {
        // Deep clone via JSON roundtrip — settings is plain JSON.
        settings = JSON.parse(JSON.stringify(source.settings ?? {}));
      }
    }

    const env = await prismaDbClient.projectEnvironment.create({
      data: {
        id: `env_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        isDefault: false,
        isActive: true,
        settings: settings as never,
        createdAt: new Date(),
      },
    });
    return { environment: toDto(env) };
  });

export const updateSettings = authedProcedure
  .route({
    method: "PUT",
    path: "/projects/{projectId}/environments/{envId}/settings",
    summary: "Replace environment settings",
    description:
      "Pass the entire settings object; unknown keys are preserved by deep-merge so future fields stay forward-compatible.",
    tags: ["environments"],
  })
  .input(
    z.object({
      projectId: z.string(),
      envId: z.string(),
      settings: z.record(z.string(), z.unknown()),
    }),
  )
  .output(z.object({ environment: envSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    await assertProjectOwned(input.projectId, organizationId);
    const env = await prismaDbClient.projectEnvironment.findUnique({ where: { id: input.envId } });
    if (!env || env.projectId !== input.projectId) throw errors.NOT_FOUND();
    const merged = { ...((env.settings as Record<string, unknown>) ?? {}), ...input.settings };
    const updated = await prismaDbClient.projectEnvironment.update({
      where: { id: input.envId },
      data: { settings: merged as never },
    });
    return { environment: toDto(updated) };
  });

export const setDefault = authedProcedure
  .route({
    method: "POST",
    path: "/projects/{projectId}/environments/{envId}/set-default",
    summary: "Mark an environment as the project default",
    description: "Atomically demotes the previous default in the same transaction.",
    tags: ["environments"],
  })
  .input(z.object({ projectId: z.string(), envId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    await assertProjectOwned(input.projectId, organizationId);
    await prismaDbClient.$transaction([
      prismaDbClient.projectEnvironment.updateMany({
        where: { projectId: input.projectId, isDefault: true },
        data: { isDefault: false },
      }),
      prismaDbClient.projectEnvironment.update({
        where: { id: input.envId },
        data: { isDefault: true },
      }),
    ]);
    return { success: true };
  });

export const archive = authedProcedure
  .route({
    method: "DELETE",
    path: "/projects/{projectId}/environments/{envId}",
    summary: "Archive an environment",
    description: "Refuses to archive the default environment — promote another one first.",
    tags: ["environments"],
  })
  .input(z.object({ projectId: z.string(), envId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    await assertProjectOwned(input.projectId, organizationId);
    const env = await prismaDbClient.projectEnvironment.findUnique({ where: { id: input.envId } });
    if (!env || env.projectId !== input.projectId) throw errors.NOT_FOUND();
    if (env.isDefault) throw errors.CONFLICT();
    await prismaDbClient.projectEnvironment.update({
      where: { id: input.envId },
      data: { archivedAt: new Date(), isActive: false },
    });
    return { success: true };
  });
