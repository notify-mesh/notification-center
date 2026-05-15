import "server-only";

import { z } from "zod";
import { authedProcedure } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import { mintApiKey } from "@root/lib/api-key-token";

/**
 * API Key DTO — what we return to the client. The plaintext token is
 * *never* part of this shape; it's only returned by `create()` and `rotate()`.
 */
const apiKeySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  keyPrefix: z.string(),
  isActive: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  deprecatedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
  revokedReason: z.string().nullable(),
  organizationId: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  teamId: z.string().nullable(),
  canRead: z.boolean(),
  canWrite: z.boolean(),
  scopes: z.array(z.string()),
  ipRestrictions: z.array(z.string()),
  countryRestrictions: z.array(z.string()),
  restrictionMode: z.string().nullable(),
  websiteOrigins: z.array(z.string()),
  allowedUserAgents: z.array(z.string()),
  blockedUserAgents: z.array(z.string()),
  allowedMethods: z.array(z.string()),
  requireHttps: z.boolean(),
  minuteQuota: z.number().int().positive().nullable(),
  hourQuota: z.number().int().positive().nullable(),
  dailyQuota: z.number().int().positive().nullable(),
  monthlyQuota: z.number().int().positive().nullable(),
  rateLimitPerSecond: z.number().int().positive().nullable(),
  tags: z.array(z.string()),
  createdAt: z.iso.datetime(),
});

const createInputSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  projectId: z.string(),
  environmentId: z.string(),
  teamId: z.string().nullable().optional(),
  expiresAt: z.iso.datetime().optional(),
  canRead: z.boolean().default(true),
  canWrite: z.boolean().default(false),
  scopes: z.array(z.string()).max(64).default([]),
  ipRestrictions: z.array(z.string().describe("IP or CIDR; v4 or v6")).max(64).default([]),
  countryRestrictions: z
    .array(z.string().regex(/^[A-Z]{2}$/, "ISO-3166-1 alpha-2 country code"))
    .max(250)
    .default([]),
  restrictionMode: z.enum(["allow", "deny"]).default("allow"),
  websiteOrigins: z.array(z.url()).max(64).default([]),
  allowedUserAgents: z.array(z.string()).max(64).default([]),
  blockedUserAgents: z.array(z.string()).max(64).default([]),
  allowedMethods: z
    .array(z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]))
    .default(["GET", "POST"]),
  requireHttps: z.boolean().default(false),
  minuteQuota: z.number().int().positive().optional(),
  hourQuota: z.number().int().positive().optional(),
  dailyQuota: z.number().int().positive().optional(),
  monthlyQuota: z.number().int().positive().optional(),
  rateLimitPerSecond: z.number().int().positive().max(10_000).default(10),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

type ApiKeyRow = Awaited<ReturnType<typeof prismaDbClient.apiKey.findFirst>>;

function toDto(row: NonNullable<ApiKeyRow>): z.infer<typeof apiKeySchema> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    keyPrefix: row.keyPrefix,
    isActive: row.isActive,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    deprecatedAt: row.deprecatedAt ? row.deprecatedAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    revokedReason: row.revokedReason,
    organizationId: row.organizationId,
    projectId: row.projectId,
    environmentId: row.environmentId,
    teamId: row.teamId,
    canRead: row.canRead,
    canWrite: row.canWrite,
    scopes: jsonArray(row.scopes),
    ipRestrictions: jsonArray(row.ipRestrictions),
    countryRestrictions: jsonArray(row.countryRestrictions),
    restrictionMode: row.restrictionMode,
    websiteOrigins: jsonArray(row.websiteOrigins),
    allowedUserAgents: jsonArray(row.allowedUserAgents),
    blockedUserAgents: jsonArray(row.blockedUserAgents),
    allowedMethods: jsonArray(row.allowedMethods),
    requireHttps: row.requireHttps,
    minuteQuota: row.minuteQuota,
    hourQuota: row.hourQuota,
    dailyQuota: row.dailyQuota,
    monthlyQuota: row.monthlyQuota,
    rateLimitPerSecond: row.rateLimitPerSecond,
    tags: jsonArray(row.tags),
    createdAt: row.createdAt.toISOString(),
  };
}

function jsonArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

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
    path: "/api-keys",
    summary: "List API keys in the active organization",
    description:
      "Returns every API key scoped to the caller's active organization. The plaintext token is never returned by list — only `keyPrefix` for masked display.",
    tags: ["api-keys"],
  })
  .input(
    z.object({
      projectId: z.string().optional(),
      environmentId: z.string().optional(),
      teamId: z.string().optional(),
      includeRevoked: z.boolean().default(false),
    }),
  )
  .output(z.object({ keys: z.array(apiKeySchema) }))
  .handler(async ({ context, input }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const rows = await prismaDbClient.apiKey.findMany({
      where: {
        organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        teamId: input.teamId,
        revokedAt: input.includeRevoked ? undefined : null,
      },
      orderBy: { createdAt: "desc" },
    });
    return { keys: rows.map(toDto) };
  });

export const create = authedProcedure
  .route({
    method: "POST",
    path: "/api-keys",
    summary: "Create an API key",
    description:
      "Mints a fresh key with full security restrictions. The plaintext `token` field of the response is shown ONCE — store it immediately. Subsequent reads only return `keyPrefix`.",
    tags: ["api-keys"],
  })
  .input(createInputSchema)
  .output(
    z.object({
      key: apiKeySchema,
      token: z.string().describe("Plaintext API key, shown exactly once."),
    }),
  )
  .handler(async ({ context, input, errors }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );

    // Validate project + environment belong to this org and to each other.
    const environment = await prismaDbClient.projectEnvironment.findUnique({
      where: { id: input.environmentId },
      include: { project: true },
    });
    if (!environment || environment.project.organizationId !== organizationId) {
      throw errors.NOT_FOUND();
    }
    if (environment.projectId !== input.projectId) {
      throw errors.CONFLICT();
    }

    if (input.teamId) {
      const team = await prismaDbClient.team.findUnique({ where: { id: input.teamId } });
      if (!team || team.organizationId !== organizationId) {
        throw errors.NOT_FOUND();
      }
    }

    const id = `key_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const { token, keyPrefix, keyHash } = mintApiKey(environment.name);

    const row = await prismaDbClient.apiKey.create({
      data: {
        id,
        name: input.name,
        description: input.description,
        keyHash,
        keyPrefix,
        organizationId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        teamId: input.teamId ?? null,
        userId: context.user.id,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        canRead: input.canRead,
        canWrite: input.canWrite,
        scopes: input.scopes,
        ipRestrictions: input.ipRestrictions,
        countryRestrictions: input.countryRestrictions,
        restrictionMode: input.restrictionMode,
        websiteOrigins: input.websiteOrigins,
        allowedUserAgents: input.allowedUserAgents,
        blockedUserAgents: input.blockedUserAgents,
        allowedMethods: input.allowedMethods,
        requireHttps: input.requireHttps,
        minuteQuota: input.minuteQuota,
        hourQuota: input.hourQuota,
        dailyQuota: input.dailyQuota,
        monthlyQuota: input.monthlyQuota,
        rateLimitPerSecond: input.rateLimitPerSecond,
        tags: input.tags,
      },
    });

    return { key: toDto(row), token };
  });

export const update = authedProcedure
  .route({
    method: "PATCH",
    path: "/api-keys/{keyId}",
    summary: "Update an API key's restrictions",
    description:
      "Patches restriction and metadata fields on a key. The secret material (`keyHash`/`keyPrefix`) is never altered — use `/api-keys/{keyId}/rotate` to roll the secret.",
    tags: ["api-keys"],
  })
  .input(
    createInputSchema.partial().extend({ keyId: z.string() }).omit({
      projectId: true,
      environmentId: true,
    }),
  )
  .output(z.object({ key: apiKeySchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const existing = await prismaDbClient.apiKey.findUnique({ where: { id: input.keyId } });
    if (!existing || existing.organizationId !== organizationId) throw errors.NOT_FOUND();

    const { keyId: _kid, teamId, expiresAt, ...rest } = input;
    void _kid;

    const updated = await prismaDbClient.apiKey.update({
      where: { id: input.keyId },
      data: {
        ...rest,
        teamId: teamId === undefined ? undefined : teamId,
        expiresAt: expiresAt === undefined ? undefined : expiresAt ? new Date(expiresAt) : null,
      },
    });
    return { key: toDto(updated) };
  });

export const rotate = authedProcedure
  .route({
    method: "POST",
    path: "/api-keys/{keyId}/rotate",
    summary: "Rotate an API key",
    description:
      "Mints a successor key with the same restrictions; the original is marked `deprecatedAt` and continues to work for the grace period. The plaintext is shown ONCE in the response.",
    tags: ["api-keys"],
  })
  .input(
    z.object({
      keyId: z.string(),
      gracePeriodHours: z
        .number()
        .int()
        .nonnegative()
        .max(24 * 30)
        .default(24),
    }),
  )
  .output(
    z.object({
      key: apiKeySchema,
      token: z.string().describe("Plaintext API key for the new successor."),
      deprecatedKey: apiKeySchema,
    }),
  )
  .handler(async ({ context, input, errors }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const original = await prismaDbClient.apiKey.findUnique({
      where: { id: input.keyId },
      include: { environment: true },
    });
    if (!original || original.organizationId !== organizationId) throw errors.NOT_FOUND();

    const newId = `key_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const { token, keyPrefix, keyHash } = mintApiKey(original.environment.name);

    const [successor, deprecated] = await prismaDbClient.$transaction([
      prismaDbClient.apiKey.create({
        data: {
          id: newId,
          name: original.name,
          description: original.description,
          keyHash,
          keyPrefix,
          organizationId: original.organizationId,
          projectId: original.projectId,
          environmentId: original.environmentId,
          teamId: original.teamId,
          userId: context.user.id,
          rotatedFromKeyId: original.id,
          canRead: original.canRead,
          canWrite: original.canWrite,
          scopes: original.scopes ?? [],
          ipRestrictions: original.ipRestrictions ?? [],
          countryRestrictions: original.countryRestrictions ?? [],
          restrictionMode: original.restrictionMode,
          websiteOrigins: original.websiteOrigins ?? [],
          allowedUserAgents: original.allowedUserAgents ?? [],
          blockedUserAgents: original.blockedUserAgents ?? [],
          allowedMethods: original.allowedMethods ?? ["GET", "POST"],
          requireHttps: original.requireHttps,
          minuteQuota: original.minuteQuota,
          hourQuota: original.hourQuota,
          dailyQuota: original.dailyQuota,
          monthlyQuota: original.monthlyQuota,
          rateLimitPerSecond: original.rateLimitPerSecond,
          tags: original.tags ?? [],
        },
      }),
      prismaDbClient.apiKey.update({
        where: { id: original.id },
        data: {
          deprecatedAt: new Date(),
          expiresAt: new Date(Date.now() + input.gracePeriodHours * 60 * 60 * 1000),
        },
      }),
    ]);

    return { key: toDto(successor), token, deprecatedKey: toDto(deprecated) };
  });

