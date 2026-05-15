import "server-only";

import { auth } from "@root/lib/auth";
import { prismaDbClient } from "@root/lib/prisma";
import type { ORPCContext } from "./context";

interface SessionWithActiveOrg {
  activeOrganizationId?: string | null;
  token?: string;
}

/**
 * Resolve the caller's active organization.
 *
 * Behaviour:
 *   1. If `session.activeOrganizationId` is already set → return it.
 *   2. Otherwise look up the user's `Member` rows and pin the first
 *      organization onto the session (`auth.api.setActiveOrganization`).
 *      Future calls then hit the fast path.
 *   3. If the user has no memberships at all → throw NOT_FOUND so the
 *      caller can surface a "create your first org" UX.
 *
 * Why fallback? Better Auth doesn't auto-attach an active org on sign-in —
 * `activeOrganizationId` is set lazily by `setActive` or by the first
 * `getFullOrganization` call. New sessions therefore start with `null`,
 * which broke every org-scoped procedure (`apiKeys.list`, `teams.list`, …).
 */
export async function resolveActiveOrgId(context: ORPCContext): Promise<string> {
  const session = context.session?.session as SessionWithActiveOrg | undefined;
  const fromSession = session?.activeOrganizationId;
  if (fromSession) return fromSession;

  const user = context.session?.user;
  if (!user) {
    throw new ActiveOrgError("UNAUTHORIZED", "Not signed in.");
  }

  const member = await prismaDbClient.member.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  if (!member) {
    throw new ActiveOrgError(
      "NOT_FOUND",
      "You aren't a member of any organization yet. Create one to continue.",
    );
  }

  // Pin it onto the session so the next request doesn't pay the lookup cost.
  try {
    await auth.api.setActiveOrganization({
      headers: context.headers,
      body: { organizationId: member.organizationId },
    });
  } catch {
    // Non-fatal: the request still succeeds with the org we just resolved.
  }

  return member.organizationId;
}

/** Tagged error so procedures can map it to the right oRPC error code. */
export class ActiveOrgError extends Error {
  constructor(
    public readonly kind: "UNAUTHORIZED" | "NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "ActiveOrgError";
  }
}
