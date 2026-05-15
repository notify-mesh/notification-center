import "server-only";

import { z } from "zod";
import { authedProcedure, resolveActiveOrgId, ActiveOrgError } from "@root/lib/orpc";
import type { ORPCContext } from "@root/lib/orpc";
import { prismaDbClient } from "@root/lib/prisma";
import { auth } from "@root/lib/auth";
import { recordAdminActivity } from "@root/lib/audit";

const ROLES = ["owner", "admin", "member", "developer", "viewer"] as const;

const invitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.email(),
  role: z.string().nullable(),
  teamId: z.string().nullable(),
  status: z.string(),
  inviterId: z.string(),
  expiresAt: z.iso.datetime(),
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

export const list = authedProcedure
  .route({
    method: "GET",
    path: "/invitations",
    summary: "List pending invitations for the active organization",
    tags: ["invitations"],
  })
  .input(
    z.object({
      status: z.enum(["pending", "accepted", "rejected", "cancelled", "all"]).default("pending"),
      teamId: z.string().optional(),
    }),
  )
  .output(z.object({ invitations: z.array(invitationSchema) }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const rows = await prismaDbClient.invitation.findMany({
      where: {
        organizationId,
        status: input.status === "all" ? undefined : input.status,
        teamId: input.teamId,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      invitations: rows.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        email: r.email,
        role: r.role,
        teamId: r.teamId,
        status: r.status,
        inviterId: r.inviterId,
        expiresAt: r.expiresAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

export const send = authedProcedure
  .route({
    method: "POST",
    path: "/invitations",
    summary: "Invite one or more users to the active organization",
    description:
      "Creates Better Auth invitation rows. Accepts a single email or a list — each email becomes one `Invitation` row keyed to the active organization. Role + optional team scoping are applied at creation; the invited user picks them up on accept.",
    tags: ["invitations"],
  })
  .input(
    z.object({
      emails: z
        .array(z.email())
        .min(1)
        .max(50)
        .describe("Up to 50 recipient emails in a single bulk call."),
      role: z.enum(ROLES).default("member"),
      teamId: z.string().optional(),
      /** Resend an invitation that's already pending. */
      resend: z.boolean().default(false),
    }),
  )
  .output(
    z.object({
      created: z.array(invitationSchema),
      skipped: z.array(z.object({ email: z.email(), reason: z.string() })),
    }),
  )
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);

    const created: z.infer<typeof invitationSchema>[] = [];
    const skipped: Array<{ email: string; reason: string }> = [];

    for (const email of input.emails) {
      try {
        // Better Auth's `createInvitation` enforces dedupe / re-invite policy
        // (controlled by `organization.cancelPendingInvitationsOnReInvite`).
        // eslint-disable-next-line react-doctor/async-await-in-loop
        const result = await auth.api.createInvitation({
          headers: context.headers,
          body: {
            email,
            role: input.role,
            teamId: input.teamId,
            resend: input.resend,
            organizationId,
          },
        });
        const inv = result as {
          id: string;
          email: string;
          role: string | null;
          teamId?: string | null;
          status: string;
          inviterId: string;
          expiresAt: Date | string;
          createdAt?: Date | string;
        };
        created.push({
          id: inv.id,
          organizationId,
          email: inv.email,
          role: inv.role,
          teamId: inv.teamId ?? null,
          status: inv.status,
          inviterId: inv.inviterId,
          expiresAt: new Date(inv.expiresAt).toISOString(),
          createdAt: inv.createdAt
            ? new Date(inv.createdAt).toISOString()
            : new Date().toISOString(),
        });
      } catch (e) {
        skipped.push({ email, reason: e instanceof Error ? e.message : "unknown" });
      }
    }

    // Audit trail — one row per actor invocation, not per email, so a
    // single bulk-invite is correlatable.
    await recordAdminActivity({
      actor: { userId: context.user.id, email: context.user.email },
      action: "invitation.send",
      target: { type: "organization", id: organizationId, label: organizationId },
      organizationId,
      after: {
        emails: input.emails,
        role: input.role,
        teamId: input.teamId,
        createdCount: created.length,
        skippedCount: skipped.length,
      },
      severity: "INFO",
    });

    return { created, skipped };
  });

export const cancel = authedProcedure
  .route({
    method: "DELETE",
    path: "/invitations/{invitationId}",
    summary: "Cancel a pending invitation",
    tags: ["invitations"],
  })
  .input(z.object({ invitationId: z.string() }))
  .output(z.object({ success: z.boolean() }))
  .handler(async ({ context, input, errors }) => {
    const organizationId = await activeOrg(context, errors);
    const inv = await prismaDbClient.invitation.findUnique({ where: { id: input.invitationId } });
    if (!inv || inv.organizationId !== organizationId) throw errors.NOT_FOUND();
    await auth.api.cancelInvitation({
      headers: context.headers,
      body: { invitationId: input.invitationId },
    });
    await recordAdminActivity({
      actor: { userId: context.user.id, email: context.user.email },
      action: "invitation.cancel",
      target: { type: "invitation", id: inv.id, label: inv.email },
      organizationId,
      severity: "INFO",
    });
    return { success: true };
  });
