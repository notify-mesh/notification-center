import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";

const teamSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  organizationId: z.string(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime().nullable(),
  memberCount: z.number().int().nonnegative(),
});

function activeOrg(session: { activeOrganizationId?: string | null }) {
  const id = session.activeOrganizationId;
  if (!id) {
    throw Object.assign(new Error("No active organization on this session"), { code: "BAD_INPUT" });
  }
  return id;
}

export const list = authedProcedure
  .route({
    method: "GET",
    path: "/teams",
    summary: "List teams in the active organization",
    description:
      "Returns every team within the caller's currently-active organization, including a count of members.",
    tags: ["teams"],
  })
  .output(z.object({ teams: z.array(teamSchema) }))
  .handler(async ({ context }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const rows = await prismaDbClient.team.findMany({
      where: { organizationId },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      include: { _count: { select: { teammembers: true } } },
    });
    return {
      teams: rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        organizationId: t.organizationId,
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt ? t.updatedAt.toISOString() : null,
        memberCount: t._count.teammembers,
      })),
    };
  });

export const create = authedProcedure
  .route({
    method: "POST",
    path: "/teams",
    summary: "Create a team",
    description: "Creates a new team inside the active organization. Returns the row.",
    tags: ["teams"],
  })
  .input(
    z.object({
      name: z.string().min(2).max(80),
      description: z.string().max(500).optional(),
    }),
  )
  .output(z.object({ team: teamSchema }))
  .handler(async ({ context, input }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const now = new Date();
    const id = `team_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const team = await prismaDbClient.team.create({
      data: {
        id,
        name: input.name,
        description: input.description,
        organizationId,
        createdAt: now,
        isActive: true,
      },
    });
    return {
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        organizationId: team.organizationId,
        isActive: team.isActive,
        createdAt: team.createdAt.toISOString(),
        updatedAt: team.updatedAt ? team.updatedAt.toISOString() : null,
        memberCount: 0,
      },
    };
  });

export const update = authedProcedure
  .route({
    method: "PATCH",
    path: "/teams/{teamId}",
    summary: "Update a team",
    description:
      "Patch a team's name or description. Only fields included in the body are touched.",
    tags: ["teams"],
  })
  .input(
    z.object({
      teamId: z.string(),
      name: z.string().min(2).max(80).optional(),
      description: z.string().max(500).nullable().optional(),
    }),
  )
  .output(z.object({ team: teamSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const existing = await prismaDbClient.team.findUnique({ where: { id: input.teamId } });
    if (!existing || existing.organizationId !== organizationId) {
      throw errors.NOT_FOUND();
    }
    const team = await prismaDbClient.team.update({
      where: { id: input.teamId },
      data: {
        name: input.name,
        description: input.description,
      },
      include: { _count: { select: { teammembers: true } } },
    });
    return {
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        organizationId: team.organizationId,
        isActive: team.isActive,
        createdAt: team.createdAt.toISOString(),
        updatedAt: team.updatedAt ? team.updatedAt.toISOString() : null,
        memberCount: team._count.teammembers,
      },
    };
  });

export const setActive = authedProcedure
  .route({
    method: "POST",
    path: "/teams/{teamId}/active",
    summary: "Activate or deactivate a team",
    description:
      "Soft-toggle for team availability. Deactivated teams remain in the DB but are filtered out of most UI listings.",
    tags: ["teams"],
  })
  .input(
    z.object({
      teamId: z.string(),
      isActive: z.boolean(),
    }),
  )
  .output(z.object({ team: teamSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const existing = await prismaDbClient.team.findUnique({ where: { id: input.teamId } });
    if (!existing || existing.organizationId !== organizationId) {
      throw errors.NOT_FOUND();
    }
    const team = await prismaDbClient.team.update({
      where: { id: input.teamId },
      data: { isActive: input.isActive },
      include: { _count: { select: { teammembers: true } } },
    });
    return {
      team: {
        id: team.id,
        name: team.name,
        description: team.description,
        organizationId: team.organizationId,
        isActive: team.isActive,
        createdAt: team.createdAt.toISOString(),
        updatedAt: team.updatedAt ? team.updatedAt.toISOString() : null,
        memberCount: team._count.teammembers,
      },
    };
  });

export const remove = authedProcedure
  .route({
    method: "DELETE",
    path: "/teams/{teamId}",
    summary: "Delete a team",
    description:
      "Hard-deletes the team. Members are removed, API keys lose their team scoping but remain.",
    tags: ["teams"],
  })
  .input(z.object({ teamId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const existing = await prismaDbClient.team.findUnique({ where: { id: input.teamId } });
    if (!existing || existing.organizationId !== organizationId) {
      throw errors.NOT_FOUND();
    }
    await prismaDbClient.team.delete({ where: { id: input.teamId } });
    return { success: true };
  });
