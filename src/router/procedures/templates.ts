import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import {
  TEMPLATE_CHANNEL as CHANNELS,
  TEMPLATE_STATUS as STATUSES,
  variantSchema,
  templateSchema,
  type TemplateChannel,
  type TemplateStatus,
} from "@root/schemas/templates";

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

export const list = authedProcedure
  .route({
    method: "GET",
    path: "/projects/{projectId}/templates",
    summary: "List templates in a project",
    tags: ["templates"],
  })
  .input(
    z.object({
      projectId: z.string(),
      includeArchived: z.boolean().default(false),
    }),
  )
  .output(z.object({ templates: z.array(templateSchema) }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    await assertProjectOwned(input.projectId, organizationId);
    const rows = await prismaDbClient.template.findMany({
      where: {
        projectId: input.projectId,
        archived: input.includeArchived ? undefined : false,
      },
      orderBy: { createdAt: "desc" },
      include: { variants: { orderBy: [{ version: "desc" }] } },
    });
    return {
      templates: rows.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        name: t.name,
        displayName: t.displayName,
        description: t.description,
        category: t.category,
        variableSchema: (t.variableSchema as Record<string, unknown>) ?? {},
        archived: t.archived,
        createdAt: t.createdAt.toISOString(),
        variants: t.variants.map((v) => ({
          id: v.id,
          channel: v.channel as TemplateChannel,
          locale: v.locale,
          version: v.version,
          status: v.status as TemplateStatus,
          subject: v.subject,
          html: v.html,
          text: v.text,
          pushTitle: v.pushTitle,
          pushBody: v.pushBody,
          createdAt: v.createdAt.toISOString(),
        })),
      })),
    };
  });

export const create = authedProcedure
  .route({
    method: "POST",
    path: "/projects/{projectId}/templates",
    summary: "Create a template with initial variants",
    tags: ["templates"],
  })
  .input(
    z.object({
      projectId: z.string(),
      name: z
        .string()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9](-?[a-z0-9])*$/),
      displayName: z.string().min(2).max(120),
      description: z.string().max(500).optional(),
      category: z.string().max(40).optional(),
      variableSchema: z.record(z.string(), z.unknown()).default({ type: "object", properties: {} }),
      variants: z
        .array(
          z.object({
            channel: CHANNELS,
            locale: z.string().min(2).max(10).default("fa-IR"),
            subject: z.string().optional(),
            html: z.string().optional(),
            text: z.string().optional(),
            pushTitle: z.string().optional(),
            pushBody: z.string().optional(),
          }),
        )
        .min(1),
    }),
  )
  .output(z.object({ template: templateSchema }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    await assertProjectOwned(input.projectId, organizationId);

    const existing = await prismaDbClient.template.findUnique({
      where: { projectId_name: { projectId: input.projectId, name: input.name } },
    });
    if (existing) throw errors.CONFLICT();

    const templateId = `tpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const template = await prismaDbClient.$transaction(async (tx) => {
      const t = await tx.template.create({
        data: {
          id: templateId,
          projectId: input.projectId,
          name: input.name,
          displayName: input.displayName,
          description: input.description,
          category: input.category,
          variableSchema: input.variableSchema as never,
          createdById: context.user.id,
        },
      });
      for (const v of input.variants) {
        // eslint-disable-next-line react-doctor/async-await-in-loop
        await tx.templateVariant.create({
          data: {
            id: `tplv_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
            templateId: t.id,
            channel: v.channel,
            locale: v.locale,
            version: 1,
            status: "DRAFT",
            subject: v.subject,
            html: v.html,
            text: v.text,
            pushTitle: v.pushTitle,
            pushBody: v.pushBody,
            createdById: context.user.id,
          },
        });
      }
      return tx.template.findUnique({
        where: { id: t.id },
        include: { variants: true },
      });
    });

    return {
      template: {
        id: template!.id,
        projectId: template!.projectId,
        name: template!.name,
        displayName: template!.displayName,
        description: template!.description,
        category: template!.category,
        variableSchema: (template!.variableSchema as Record<string, unknown>) ?? {},
        archived: template!.archived,
        createdAt: template!.createdAt.toISOString(),
        variants: template!.variants.map((v) => ({
          id: v.id,
          channel: v.channel as TemplateChannel,
          locale: v.locale,
          version: v.version,
          status: v.status as TemplateStatus,
          subject: v.subject,
          html: v.html,
          text: v.text,
          pushTitle: v.pushTitle,
          pushBody: v.pushBody,
          createdAt: v.createdAt.toISOString(),
        })),
      },
    };
  });

