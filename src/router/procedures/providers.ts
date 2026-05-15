import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import {
  findProvider,
  PROVIDERS,
  buildCredentialZodSchema,
  partitionCredentialFields,
} from "@root/lib/notify/catalog";
import { sealCredential, unsealCredential, maskSecret } from "@root/lib/crypto-vault";
import { testProvider } from "@root/lib/notify/provider-test";

interface ErrorsLike {
  NOT_FOUND: () => Error;
  UNAUTHORIZED: () => Error;
  CONFLICT: () => Error;
  VALIDATION_ERROR: (input: {
    data: { issues: Array<{ path: string[]; message: string }> };
  }) => Error;
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

const providerSpecSchema = z.object({
  key: z.string(),
  displayName: z.string(),
  description: z.string(),
  region: z.enum(["ir", "global"]),
  channels: z.array(z.string()),
  implemented: z.boolean(),
  costPerUnitIrr: z.number().optional(),
  fields: z.array(
    z.object({
      name: z.string(),
      secret: z.boolean(),
      type: z.enum(["string", "number", "boolean", "url"]),
      required: z.boolean(),
      description: z.string(),
      placeholder: z.string().optional(),
    }),
  ),
});

const credentialSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  environmentId: z.string(),
  providerKey: z.string(),
  label: z.string().nullable(),
  status: z.enum(["UNTESTED", "HEALTHY", "FAILING", "REVOKED"]),
  lastTestedAt: z.iso.datetime().nullable(),
  lastError: z.string().nullable(),
  /** Masked secrets + plaintext non-secret fields. */
  fields: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Return safe-to-display fields for a stored credential row. */
function maskedFields(spec: ReturnType<typeof findProvider>, unsealed: Record<string, unknown>) {
  if (!spec) return {};
  const out: Record<string, unknown> = {};
  for (const f of spec.fields) {
    const v = unsealed[f.name];
    if (v === undefined || v === null) continue;
    out[f.name] = f.secret ? maskSecret(String(v)) : v;
  }
  return out;
}

export const catalog = authedProcedure
  .route({
    method: "GET",
    path: "/providers/catalog",
    summary: "Get the catalog of installable providers",
    description:
      "Static catalog driving the credentials UI. Per-provider field shape + display metadata.",
    tags: ["providers"],
  })
  .output(z.object({ providers: z.array(providerSpecSchema) }))
  .handler(async () => ({
    providers: PROVIDERS as unknown as z.infer<typeof providerSpecSchema>[],
  }));

export const list = authedProcedure
  .route({
    method: "GET",
    path: "/projects/{projectId}/environments/{envId}/providers",
    summary: "List configured providers for an env",
    tags: ["providers"],
  })
  .input(z.object({ projectId: z.string(), envId: z.string() }))
  .output(z.object({ credentials: z.array(credentialSchema) }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const rows = await prismaDbClient.providerCredential.findMany({
      where: {
        organizationId,
        projectId: input.projectId,
        environmentId: input.envId,
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      credentials: rows.map((r) => {
        const spec = findProvider(r.providerKey);
        let unsealed: Record<string, unknown> = {};
        try {
          unsealed = unsealCredential({
            wrappedDek: r.wrappedDek,
            kekVersion: r.kekVersion,
            payload: r.payload as unknown as Parameters<typeof unsealCredential>[0]["payload"],
          });
        } catch {
          unsealed = {};
        }
        return {
          id: r.id,
          projectId: r.projectId,
          environmentId: r.environmentId,
          providerKey: r.providerKey,
          label: r.label,
          status: r.status,
          lastTestedAt: r.lastTestedAt ? r.lastTestedAt.toISOString() : null,
          lastError: r.lastError,
          fields: maskedFields(spec, unsealed),
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
        };
      }),
    };
  });

export const upsert = authedProcedure
  .route({
    method: "PUT",
    path: "/projects/{projectId}/environments/{envId}/providers/{providerKey}",
    summary: "Create or update a provider credential",
    description:
      "Validates the body against the provider's field spec, partitions secrets vs plaintext, then seals secrets under a freshly-minted DEK. Returns the credential row (with masked secrets).",
    tags: ["providers"],
  })
  .input(
    z.object({
      projectId: z.string(),
      envId: z.string(),
      providerKey: z.string(),
      label: z.string().max(80).nullable().optional(),
      values: z.record(z.string(), z.unknown()),
    }),
  )
  .output(z.object({ credential: credentialSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const spec = findProvider(input.providerKey);
    if (!spec) throw errors.NOT_FOUND();

    const validator = buildCredentialZodSchema(spec);
    const parsed = validator.safeParse(input.values);
    if (!parsed.success) {
      throw errors.VALIDATION_ERROR({
        data: {
          issues: parsed.error.issues.map((i) => ({
            path: i.path.map((p) => String(p)),
            message: i.message,
          })),
        },
      });
    }

    const { secrets, plain } = partitionCredentialFields(spec, parsed.data);
    const sealed = sealCredential({ secrets, plain });

    // Prisma rejects nulls in compound-unique where-clauses, so we hand-roll
    // the upsert (same `null`-in-compound-key reason as the seed script).
    const existing = await prismaDbClient.providerCredential.findFirst({
      where: {
        projectId: input.projectId,
        environmentId: input.envId,
        providerKey: input.providerKey,
        label: input.label ?? null,
      },
    });
    const row = existing
      ? await prismaDbClient.providerCredential.update({
          where: { id: existing.id },
          data: {
            wrappedDek: sealed.wrappedDek,
            kekVersion: sealed.kekVersion,
            payload: sealed.payload as never,
            status: "UNTESTED",
            lastError: null,
          },
        })
      : await prismaDbClient.providerCredential.create({
          data: {
            organizationId,
            projectId: input.projectId,
            environmentId: input.envId,
            providerKey: input.providerKey,
            label: input.label ?? null,
            wrappedDek: sealed.wrappedDek,
            kekVersion: sealed.kekVersion,
            payload: sealed.payload as never,
            status: "UNTESTED",
          },
        });

    const unsealed = unsealCredential({
      wrappedDek: row.wrappedDek,
      kekVersion: row.kekVersion,
      payload: row.payload as unknown as Parameters<typeof unsealCredential>[0]["payload"],
    });

    return {
      credential: {
        id: row.id,
        projectId: row.projectId,
        environmentId: row.environmentId,
        providerKey: row.providerKey,
        label: row.label,
        status: row.status,
        lastTestedAt: row.lastTestedAt ? row.lastTestedAt.toISOString() : null,
        lastError: row.lastError,
        fields: maskedFields(spec, unsealed),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  });

export const test = authedProcedure
  .route({
    method: "POST",
    path: "/providers/{credentialId}/test",
    summary: "Test a credential by calling the provider's lightweight health endpoint",
    tags: ["providers"],
  })
  .input(z.object({ credentialId: z.string() }))
  .output(
    z.object({
      ok: z.boolean(),
      message: z.string().nullable(),
    }),
  )
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const row = await prismaDbClient.providerCredential.findUnique({
      where: { id: input.credentialId },
    });
    if (!row || row.organizationId !== organizationId) throw errors.NOT_FOUND();

    const unsealed = unsealCredential({
      wrappedDek: row.wrappedDek,
      kekVersion: row.kekVersion,
      payload: row.payload as unknown as Parameters<typeof unsealCredential>[0]["payload"],
    });
    const result = await testProvider(row.providerKey, unsealed);

    await prismaDbClient.providerCredential.update({
      where: { id: row.id },
      data: {
        status: result.ok ? "HEALTHY" : "FAILING",
        lastTestedAt: new Date(),
        lastError: result.ok ? null : (result.message ?? null),
      },
    });
    return { ok: result.ok, message: result.message ?? null };
  });

export const remove = authedProcedure
  .route({
    method: "DELETE",
    path: "/providers/{credentialId}",
    summary: "Delete a credential",
    tags: ["providers"],
  })
  .input(z.object({ credentialId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const row = await prismaDbClient.providerCredential.findUnique({
      where: { id: input.credentialId },
    });
    if (!row || row.organizationId !== organizationId) throw errors.NOT_FOUND();
    await prismaDbClient.providerCredential.delete({ where: { id: row.id } });
    return { success: true };
  });
