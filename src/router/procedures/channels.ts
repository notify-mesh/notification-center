import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import { CHANNEL as CHANNELS, type Channel } from "@root/schemas/common";
import { channelSchema } from "@root/schemas/channels";

interface ErrorsLike {
  NOT_FOUND: () => Error;
  UNAUTHORIZED: () => Error;
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

export const list = authedProcedure
  .route({
    method: "GET",
    path: "/projects/{projectId}/environments/{envId}/channels",
    summary: "List enabled channels for an environment",
    tags: ["channels"],
  })
  .input(z.object({ projectId: z.string(), envId: z.string() }))
  .output(z.object({ channels: z.array(channelSchema) }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const rows = await prismaDbClient.enabledChannel.findMany({
      where: { organizationId, projectId: input.projectId, environmentId: input.envId },
      orderBy: [{ priority: "asc" }, { channel: "asc" }],
    });
    return {
      channels: rows.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        environmentId: c.environmentId,
        channel: c.channel as Channel,
        providerKey: c.providerKey,
        isActive: c.isActive,
        priority: c.priority,
        config: (c.config as Record<string, unknown>) ?? {},
        dailyCap: c.dailyCap,
        monthlyCap: c.monthlyCap,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  });

export const upsert = authedProcedure
  .route({
    method: "PUT",
    path: "/projects/{projectId}/environments/{envId}/channels/{channel}",
    summary: "Enable/configure a channel for an environment",
    description:
      "Binds a channel to a provider credential. Idempotent — replays just update fields. Disable the channel by setting `isActive: false` rather than deleting (audit trail stays intact).",
    tags: ["channels"],
  })
  .input(
    z.object({
      projectId: z.string(),
      envId: z.string(),
      channel: CHANNELS,
      providerKey: z.string(),
      isActive: z.boolean().default(true),
      priority: z.number().int().min(0).max(1000).default(100),
      config: z.record(z.string(), z.unknown()).default({}),
      dailyCap: z.number().int().min(1).nullable().optional(),
      monthlyCap: z.number().int().min(1).nullable().optional(),
    }),
  )
  .output(z.object({ channel: channelSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const row = await prismaDbClient.enabledChannel.upsert({
      where: {
        projectId_environmentId_channel: {
          projectId: input.projectId,
          environmentId: input.envId,
          channel: input.channel,
        },
      },
      create: {
        organizationId,
        projectId: input.projectId,
        environmentId: input.envId,
        channel: input.channel,
        providerKey: input.providerKey,
        isActive: input.isActive,
        priority: input.priority,
        config: input.config as never,
        dailyCap: input.dailyCap,
        monthlyCap: input.monthlyCap,
      },
      update: {
        providerKey: input.providerKey,
        isActive: input.isActive,
        priority: input.priority,
        config: input.config as never,
        dailyCap: input.dailyCap,
        monthlyCap: input.monthlyCap,
      },
    });
    return {
      channel: {
        id: row.id,
        projectId: row.projectId,
        environmentId: row.environmentId,
        channel: row.channel as Channel,
        providerKey: row.providerKey,
        isActive: row.isActive,
        priority: row.priority,
        config: (row.config as Record<string, unknown>) ?? {},
        dailyCap: row.dailyCap,
        monthlyCap: row.monthlyCap,
        createdAt: row.createdAt.toISOString(),
      },
    };
  });

export const remove = authedProcedure
  .route({
    method: "DELETE",
    path: "/projects/{projectId}/environments/{envId}/channels/{channel}",
    summary: "Remove a channel binding",
    tags: ["channels"],
  })
  .input(z.object({ projectId: z.string(), envId: z.string(), channel: CHANNELS }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const row = await prismaDbClient.enabledChannel.findUnique({
      where: {
        projectId_environmentId_channel: {
          projectId: input.projectId,
          environmentId: input.envId,
          channel: input.channel,
        },
      },
    });
    if (!row || row.organizationId !== organizationId) throw errors.NOT_FOUND();
    await prismaDbClient.enabledChannel.delete({ where: { id: row.id } });
    return { success: true };
  });
