import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import { mintApiKey } from "@root/lib/api-key-token";
import { apiKeySchema, createApiKeyInput as createInputSchema } from "@root/schemas/api-keys";

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

interface ErrorsLike {
  NOT_FOUND: () => Error;
  UNAUTHORIZED: () => Error;
}

/**
 * Resolve + auto-pin the active organization. Falls back to the user's
 * first Member row when `session.activeOrganizationId` is null — Better
 * Auth doesn't auto-set this on sign-in, so we paper over the gap here so
 * `apiKeys.list` and friends just work after a fresh login.
 */
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
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
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
    const organizationId = await activeOrg(context, errors);

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
    const organizationId = await activeOrg(context, errors);
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
    const organizationId = await activeOrg(context, errors);
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
    const organizationId = await activeOrg(context, errors);
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
  .handler(async ({ context, errors }) => {
    const organizationId = await activeOrg(context, errors);
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

/**
 * Aggregate API-call metrics for the active organization. Sourced from the
 * lifetime counters on `ApiKey` (totalCalls / successfulCalls / failedCalls
 * + p95 / p99 / avgResponseTimeMs / lastUsedAt). Returns:
 *   - org totals + success-rate
 *   - per-key top list (sorted by totalCalls)
 *   - per-project rollup
 *   - per-environment rollup
 *   - health distribution (healthy / degraded / failing / idle)
 *   - recency histogram (last hour / today / this week / older / never)
 *   - latency series for the top keys (p95 + p99)
 */
export const usageMetrics = authedProcedure
  .route({
    method: "GET",
    path: "/api-keys/usage-metrics",
    summary: "Aggregate API-call metrics for the active organization",
    description:
      "Calls / success / fail totals, top-keys ordered by traffic, latency percentiles for the top keys, and a recency histogram that lets the dashboard surface idle keys at a glance.",
    tags: ["api-keys", "analytics"],
  })
  .input(z.object({}).optional())
  .output(
    z.object({
      totals: z.object({
        calls: z.number().int().nonnegative(),
        successful: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        successRatePct: z.number().int(),
        securityViolations: z.number().int().nonnegative(),
        activeKeys: z.number().int().nonnegative(),
        idleKeys: z.number().int().nonnegative(),
      }),
      topKeys: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          keyPrefix: z.string(),
          projectName: z.string(),
          environmentName: z.string(),
          calls: z.number().int(),
          successful: z.number().int(),
          failed: z.number().int(),
          successRatePct: z.number().int(),
          p95Ms: z.number().int(),
          p99Ms: z.number().int(),
          avgMs: z.number().int(),
          lastUsedAt: z.iso.datetime().nullable(),
        }),
      ),
      byProject: z.array(
        z.object({
          projectId: z.string(),
          projectName: z.string(),
          calls: z.number().int(),
          successful: z.number().int(),
          failed: z.number().int(),
        }),
      ),
      byEnvironment: z.array(
        z.object({
          environment: z.string(),
          calls: z.number().int(),
        }),
      ),
      health: z.object({
        healthy: z.number().int(),
        degraded: z.number().int(),
        failing: z.number().int(),
        idle: z.number().int(),
      }),
      recency: z.array(
        z.object({
          bucket: z.string(),
          count: z.number().int(),
        }),
      ),
      latencySeries: z.array(
        z.object({
          name: z.string(),
          p95: z.number().int(),
          p99: z.number().int(),
        }),
      ),
    }),
  )
  .handler(async ({ context, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const keys = await prismaDbClient.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      include: {
        project: { select: { id: true, name: true } },
        environment: { select: { name: true } },
      },
      orderBy: { totalCalls: "desc" },
    });

    const totals = keys.reduce(
      (acc, k) => {
        acc.calls += k.totalCalls;
        acc.successful += k.successfulCalls;
        acc.failed += k.failedCalls;
        acc.securityViolations += k.securityViolations;
        if (k.lastUsedAt) acc.activeKeys += 1;
        else acc.idleKeys += 1;
        return acc;
      },
      { calls: 0, successful: 0, failed: 0, securityViolations: 0, activeKeys: 0, idleKeys: 0 },
    );
    const successRatePct =
      totals.calls === 0 ? 0 : Math.round((totals.successful / totals.calls) * 100);

    const topKeys = keys.slice(0, 10).map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      projectName: k.project.name,
      environmentName: k.environment.name,
      calls: k.totalCalls,
      successful: k.successfulCalls,
      failed: k.failedCalls,
      successRatePct: k.totalCalls === 0 ? 0 : Math.round((k.successfulCalls / k.totalCalls) * 100),
      p95Ms: k.p95ResponseTimeMs,
      p99Ms: k.p99ResponseTimeMs,
      avgMs: k.avgResponseTimeMs,
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    }));

    const projectMap = new Map<
      string,
      { projectId: string; projectName: string; calls: number; successful: number; failed: number }
    >();
    for (const k of keys) {
      const slot = projectMap.get(k.projectId) ?? {
        projectId: k.projectId,
        projectName: k.project.name,
        calls: 0,
        successful: 0,
        failed: 0,
      };
      slot.calls += k.totalCalls;
      slot.successful += k.successfulCalls;
      slot.failed += k.failedCalls;
      projectMap.set(k.projectId, slot);
    }
    const byProject = [...projectMap.values()].sort((a, b) => b.calls - a.calls);

    const envMap = new Map<string, number>();
    for (const k of keys) {
      envMap.set(k.environment.name, (envMap.get(k.environment.name) ?? 0) + k.totalCalls);
    }
    const byEnvironment = [...envMap.entries()]
      .map(([environment, calls]) => ({ environment, calls }))
      .sort((a, b) => b.calls - a.calls);

    // Health buckets: failure rate buckets, with "idle" for never-used keys.
    let healthy = 0;
    let degraded = 0;
    let failing = 0;
    let idle = 0;
    for (const k of keys) {
      if (k.totalCalls === 0) {
        idle += 1;
        continue;
      }
      const failPct = (k.failedCalls / k.totalCalls) * 100;
      if (failPct < 5) healthy += 1;
      else if (failPct < 20) degraded += 1;
      else failing += 1;
    }

    // Recency histogram — last hour / today / this week / older / never.
    const now = Date.now();
    const hourAgo = now - 3_600_000;
    const dayAgo = now - 86_400_000;
    const weekAgo = now - 7 * 86_400_000;
    const recencyBuckets = {
      "Past hour": 0,
      Today: 0,
      "This week": 0,
      Older: 0,
      "Never used": 0,
    };
    for (const k of keys) {
      if (!k.lastUsedAt) recencyBuckets["Never used"] += 1;
      else {
        const t = k.lastUsedAt.getTime();
        if (t >= hourAgo) recencyBuckets["Past hour"] += 1;
        else if (t >= dayAgo) recencyBuckets["Today"] += 1;
        else if (t >= weekAgo) recencyBuckets["This week"] += 1;
        else recencyBuckets["Older"] += 1;
      }
    }
    const recency = Object.entries(recencyBuckets).map(([bucket, count]) => ({ bucket, count }));

    const latencySeries = topKeys
      .filter((k) => k.p95Ms > 0 || k.p99Ms > 0)
      .map((k) => ({ name: k.name, p95: k.p95Ms, p99: k.p99Ms }));

    return {
      totals: { ...totals, successRatePct },
      topKeys,
      byProject,
      byEnvironment,
      health: { healthy, degraded, failing, idle },
      recency,
      latencySeries,
    };
  });