export const revoke = authedProcedure
  .route({
    method: "POST",
    path: "/api-keys/{keyId}/revoke",
    summary: "Revoke an API key immediately",
    description:
      "Sets `revokedAt = now()` and stops the key from authenticating. Optional `reason` is stored for audit. Cannot be undone — use rotate if you need a phased rollover.",
    tags: ["api-keys"],
  })
  .input(z.object({ keyId: z.string(), reason: z.string().max(200).optional() }))
  .output(z.object({ key: apiKeySchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const existing = await prismaDbClient.apiKey.findUnique({ where: { id: input.keyId } });
    if (!existing || existing.organizationId !== organizationId) throw errors.NOT_FOUND();

    const updated = await prismaDbClient.apiKey.update({
      where: { id: input.keyId },
      data: {
        revokedAt: new Date(),
        revokedReason: input.reason,
        revokedByUserId: context.user.id,
        isActive: false,
      },
    });
    return { key: toDto(updated) };
  });

export const projectsAndEnvs = authedProcedure
  .route({
    method: "GET",
    path: "/api-keys/options",
    summary: "List projects + environments + teams available for key issuance",
    description:
      "Convenience endpoint for the API-key creation UI: returns the catalogue the user can scope a key to.",
    tags: ["api-keys"],
  })
  .output(
    z.object({
      projects: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          slug: z.string(),
          environments: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              isDefault: z.boolean(),
            }),
          ),
        }),
      ),
      teams: z.array(z.object({ id: z.string(), name: z.string(), isActive: z.boolean() })),
    }),
  )
  .handler(async ({ context }) => {
    const organizationId = activeOrg(
      context.session.session as { activeOrganizationId?: string | null },
    );
    const [projects, teams] = await Promise.all([
      prismaDbClient.project.findMany({
        where: { organizationId, archivedAt: null },
        include: { environments: { where: { archivedAt: null } } },
        orderBy: { name: "asc" },
      }),
      prismaDbClient.team.findMany({
        where: { organizationId },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
    ]);
    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        environments: p.environments.map((e) => ({
          id: e.id,
          name: e.name,
          isDefault: e.isDefault,
        })),
      })),
      teams: teams.map((t) => ({ id: t.id, name: t.name, isActive: t.isActive })),
    };
  });