export const publishVariant = authedProcedure
  .route({
    method: "POST",
    path: "/templates/{templateId}/variants/{variantId}/publish",
    summary: "Publish a variant, atomically demoting any previous published version",
    tags: ["templates"],
  })
  .input(z.object({ templateId: z.string(), variantId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ input, errors }) => {
    const variant = await prismaDbClient.templateVariant.findUnique({
      where: { id: input.variantId },
    });
    if (!variant || variant.templateId !== input.templateId) throw errors.NOT_FOUND();

    await prismaDbClient.$transaction([
      prismaDbClient.templateVariant.updateMany({
        where: {
          templateId: input.templateId,
          channel: variant.channel,
          locale: variant.locale,
          status: "PUBLISHED",
        },
        data: { status: "ARCHIVED" },
      }),
      prismaDbClient.templateVariant.update({
        where: { id: input.variantId },
        data: { status: "PUBLISHED" },
      }),
    ]);
    return { success: true };
  });

export const updateVariant = authedProcedure
  .route({
    method: "PATCH",
    path: "/templates/{templateId}/variants/{variantId}",
    summary: "Edit a variant's content",
    description:
      "Editing a PUBLISHED variant is forbidden — that creates a new DRAFT version instead (clone-on-write). The endpoint enforces this automatically.",
    tags: ["templates"],
  })
  .input(
    z.object({
      templateId: z.string(),
      variantId: z.string(),
      subject: z.string().nullable().optional(),
      html: z.string().nullable().optional(),
      text: z.string().nullable().optional(),
      pushTitle: z.string().nullable().optional(),
      pushBody: z.string().nullable().optional(),
    }),
  )
  .output(z.object({ variantId: z.string() }))
  .handler(async ({ context, input, errors }) => {
    const variant = await prismaDbClient.templateVariant.findUnique({
      where: { id: input.variantId },
    });
    if (!variant || variant.templateId !== input.templateId) throw errors.NOT_FOUND();

    if (variant.status === "PUBLISHED") {
      // Clone-on-write: bump version, create new DRAFT row with patched content.
      const latest = await prismaDbClient.templateVariant.findFirst({
        where: { templateId: variant.templateId, channel: variant.channel, locale: variant.locale },
        orderBy: { version: "desc" },
      });
      const next = await prismaDbClient.templateVariant.create({
        data: {
          id: `tplv_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
          templateId: variant.templateId,
          channel: variant.channel,
          locale: variant.locale,
          version: (latest?.version ?? variant.version) + 1,
          status: "DRAFT",
          subject: input.subject ?? variant.subject,
          html: input.html ?? variant.html,
          text: input.text ?? variant.text,
          pushTitle: input.pushTitle ?? variant.pushTitle,
          pushBody: input.pushBody ?? variant.pushBody,
          createdById: context.user.id,
        },
      });
      return { variantId: next.id };
    }

    await prismaDbClient.templateVariant.update({
      where: { id: input.variantId },
      data: {
        subject: input.subject ?? undefined,
        html: input.html ?? undefined,
        text: input.text ?? undefined,
        pushTitle: input.pushTitle ?? undefined,
        pushBody: input.pushBody ?? undefined,
      },
    });
    return { variantId: input.variantId };
  });

export const archive = authedProcedure
  .route({
    method: "POST",
    path: "/templates/{templateId}/archive",
    summary: "Archive a template",
    tags: ["templates"],
  })
  .input(z.object({ templateId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const t = await prismaDbClient.template.findUnique({ where: { id: input.templateId } });
    if (!t) throw errors.NOT_FOUND();
    await prismaDbClient.template.update({
      where: { id: t.id },
      data: { archived: true, archivedAt: new Date(), archivedById: context.user.id },
    });
    return { success: true };
  });

export const preview = authedProcedure
  .route({
    method: "POST",
    path: "/templates/{templateId}/preview",
    summary: "Render a template with sample variables",
    description:
      "Returns the rendered output without sending. Uses the latest variant matching (channel, locale).",
    tags: ["templates"],
  })
  .input(
    z.object({
      templateId: z.string(),
      channel: CHANNELS,
      locale: z.string().default("fa-IR"),
      variables: z.record(z.string(), z.unknown()).default({}),
    }),
  )
  .output(
    z.object({
      subject: z.string().nullable(),
      html: z.string().nullable(),
      text: z.string().nullable(),
    }),
  )
  .handler(async ({ input, errors }) => {
    const variant = await prismaDbClient.templateVariant.findFirst({
      where: { templateId: input.templateId, channel: input.channel, locale: input.locale },
      orderBy: [{ status: "asc" }, { version: "desc" }],
    });
    if (!variant) throw errors.NOT_FOUND();

    const render = (s: string | null): string | null =>
      s
        ? s.replace(/{{\s*([\w.]+)\s*}}/g, (_, k) => String(input.variables[k] ?? `{{${k}}}`))
        : null;

    return {
      subject: render(variant.subject),
      html: render(variant.html),
      text: render(variant.text),
    };
  });
